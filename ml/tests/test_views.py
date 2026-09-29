"""Small deterministic checks for field-photo and label views."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from wine_cv.siglip import Siglip2Pipeline
from wine_cv.views import query_views, reference_views


class ViewTransformTests(unittest.TestCase):
    def test_reference_keeps_full_image_and_crops_existing_label_pixels(self):
        image = Image.new("RGB", (400, 400), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((150, 20, 250, 380), fill="black")
        draw.rectangle((150, 245, 250, 340), fill="red")
        full, label = reference_views(image, "full-label")
        self.assertEqual(full.size, image.size)
        self.assertLess(label.width, image.width)
        self.assertEqual(label.width, label.height)
        self.assertIn((255, 0, 0), label.getdata())
        self.assertEqual(full.getpixel((200, 300)), (255, 0, 0))

    def test_query_keeps_full_photo_when_center_is_misleading(self):
        image = Image.new("RGB", (300, 500), "blue")
        full, center = query_views(image, "full-center")
        self.assertEqual(full.size, image.size)
        self.assertEqual(center.size, (228, 380))

    def test_invalid_view_modes_fail(self):
        with self.assertRaisesRegex(ValueError, "reference view mode"):
            Siglip2Pipeline(reference_view_mode="invented")
        with self.assertRaisesRegex(ValueError, "query view mode"):
            Siglip2Pipeline(query_view_mode="invented")

    def test_view_policy_is_part_of_index_fingerprint(self):
        gallery = [{"slug": "wine", "image_sha256": "0" * 64,
                    "image_path": "digest-supplied.png"}]
        first = Siglip2Pipeline(reference_view_mode="full")
        second = Siglip2Pipeline(reference_view_mode="full-label")
        for pipeline in (first, second):
            pipeline._resolved_revision = "immutable-revision"
            pipeline._precision = "float32"
            pipeline._torch_version = "test"
            pipeline._transformers_version = "test"
            pipeline._processor_fingerprint = "test"
            pipeline._is_naflex = False
        self.assertNotEqual(first._fingerprint(gallery), second._fingerprint(gallery))

    def test_multi_view_scores_max_over_reference_and_query_views(self):
        try:
            import torch
        except ImportError:
            self.skipTest("optional torch unavailable")
        pipeline = Siglip2Pipeline(reference_view_mode="full-label",
                                   query_view_mode="full-center")
        pipeline.slugs = ["a", "b"]
        # Reference order is a/full, a/label, b/full, b/label.
        pipeline.embeddings = torch.tensor([[1.0, 0.0], [0.0, 1.0],
                                            [0.0, -1.0], [1.0, 0.0]])
        pipeline._torch = torch
        pipeline._device = torch.device("cpu")
        pipeline._encode_view_paths = lambda paths, reference, return_cpu: torch.tensor(
            [[0.0, -1.0], [0.0, -0.8]])
        with tempfile.TemporaryDirectory() as temporary:
            ranked = pipeline.predict(Path(temporary) / "not-read.png", top_k=2)
        self.assertEqual([item.slug for item in ranked], ["b", "a"])

    def test_path_decoder_holds_only_one_batch_at_a_time(self):
        try:
            import torch
        except ImportError:
            self.skipTest("optional torch unavailable")
        with tempfile.TemporaryDirectory() as temporary:
            paths = []
            for number in range(5):
                path = Path(temporary) / f"{number}.png"
                Image.new("RGB", (16, 16), "white").save(path)
                paths.append(path)
            pipeline = Siglip2Pipeline(batch_size=2)
            pipeline._torch = torch
            sizes = []

            def encode(images, return_cpu=True):
                sizes.append(len(images))
                return torch.ones((len(images), 2))

            pipeline._encode_images = encode
            result = pipeline._encode_paths(paths)
            self.assertEqual(sizes, [2, 2, 1])
            self.assertEqual(tuple(result.shape), (5, 2))


if __name__ == "__main__":
    unittest.main()
