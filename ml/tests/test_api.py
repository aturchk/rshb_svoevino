"""HTTP contract tests using the deterministic dHash backend."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


try:
    from fastapi.testclient import TestClient
    from wine_cv.api import create_app
except ImportError:
    TestClient = None
    create_app = None


@unittest.skipIf(TestClient is None, "install the api and test extras")
class ApiContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        rows = []
        for slug, vertical in (("vertical", True), ("horizontal", False)):
            path = self.root / f"{slug}.png"
            image = Image.new("RGB", (100, 100), "white")
            draw = ImageDraw.Draw(image)
            box = (10, 10, 40, 90) if vertical else (10, 10, 90, 40)
            draw.rectangle(box, fill="black")
            image.save(path)
            rows.append({
                "reference_id": f"{slug}:1",
                "slug": slug,
                "image_path": path.name,
                "image_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
        self.gallery = self.root / "gallery.jsonl"
        self.gallery.write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
        )
        app = create_app(self.gallery, "dhash", self.root)
        self.client = TestClient(app)

    def tearDown(self):
        self.temporary.cleanup()

    def test_health_and_uncalibrated_product_contract(self):
        self.assertEqual(self.client.get("/health/live").status_code, 200)
        self.assertEqual(self.client.get("/health/ready").json()["gallerySize"], 2)
        with (self.root / "vertical.png").open("rb") as image:
            response = self.client.post(
                "/v1/retrieve", files={"image": ("query.png", image, "image/png")}
            )
        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "low_confidence")
        self.assertFalse(body["calibrated"])
        self.assertEqual(body["top1"]["slug"], "vertical")
        self.assertEqual(len(body["top5"]), 2)

    def test_organizer_contract_stays_flat(self):
        with (self.root / "horizontal.png").open("rb") as image:
            response = self.client.post(
                "/v1/eval/predict", files={"image": ("query.png", image, "image/png")}
            )
        self.assertEqual(response.json(), {"slug": "horizontal"})

    def test_rejects_inconsistent_thresholds(self):
        with self.assertRaisesRegex(ValueError, "must not exceed"):
            create_app(
                self.gallery,
                "dhash",
                self.root,
                thresholds={
                    "not_found_score": 0.8,
                    "matched_score": 0.7,
                    "matched_margin": 0.1,
                },
                threshold_version="bad-order",
            )
        with self.assertRaisesRegex(ValueError, "non-negative"):
            create_app(
                self.gallery,
                "dhash",
                self.root,
                thresholds={
                    "not_found_score": 0.4,
                    "matched_score": 0.7,
                    "matched_margin": -0.1,
                },
                threshold_version="bad-margin",
            )


if __name__ == "__main__":
    unittest.main()
