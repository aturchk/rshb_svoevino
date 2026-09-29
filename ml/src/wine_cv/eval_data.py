"""Validate sealed evaluation inputs and organizer-compatible predictions."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
from pathlib import Path

from PIL import Image

from .catalog import IMAGE_EXTENSIONS, catalog_rows


QUERY_ID = re.compile(r"^[A-Za-z0-9._-]+$")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_image(images_dir: Path, value: str) -> Path:
    relative = Path(value)
    if not value or relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"unsafe image_path: {value!r}")
    path = (images_dir / relative).resolve()
    if not path.is_relative_to(images_dir.resolve()):
        raise ValueError(f"image_path escapes images directory: {value!r}")
    return path


def read_query_manifest(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        if reader.fieldnames != ["query_id", "image_path"]:
            raise ValueError("manifest header must be query_id<TAB>image_path")
        return list(reader)


def validate_eval_package(manifest: Path, images_dir: Path) -> dict:
    rows = read_query_manifest(manifest)
    if not rows:
        raise ValueError("evaluation manifest is empty")
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    first_path_by_hash: dict[str, str] = {}
    duplicate_content: list[dict[str, str]] = []
    records: list[dict] = []
    package_digest = hashlib.sha256()

    for line, row in enumerate(rows, start=2):
        query_id = row["query_id"].strip()
        image_value = row["image_path"].strip()
        if not QUERY_ID.fullmatch(query_id):
            raise ValueError(f"line {line}: invalid query_id: {query_id!r}")
        if query_id in seen_ids:
            raise ValueError(f"line {line}: duplicate query_id: {query_id}")
        if image_value in seen_paths:
            raise ValueError(f"line {line}: duplicate image_path: {image_value}")
        image = _safe_image(images_dir, image_value)
        if image.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"line {line}: unsupported image extension: {image_value}")
        if not image.is_file():
            raise ValueError(f"line {line}: image not found: {image_value}")
        digest = _sha256(image)
        if digest in first_path_by_hash:
            duplicate_content.append({
                "image_path": image_value,
                "same_as": first_path_by_hash[digest],
                "image_sha256": digest,
            })
        try:
            with Image.open(image) as opened:
                opened.verify()
            with Image.open(image) as opened:
                width, height = opened.size
        except (OSError, ValueError) as error:
            raise ValueError(f"line {line}: cannot decode image: {image_value}") from error
        if width < 1 or height < 1:
            raise ValueError(f"line {line}: invalid image dimensions: {image_value}")
        record = {
            "query_id": query_id,
            "image_path": image_value,
            "image_sha256": digest,
            "width": width,
            "height": height,
        }
        records.append(record)
        package_digest.update(
            f"{query_id}\t{image_value}\t{digest}\t{width}x{height}\n".encode()
        )
        seen_ids.add(query_id)
        seen_paths.add(image_value)
        first_path_by_hash.setdefault(digest, image_value)

    return {
        "schema_version": 1,
        "valid": True,
        "queries": len(records),
        "manifest_sha256": _sha256(manifest),
        "package_sha256": package_digest.hexdigest(),
        "duplicate_content_images": len(duplicate_content),
        "warnings": ([{"kind": "duplicate_image_content", **item}
                      for item in duplicate_content]),
        "records": records,
    }


def validate_eval_predictions(
    manifest: Path,
    images_dir: Path,
    predictions: Path,
    catalog_csv: Path,
) -> dict:
    package = validate_eval_package(manifest, images_dir)
    expected = package["records"]
    catalog_slugs = {row["Slug"].strip() for row in catalog_rows(catalog_csv)}
    parsed: list[dict] = []
    with predictions.open(encoding="utf-8") as file:
        for line, raw in enumerate(file, start=1):
            if not raw.strip():
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as error:
                raise ValueError(f"predictions line {line}: invalid JSON") from error
            if not isinstance(row, dict):
                raise ValueError(f"predictions line {line}: expected JSON object")
            parsed.append(row)
    if len(parsed) != len(expected):
        raise ValueError(
            f"prediction count {len(parsed)} does not match query count {len(expected)}"
        )

    latencies: list[float] = []
    null_predictions = 0
    for line, (actual, query) in enumerate(zip(parsed, expected, strict=True), start=1):
        for key in ("query_id", "image_path", "image_sha256"):
            if actual.get(key) != query[key]:
                raise ValueError(
                    f"predictions line {line}: {key} does not match sealed input"
                )
        slug = actual.get("predicted_slug")
        if slug is None:
            null_predictions += 1
        elif not isinstance(slug, str) or slug not in catalog_slugs:
            raise ValueError(f"predictions line {line}: unknown predicted_slug: {slug!r}")
        latency = actual.get("latency_ms")
        if not isinstance(latency, (int, float)) or isinstance(latency, bool):
            raise ValueError(f"predictions line {line}: latency_ms must be numeric")
        if not math.isfinite(latency) or latency < 0:
            raise ValueError(f"predictions line {line}: latency_ms must be finite and non-negative")
        latencies.append(float(latency))

    ordered = sorted(latencies)
    p95_index = max(0, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "schema_version": 1,
        "valid": True,
        "queries": len(expected),
        "null_predictions": null_predictions,
        "catalog_slug_count": len(catalog_slugs),
        "mean_latency_ms": round(sum(latencies) / len(latencies), 2),
        "p95_latency_ms": round(ordered[p95_index], 2),
        "within_3s_rate": round(sum(value <= 3000 for value in latencies) / len(latencies), 6),
        "input_package_sha256": package["package_sha256"],
        "predictions_sha256": _sha256(predictions),
        "accuracy_available": False,
        "warning": "No answer labels were supplied; this receipt validates transport and integrity only.",
    }
