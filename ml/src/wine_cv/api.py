"""Production HTTP adapter for the retrieval pipeline.

The organizer endpoint intentionally stays minimal. The product endpoint exposes
the ranking and raw similarities, but never presents an uncalibrated cosine score
as a probability.
"""

from __future__ import annotations

import asyncio
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile

from .catalog import read_gallery
from .pipelines import make_pipeline


SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".webp", ".png", ".jfif"}


def create_app(
    gallery_path: Path,
    pipeline_name: str,
    data_root: Path = Path("."),
    pipeline_options: dict | None = None,
    *,
    max_upload_bytes: int = 12 * 1024 * 1024,
    product_top_k: int = 5,
    thresholds: dict[str, float] | None = None,
    threshold_version: str | None = None,
) -> FastAPI:
    if max_upload_bytes < 1:
        raise ValueError("max_upload_bytes must be positive")
    if product_top_k < 2:
        raise ValueError("product_top_k must be at least 2")
    if thresholds is not None:
        required = {"not_found_score", "matched_score", "matched_margin"}
        if set(thresholds) != required:
            raise ValueError(f"thresholds must contain exactly {sorted(required)}")
        if not threshold_version:
            raise ValueError("threshold_version is required with calibrated thresholds")
        if thresholds["not_found_score"] > thresholds["matched_score"]:
            raise ValueError("not_found_score must not exceed matched_score")
        if thresholds["matched_margin"] < 0:
            raise ValueError("matched_margin must be non-negative")

    pipeline = make_pipeline(pipeline_name, **(pipeline_options or {}))
    gallery = read_gallery(gallery_path, data_root)
    pipeline.fit(gallery)
    if hasattr(pipeline, "synchronize"):
        pipeline.synchronize()

    runtime = pipeline.metadata() if hasattr(pipeline, "metadata") else {}
    model_version = {
        "pipeline": pipeline_name,
        "modelId": runtime.get("model_id"),
        "revision": runtime.get("resolved_revision"),
        "adapterSha256": runtime.get("adapter_sha256"),
        "gallerySize": len(gallery),
    }
    app = FastAPI(title="Svoe Vino ML API", version="1.0.0")
    inference_lock = asyncio.Lock()

    def classify(top1: float, margin: float) -> str:
        if thresholds is None:
            return "low_confidence"
        if top1 < thresholds["not_found_score"]:
            return "not_found"
        if top1 >= thresholds["matched_score"] and margin >= thresholds["matched_margin"]:
            return "matched"
        return "low_confidence"

    async def rank_upload(image: UploadFile, top_k: int):
        suffix = Path(image.filename or "").suffix.lower()
        if suffix not in SUPPORTED_SUFFIXES:
            raise HTTPException(status_code=415, detail="Unsupported image extension")
        data = await image.read(max_upload_bytes + 1)
        if not data:
            raise HTTPException(status_code=400, detail="Image is empty")
        if len(data) > max_upload_bytes:
            raise HTTPException(status_code=413, detail="Image is too large")

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            temporary.write(data)
            temporary_path = Path(temporary.name)
        started = time.perf_counter()
        try:
            # Keep one model invocation in flight per worker. CUDA pipelines are
            # stateful, while the thread handoff keeps health checks responsive.
            async with inference_lock:
                ranked = await asyncio.to_thread(
                    pipeline.predict, temporary_path, top_k=top_k
                )
                if hasattr(pipeline, "synchronize"):
                    await asyncio.to_thread(pipeline.synchronize)
        except (OSError, ValueError) as error:
            raise HTTPException(status_code=400, detail="Cannot decode image") from error
        finally:
            temporary_path.unlink(missing_ok=True)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ranked, latency_ms

    @app.get("/health/live")
    async def live():
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready():
        return {"status": "ready", "gallerySize": len(gallery)}

    @app.get("/v1/metadata")
    async def metadata():
        return {
            "modelVersion": model_version,
            "thresholdVersion": threshold_version,
            "calibrated": thresholds is not None,
        }

    @app.post("/v1/retrieve")
    async def retrieve(image: UploadFile = File(...)):
        ranked, latency_ms = await rank_upload(image, product_top_k)
        candidates = [{"slug": item.slug, "score": item.score} for item in ranked]
        top1 = candidates[0] if candidates else None
        margin = (
            candidates[0]["score"] - candidates[1]["score"]
            if len(candidates) > 1 else None
        )
        status = classify(top1["score"], margin or 0.0) if top1 else "not_found"
        return {
            "status": status,
            "top1": top1,
            "top5": candidates,
            "confidence": {
                "top1": top1["score"] if top1 else None,
                "margin": margin,
            },
            "latencyMs": latency_ms,
            "calibrated": thresholds is not None,
            "modelVersion": model_version,
            "thresholdVersion": threshold_version,
        }

    @app.post("/v1/eval/predict")
    async def predict(image: UploadFile = File(...)):
        ranked, _ = await rank_upload(image, 1)
        return {"slug": ranked[0].slug if ranked else None}

    return app
