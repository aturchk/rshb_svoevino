#!/usr/bin/env python3
"""Build a self-contained, hash-verified offline inference release."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--gallery", type=Path,
                        default=Path("dataset/vino-svoe/gallery-reviewed-candidates.jsonl"))
    parser.add_argument("--adapter", type=Path,
                        default=Path("ml/models/siglip2-site-label-adapter.safetensors"))
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True,
                        help="Hugging Face cache root containing the pinned snapshot")
    parser.add_argument("--output", type=Path, default=Path("work/release"))
    parser.add_argument("--release-id", required=True)
    args = parser.parse_args()

    root = args.root.resolve()
    output = args.output.resolve()
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing release: {output}")

    gallery_path = (root / args.gallery).resolve()
    adapter_path = (root / args.adapter).resolve()
    cache_dir = (root / args.cache_dir).resolve()
    model_dir = (root / args.model_dir).resolve()
    for path in (gallery_path, adapter_path, cache_dir, model_dir):
        if not path.exists():
            raise FileNotFoundError(path)

    sidecar = adapter_path.with_suffix(adapter_path.suffix + ".json")
    if not sidecar.is_file():
        raise FileNotFoundError(sidecar)
    gallery_rows = [json.loads(line) for line in gallery_path.read_text(encoding="utf-8").splitlines()
                    if line.strip()]
    ordered_images = [{"slug": row["slug"], "sha256": row["image_sha256"]}
                      for row in gallery_rows]
    gallery_digest = hashlib.sha256(json.dumps(
        ordered_images, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()
    adapter_metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    if adapter_metadata.get("gallery_sha256") != gallery_digest:
        raise ValueError("Adapter was trained against a different ordered gallery")

    copy_file(gallery_path, output / "gallery-reviewed.jsonl")
    copy_file(adapter_path, output / "siglip2-site-label-adapter.safetensors")
    copy_file(sidecar, output / "siglip2-site-label-adapter.safetensors.json")
    shutil.copytree(cache_dir, output / "siglip-cache")
    shutil.copytree(model_dir, output / "huggingface")

    references = 0
    for row in gallery_rows:
        relative = Path(row["image_path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Unsafe gallery path: {relative}")
        source = (root / relative).resolve()
        if sha256(source) != row["image_sha256"]:
            raise ValueError(f"SHA-256 mismatch: {relative}")
        copy_file(source, output / relative)
        references += 1

    files = {}
    for path in sorted(item for item in output.rglob("*") if item.is_file()):
        files[path.relative_to(output).as_posix()] = {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
    manifest = {
        "format": 1,
        "releaseId": args.release_id,
        "galleryReferences": references,
        "gallerySourceSha256": sha256(gallery_path),
        "files": files,
    }
    manifest_path = output / "release-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(output), "files": len(files),
                      "references": references}, ensure_ascii=False))


if __name__ == "__main__":
    main()
