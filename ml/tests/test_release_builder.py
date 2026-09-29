"""Offline release preflight must reject stale or unsafe artifacts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_release.py"
SPEC = importlib.util.spec_from_file_location("build_release", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseBuilderTests(unittest.TestCase):
    def test_cache_accepts_matching_gallery_adapter_and_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            gallery = [{"slug": "wine-a", "image_sha256": "a" * 64}]
            adapter_sha = "b" * 64
            payload = {
                "format": 3,
                "model_id": release.MODEL_ID,
                "revision": release.MODEL_REVISION,
                "precision": "float16",
                "batch_size": 32,
                "torch": "2.8.0+cu128",
                "transformers": "5.17.0",
                "processor_fingerprint": "c" * 64,
                "attn_implementation": "sdpa",
                "max_num_patches": None,
                "decode_max_side": 1536,
                "adapter_sha256": adapter_sha,
                "items": [{"slug": "wine-a", "image_sha256": "a" * 64}],
                "reference_view_mode": "full-label",
                "view_transform_version": "test-transform-v1",
            }
            fingerprint = hashlib.sha256(json.dumps(
                payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")).hexdigest()
            metadata = {
                "fingerprint": fingerprint,
                "slugs": ["wine-a"],
                "resolved_revision": release.MODEL_REVISION,
                "reference_view_mode": "full-label",
                "views_per_reference": 2,
                "view_transform_version": "test-transform-v1",
                **{key: value for key, value in payload.items() if key not in {
                    "revision", "items", "reference_view_mode", "view_transform_version"}},
            }
            metadata_path = cache / "index.json"
            tensor_path = cache / "index.safetensors"
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            tensor_path.write_bytes(b"fixture")
            options = dict(model_id=release.MODEL_ID,
                           model_revision=release.MODEL_REVISION,
                           precision="float16", batch_size=32,
                           reference_view_mode="full-label")
            self.assertEqual(
                release.compatible_cache(cache, gallery, adapter_sha, **options),
                (tensor_path, metadata_path),
            )
            with self.assertRaisesRegex(ValueError, "exactly one compatible"):
                release.compatible_cache(cache, gallery, "d" * 64, **options)
            with self.assertRaisesRegex(ValueError, "exactly one compatible"):
                release.compatible_cache(cache, [{**gallery[0], "image_sha256": "e" * 64}],
                                         adapter_sha, **options)
            with self.assertRaisesRegex(ValueError, "exactly one compatible"):
                release.compatible_cache(cache, gallery, adapter_sha,
                                         **{**options, "batch_size": 8})

    def test_reference_path_cannot_escape_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            image = root / "image.webp"
            image.write_bytes(b"image")
            digest = release.sha256(image)
            self.assertEqual(release.checked_reference(root, "image.webp", digest),
                             (image, Path("image.webp")))
            with self.assertRaisesRegex(ValueError, "Unsafe gallery path"):
                release.checked_reference(root, "../image.webp", digest)


if __name__ == "__main__":
    unittest.main()
