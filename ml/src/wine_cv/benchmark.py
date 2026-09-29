"""Run identical queries through any registered pipeline and report honest metrics."""

from __future__ import annotations

import csv
import hashlib
import json
import statistics
import time
from pathlib import Path

from .catalog import read_gallery, write_jsonl
from .pipelines import make_pipeline


def read_queries(manifest: Path, images_dir: Path) -> list[tuple[str, Path, str]]:
    root = images_dir.resolve()
    with manifest.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        if not {"query_id", "image_path"}.issubset(reader.fieldnames or []):
            raise ValueError("Query manifest needs query_id and image_path columns")
        rows = []
        seen = set()
        for row in reader:
            query_id, relative = row["query_id"], row["image_path"]
            if not query_id or query_id in seen:
                raise ValueError(f"Empty or duplicate query_id: {query_id}")
            seen.add(query_id)
            path = (root / relative).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError(f"Invalid query image_path: {relative}")
            rows.append((query_id, path, relative))
    if not rows:
        raise ValueError("Query manifest is empty")
    return rows


def read_labels(path: Path) -> dict[str, str]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        if not {"query_id", "slug"}.issubset(reader.fieldnames or []):
            raise ValueError("Labels need query_id and slug columns")
        labels = {}
        for row in reader:
            if not row["query_id"] or not row["slug"] or row["query_id"] in labels:
                raise ValueError("Labels contain an empty value or duplicate query_id")
            labels[row["query_id"]] = row["slug"]
    return labels


def run_benchmark(gallery_path: Path, manifest: Path, images_dir: Path,
                  pipeline_name: str, output: Path, summary_path: Path,
                  labels_path: Path | None = None, data_root: Path = Path("."),
                  pipeline_options: dict | None = None, top_k: int = 20,
                  warmup: int = 1) -> dict:
    if top_k < 5:
        raise ValueError("top_k must be at least 5")
    if warmup < 0:
        raise ValueError("warmup cannot be negative")
    gallery = read_gallery(gallery_path, data_root)
    queries = read_queries(manifest, images_dir)
    pipeline = make_pipeline(pipeline_name, **(pipeline_options or {}))
    start = time.perf_counter()
    pipeline.fit(gallery)
    if hasattr(pipeline, "synchronize"):
        pipeline.synchronize()
    build_ms = round((time.perf_counter() - start) * 1000, 2)
    labels = read_labels(labels_path) if labels_path else None
    if labels is not None and set(labels) != {query_id for query_id, _, _ in queries}:
        raise ValueError("Labels must contain exactly the query IDs in the manifest")
    if labels is not None:
        gallery_slugs = {item["slug"] for item in gallery}
        unknown = sorted(set(labels.values()) - gallery_slugs)
        if unknown:
            raise ValueError(f"Labels contain slugs absent from the working gallery: {unknown[:5]}")
    for _ in range(warmup):
        pipeline.predict(queries[0][1], top_k=1)
    if hasattr(pipeline, "synchronize"):
        pipeline.synchronize()
    records = []
    for query_id, path, relative in queries:
        if hasattr(pipeline, "synchronize"):
            pipeline.synchronize()
        start = time.perf_counter()
        top = pipeline.predict(path, top_k=top_k)
        if hasattr(pipeline, "synchronize"):
            pipeline.synchronize()
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        record = {
            "query_id": query_id,
            "image_path": relative,
            "image_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "predicted_slug": top[0].slug if top else None,
            "latency_ms": latency_ms,
            "top5": [{"slug": candidate.slug, "score": round(candidate.score, 6)} for candidate in top[:5]],
            "ranking": [{"slug": candidate.slug, "score": round(candidate.score, 6)} for candidate in top],
            "score_margin": round(top[0].score - top[1].score, 6) if len(top) > 1 else None,
        }
        if labels is not None:
            record["true_slug"] = labels[query_id]
        records.append(record)
    write_jsonl(output, records)
    latencies = [record["latency_ms"] for record in records]
    sorted_latencies = sorted(latencies)
    p95 = sorted_latencies[max(0, (95 * len(latencies) + 99) // 100 - 1)]
    summary = {
        "pipeline": pipeline_name,
        "gallery_size": len(gallery),
        "query_count": len(records),
        "index_build_ms": build_ms,
        "mean_latency_ms": round(statistics.mean(latencies), 2),
        "p50_latency_ms": round(statistics.median(latencies), 2),
        "p95_latency_ms": p95,
        "within_3s_rate": round(sum(x <= 3000 for x in latencies) / len(latencies), 6),
        "labels_available": labels is not None,
        "ranking_depth": top_k,
        "warmup_iterations": warmup,
        "gallery_sha256": hashlib.sha256(gallery_path.read_bytes()).hexdigest(),
        "query_manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
    }
    if labels_path:
        summary["labels_sha256"] = hashlib.sha256(labels_path.read_bytes()).hexdigest()
    if hasattr(pipeline, "metadata"):
        summary["pipeline_runtime"] = pipeline.metadata()
    if labels is not None:
        top1_hits = sum(record["predicted_slug"] == record["true_slug"] for record in records)
        top5_hits = sum(record["true_slug"] in [x["slug"] for x in record["top5"]] for record in records)
        top20_hits = sum(record["true_slug"] in [x["slug"] for x in record["ranking"][:20]]
                         for record in records) if top_k >= 20 else None
        summary.update({
            "top1_accuracy": round(top1_hits / len(records), 6),
            "micro_f1_at_1": round(top1_hits / len(records), 6),
            "recall_at_5": round(top5_hits / len(records), 6),
            # Set-based F1 for a five-item recommendation set and one true item.
            "mean_f1_at_5": round(statistics.mean(
                2 / (len(record["top5"]) + 1) if record["true_slug"] in
                [x["slug"] for x in record["top5"]] else 0 for record in records), 6),
        })
        if top20_hits is not None:
            summary["recall_at_20"] = round(top20_hits / len(records), 6)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary
