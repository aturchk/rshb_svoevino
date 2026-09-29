#!/usr/bin/env python3
"""Build a self-contained, hash-verified offline inference release."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

MODEL_ID = "google/siglip2-base-patch16-384"
MODEL_REVISION = "f775b65a79762255128c981547af89addcfe0f88"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def checked_reference(root: Path, value: str, expected_sha256: str) -> tuple[Path, Path]:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts or not value:
        raise ValueError(f"Unsafe gallery path: {value}")
    source = (root / relative).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError(f"Gallery image is missing or escapes data root: {value}")
    if sha256(source) != expected_sha256:
        raise ValueError(f"SHA-256 mismatch: {value}")
    return source, relative


def compatible_cache(cache_dir: Path, gallery_rows: list[dict], adapter_sha256: str,
                     *, model_id: str, model_revision: str, precision: str,
                     batch_size: int, reference_view_mode: str) -> tuple[Path, Path]:
    slugs = [row["slug"] for row in gallery_rows]
    matches: list[tuple[Path, Path]] = []
    for metadata_path in sorted(cache_dir.glob("*.json")):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(metadata, dict):
            continue
        tensor_path = metadata_path.with_suffix(".safetensors")
        if not tensor_path.is_file():
            continue
        if any((metadata.get("format") != 3,
                metadata.get("model_id") != model_id,
                metadata.get("resolved_revision") != model_revision,
                metadata.get("precision") != precision,
                metadata.get("batch_size") != batch_size,
                metadata.get("adapter_sha256") != adapter_sha256,
                metadata.get("reference_view_mode") != reference_view_mode,
                metadata.get("views_per_reference") != {
                    "full": 1, "full-label": 2, "full-mid-label": 3,
                }[reference_view_mode],
                metadata.get("slugs") != slugs)):
            continue
        payload = {
            "format": metadata["format"],
            "model_id": model_id,
            "revision": model_revision,
            "precision": precision,
            "batch_size": batch_size,
            "torch": metadata.get("torch"),
            "transformers": metadata.get("transformers"),
            "processor_fingerprint": metadata.get("processor_fingerprint"),
            "attn_implementation": metadata.get("attn_implementation"),
            "max_num_patches": metadata.get("max_num_patches"),
            "decode_max_side": metadata.get("decode_max_side"),
            "adapter_sha256": adapter_sha256,
            "items": [{"slug": row["slug"], "image_sha256": row["image_sha256"]}
                      for row in gallery_rows],
        }
        if reference_view_mode != "full":
            payload["reference_view_mode"] = reference_view_mode
            payload["view_transform_version"] = metadata.get("view_transform_version")
        fingerprint = hashlib.sha256(json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")).hexdigest()
        if fingerprint == metadata.get("fingerprint"):
            matches.append((tensor_path, metadata_path))
    if len(matches) != 1:
        raise ValueError(
            "Expected exactly one compatible SigLIP index for this gallery, adapter and "
            f"runtime configuration; found {len(matches)} in {cache_dir}. "
            "Build it on the target GPU using ml/scripts/build_gpu_release.sh."
        )
    return matches[0]


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
    parser.add_argument("--model-id", default=MODEL_ID)
    parser.add_argument("--model-revision", default=MODEL_REVISION)
    parser.add_argument("--precision", default="float16")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--reference-view-mode", choices=("full", "full-label", "full-mid-label"),
                        default="full-label")
    parser.add_argument("--output", type=Path, default=Path("work/release"))
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--verify-only", action="store_true",
                        help="Validate all inputs without copying the large model release")
    args = parser.parse_args()

    root = args.root.resolve()
    output = args.output.resolve()
    if output.exists() and not args.verify_only:
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
    if not gallery_rows or len({row["slug"] for row in gallery_rows}) != len(gallery_rows):
        raise ValueError("Gallery is empty or contains duplicate slugs")
    gallery_digest = hashlib.sha256(json.dumps(
        ordered_images, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()
    adapter_metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    if adapter_metadata.get("gallery_sha256") != gallery_digest:
        raise ValueError("Adapter was trained against a different ordered gallery")
    if (adapter_metadata.get("model_id") != args.model_id or
            adapter_metadata.get("resolved_revision") != args.model_revision):
        raise ValueError("Adapter model ID/revision does not match the release")

    references: dict[Path, Path] = {}
    for row in gallery_rows:
        for path_key, hash_key in (("image_path", "image_sha256"),
                                   ("source_image_path", "source_image_sha256")):
            if (path_key in row) != (hash_key in row):
                raise ValueError(f"Incomplete image provenance for {row['slug']}")
            if path_key not in row:
                continue
            source, relative = checked_reference(root, row[path_key], row[hash_key])
            references[relative] = source

    tensor_path, metadata_path = compatible_cache(
        cache_dir, gallery_rows, sha256(adapter_path), model_id=args.model_id,
        model_revision=args.model_revision, precision=args.precision,
        batch_size=args.batch_size, reference_view_mode=args.reference_view_mode,
    )
    model_snapshot = (model_dir / "hub" /
                      f"models--{args.model_id.replace('/', '--')}" /
                      "snapshots" / args.model_revision)
    for name in ("config.json", "preprocessor_config.json", "model.safetensors"):
        if not (model_snapshot / name).is_file():
            raise FileNotFoundError(f"Pinned base model snapshot is incomplete: {model_snapshot / name}")
    if (model_snapshot / "model.safetensors").stat().st_size < 1_000_000:
        raise ValueError("Pinned base model weights are incomplete or an LFS pointer")

    if args.verify_only:
        print(json.dumps({"status": "verified", "galleryReferences": len(gallery_rows),
                          "verifiedImages": len(references),
                          "indexFingerprint": json.loads(metadata_path.read_text(
                              encoding="utf-8"))["fingerprint"],
                          "adapterSha256": sha256(adapter_path),
                          "modelRevision": args.model_revision}, ensure_ascii=False))
        return

    copy_file(gallery_path, output / "gallery-reviewed.jsonl")
    copy_file(adapter_path, output / "siglip2-site-label-adapter.safetensors")
    copy_file(sidecar, output / "siglip2-site-label-adapter.safetensors.json")
    copy_file(tensor_path, output / "siglip-cache" / tensor_path.name)
    copy_file(metadata_path, output / "siglip-cache" / metadata_path.name)
    shutil.copytree(model_dir, output / "huggingface")

    for relative, source in references.items():
        copy_file(source, output / relative)

    files = {}
    for path in sorted(item for item in output.rglob("*") if item.is_file()):
        files[path.relative_to(output).as_posix()] = {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
    manifest = {
        "format": 1,
        "releaseId": args.release_id,
        "galleryReferences": len(gallery_rows),
        "gallerySourceSha256": sha256(gallery_path),
        "adapterSha256": sha256(adapter_path),
        "indexFingerprint": json.loads(metadata_path.read_text(encoding="utf-8"))["fingerprint"],
        "modelId": args.model_id,
        "modelRevision": args.model_revision,
        "files": files,
    }
    manifest_path = output / "release-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(output), "files": len(files),
                      "references": len(gallery_rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
