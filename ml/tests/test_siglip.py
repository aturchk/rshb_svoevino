"""Focused tests for the optional SigLIP 2 retrieval backend."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from wine_cv.siglip import CACHE_FORMAT_VERSION, Siglip2Pipeline


class _FakeEmbeddings:
    shape = (1, 2)

    def contiguous(self):
        return self

    def to(self, _device):
        return self


class _CacheTestPipeline(Siglip2Pipeline):
    def __init__(self, *args, cache_read_error=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache_read_error = cache_read_error or RuntimeError("cache read attempted")
        self.load_calls = 0
        self.encode_calls = 0

    def _load_backend(self):
        self._resolved_revision = "immutable-revision"
        self._precision = "float32"
        self._torch_version = "2.5.1"
        self._cuda_runtime = None
        self._cuda_device_name = None
        self._transformers_version = "5.17.0"
        self._processor_fingerprint = "processor-config-hash"
        self._is_naflex = False
        self._expected_dimension = 2
        self._device = "cpu"
        self._torch = None

    def _load_file(self, *_args, **_kwargs):
        self.load_calls += 1
        raise self.cache_read_error

    @staticmethod
    def _save_file(_tensors, path):
        Path(path).write_bytes(b"replacement-cache")

    def _encode_paths(self, _paths, return_cpu=True):
        self.encode_calls += 1
        return _FakeEmbeddings()


class SiglipCacheTests(unittest.TestCase):
    @staticmethod
    def _fingerprint_pipeline(attn_implementation: str) -> Siglip2Pipeline:
        pipeline = Siglip2Pipeline(attn_implementation=attn_implementation)
        pipeline._resolved_revision = "immutable-revision"
        pipeline._precision = "float16"
        pipeline._torch_version = "2.5.1+cu124"
        pipeline._transformers_version = "5.17.0"
        pipeline._processor_fingerprint = "processor-config-hash"
        pipeline._is_naflex = False
        return pipeline

    def test_attention_implementation_is_part_of_cache_fingerprint(self):
        gallery = [{
            "slug": "wine",
            "image_path": "unused-because-a-digest-is-supplied.jpg",
            "image_sha256": "0" * 64,
        }]
        sdpa = self._fingerprint_pipeline("sdpa")._fingerprint(gallery)
        eager = self._fingerprint_pipeline("eager")._fingerprint(gallery)
        self.assertNotEqual(sdpa, eager)

    def test_torch_version_is_part_of_cache_fingerprint(self):
        gallery = [{
            "slug": "wine",
            "image_path": "unused-because-a-digest-is-supplied.jpg",
            "image_sha256": "0" * 64,
        }]
        first = self._fingerprint_pipeline("sdpa")
        second = self._fingerprint_pipeline("sdpa")
        second._torch_version = "2.6.0+cu126"
        self.assertNotEqual(first._fingerprint(gallery), second._fingerprint(gallery))

    def test_off_cache_policy_does_not_read_an_existing_cache(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image_path = root / "reference.png"
            Image.new("RGB", (8, 8), "red").save(image_path)
            gallery = [{"slug": "wine", "image_path": str(image_path)}]
            pipeline = _CacheTestPipeline(cache_policy="off", cache_dir=root / "cache")
            pipeline._load_backend()
            gallery[0]["image_sha256"] = pipeline._image_digest(gallery[0])
            fingerprint = pipeline._fingerprint(gallery)
            tensor_path, metadata_path = pipeline._cache_files(fingerprint)
            tensor_path.parent.mkdir(parents=True)
            tensor_path.write_bytes(b"existing-cache")
            metadata_path.write_text(
                '{"format": ' + str(CACHE_FORMAT_VERSION) + ', "fingerprint": "' + fingerprint +
                '", "slugs": ["wine"]}\n',
                encoding="utf-8",
            )

            pipeline.fit(gallery)

            self.assertFalse(pipeline.cache_hit)
            self.assertEqual(pipeline.load_calls, 0)
            self.assertEqual(pipeline.encode_calls, 1)
            self.assertIsInstance(pipeline.embeddings, _FakeEmbeddings)

    def test_auto_rebuilds_a_corrupt_cache(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image_path = root / "reference.png"
            Image.new("RGB", (8, 8), "red").save(image_path)
            gallery = [{"slug": "wine", "image_path": str(image_path)}]
            pipeline = _CacheTestPipeline(cache_policy="auto", cache_dir=root / "cache")
            pipeline._load_backend()
            gallery[0]["image_sha256"] = pipeline._image_digest(gallery[0])
            fingerprint = pipeline._fingerprint(gallery)
            tensor_path, metadata_path = pipeline._cache_files(fingerprint)
            tensor_path.parent.mkdir(parents=True)
            tensor_path.write_bytes(b"corrupt-cache")
            metadata_path.write_text(
                '{"format": ' + str(CACHE_FORMAT_VERSION) + ', "fingerprint": "' + fingerprint +
                '", "slugs": ["wine"]}\n',
                encoding="utf-8",
            )

            pipeline.fit(gallery)

            self.assertFalse(pipeline.cache_hit)
            self.assertEqual(pipeline.load_calls, 1)
            self.assertEqual(pipeline.encode_calls, 1)
            self.assertIn("RuntimeError", pipeline._cache_load_error)
            self.assertEqual(tensor_path.read_bytes(), b"replacement-cache")

    def test_require_rejects_a_corrupt_cache_clearly(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image_path = root / "reference.png"
            Image.new("RGB", (8, 8), "red").save(image_path)
            gallery = [{"slug": "wine", "image_path": str(image_path)}]
            pipeline = _CacheTestPipeline(cache_policy="require", cache_dir=root / "cache")
            pipeline._load_backend()
            gallery[0]["image_sha256"] = pipeline._image_digest(gallery[0])
            fingerprint = pipeline._fingerprint(gallery)
            tensor_path, metadata_path = pipeline._cache_files(fingerprint)
            tensor_path.parent.mkdir(parents=True)
            tensor_path.write_bytes(b"corrupt-cache")
            metadata_path.write_text(
                '{"format": ' + str(CACHE_FORMAT_VERSION) + ', "fingerprint": "' + fingerprint +
                '", "slugs": ["wine"]}\n',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "Required SigLIP cache is invalid"):
                pipeline.fit(gallery)
            self.assertEqual(pipeline.load_calls, 1)
            self.assertEqual(pipeline.encode_calls, 0)


class Transformers517CompatibilityTests(unittest.TestCase):
    def setUp(self):
        try:
            import transformers
            import torch  # noqa: F401
            import safetensors  # noqa: F401
        except ImportError as error:
            self.skipTest(f"optional SigLIP dependencies are unavailable: {error}")
        if transformers.__version__ != "5.17.0":
            self.skipTest("this compatibility test targets the pinned Transformers 5.17.0 API")

    @staticmethod
    def _text_config(config_class):
        return config_class(
            vocab_size=32,
            hidden_size=8,
            intermediate_size=16,
            num_hidden_layers=1,
            num_attention_heads=2,
            max_position_embeddings=8,
            projection_size=8,
            pad_token_id=0,
            bos_token_id=2,
            eos_token_id=3,
        )

    def _write_fixed_checkpoint(self, destination: Path) -> None:
        from transformers import (SiglipConfig, SiglipImageProcessor, SiglipModel,
                                  SiglipTextConfig, SiglipVisionConfig)

        vision_config = SiglipVisionConfig(
            hidden_size=8,
            intermediate_size=16,
            num_hidden_layers=1,
            num_attention_heads=2,
            image_size=16,
            patch_size=8,
        )
        config = SiglipConfig(
            text_config=self._text_config(SiglipTextConfig).to_dict(),
            vision_config=vision_config.to_dict(),
        )
        SiglipModel(config).save_pretrained(destination)
        SiglipImageProcessor(
            size={"height": 16, "width": 16},
            image_mean=[0.5, 0.5, 0.5],
            image_std=[0.5, 0.5, 0.5],
        ).save_pretrained(destination)

    def _write_naflex_checkpoint(self, destination: Path) -> None:
        from transformers import (Siglip2Config, Siglip2ImageProcessor, Siglip2Model,
                                  Siglip2TextConfig, Siglip2VisionConfig)

        vision_config = Siglip2VisionConfig(
            hidden_size=8,
            intermediate_size=16,
            num_hidden_layers=1,
            num_attention_heads=2,
            patch_size=8,
            num_patches=4,
        )
        config = Siglip2Config(
            text_config=self._text_config(Siglip2TextConfig).to_dict(),
            vision_config=vision_config.to_dict(),
        )
        Siglip2Model(config).save_pretrained(destination)
        Siglip2ImageProcessor(
            patch_size=8,
            max_num_patches=4,
            image_mean=[0.5, 0.5, 0.5],
            image_std=[0.5, 0.5, 0.5],
        ).save_pretrained(destination)

    def test_fixed_and_naflex_local_checkpoints_encode_without_downloads(self):
        import torch

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image_path = root / "query.png"
            Image.new("RGB", (19, 27), "red").save(image_path)

            cases = [
                ("fixed", self._write_fixed_checkpoint, False),
                ("naflex", self._write_naflex_checkpoint, True),
            ]
            for name, write_checkpoint, expected_naflex in cases:
                with self.subTest(checkpoint=name):
                    checkpoint = root / name
                    checkpoint.mkdir()
                    write_checkpoint(checkpoint)
                    pipeline = Siglip2Pipeline(
                        model_id=str(checkpoint),
                        device="cpu",
                        precision="float32",
                        batch_size=1,
                        cache_policy="off",
                        max_num_patches=4,
                        offline=True,
                    )
                    pipeline._load_backend()
                    embeddings = pipeline._encode_paths([image_path])

                    self.assertEqual(pipeline._is_naflex, expected_naflex)
                    self.assertEqual(tuple(embeddings.shape), (1, 8))
                    self.assertEqual(embeddings.dtype, torch.float32)
                    self.assertTrue(torch.isfinite(embeddings).all())
                    self.assertTrue(torch.allclose(
                        embeddings.norm(dim=1), torch.ones(1), atol=1e-5, rtol=1e-5
                    ))


if __name__ == "__main__":
    unittest.main()
