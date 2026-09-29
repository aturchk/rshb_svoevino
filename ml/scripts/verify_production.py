#!/usr/bin/env python3
"""Fail closed if the tracked production gallery or adapter has drifted."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ADAPTER_SHA256 = "bde343102f06d5e4fe02df953ecce622e2725deb800a0fa57eb34b99d3bf9701"
SIDECAR_SHA256 = "547b6a41d41c79a064e82a720e30bca33df63fb3d6a6374d9020ccec6d36dfa3"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checked_path(root: Path, value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Unsafe gallery path: {value}")
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(f"Gallery path escapes repository: {value}")
    return resolved


def verify(root: Path) -> dict[str, object]:
    root = root.resolve()
    gallery_path = root / "dataset/vino-svoe/gallery-reviewed-candidates.jsonl"
    adapter_path = root / "ml/models/siglip2-site-label-adapter.safetensors"
    sidecar_path = adapter_path.with_suffix(adapter_path.suffix + ".json")
    if sha256(adapter_path) != ADAPTER_SHA256:
        raise ValueError("Production adapter SHA-256 mismatch")
    if sha256(sidecar_path) != SIDECAR_SHA256:
        raise ValueError("Production adapter sidecar SHA-256 mismatch")
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))

    slugs: set[str] = set()
    ordered_images: list[dict[str, str]] = []
    verified_paths: dict[Path, str] = {}
    with gallery_path.open(encoding="utf-8") as gallery:
        for number, line in enumerate(gallery, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            slug = row["slug"]
            if slug in slugs:
                raise ValueError(f"Duplicate gallery slug at line {number}: {slug}")
            slugs.add(slug)
            ordered_images.append({"slug": slug, "sha256": row["image_sha256"]})
            for path_key, hash_key in (("image_path", "image_sha256"),
                                       ("source_image_path", "source_image_sha256")):
                if (path_key in row) != (hash_key in row):
                    raise ValueError(f"Incomplete image provenance at line {number}")
                if path_key not in row:
                    continue  # legacy fallback references have no site-source image
                path = checked_path(root, row[path_key])
                if path not in verified_paths:
                    verified_paths[path] = sha256(path)
                actual = verified_paths[path]
                if actual != row[hash_key]:
                    raise ValueError(f"Image SHA-256 mismatch at line {number}: {path}")

    digest = hashlib.sha256(json.dumps(
        ordered_images, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()
    if len(slugs) != sidecar["gallery_size"] or digest != sidecar["gallery_sha256"]:
        raise ValueError("Gallery order/content does not match the trained adapter")
    return {"gallery_rows": len(slugs), "verified_images": len(verified_paths),
            "gallery_digest": digest, "adapter_sha256": ADAPTER_SHA256}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    args = parser.parse_args()
    print(json.dumps(verify(args.root), ensure_ascii=False))


if __name__ == "__main__":
    main()
