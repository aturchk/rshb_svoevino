"""Acceptance-package integrity tests without network or GPU dependencies."""

from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from wine_cv.eval_data import validate_eval_package, validate_eval_predictions


class EvalDataTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.images = self.root / "images"
        self.images.mkdir()
        Image.new("RGB", (32, 48), "red").save(self.images / "one.png")
        self.manifest = self.root / "queries.tsv"
        self.manifest.write_text(
            "query_id\timage_path\nq-1\tone.png\n", encoding="utf-8")
        self.catalog = self.root / "catalog.csv"
        with self.catalog.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(
                file, fieldnames=["Slug", "Название фото", "Название вина"])
            writer.writeheader()
            writer.writerow({
                "Slug": "wine-one", "Название фото": "one.png", "Название вина": "One"})

    def tearDown(self):
        self.temporary.cleanup()

    def test_validates_package_and_predictions(self):
        package = validate_eval_package(self.manifest, self.images)
        self.assertEqual(package["queries"], 1)
        digest = hashlib.sha256((self.images / "one.png").read_bytes()).hexdigest()
        predictions = self.root / "predictions.jsonl"
        predictions.write_text(json.dumps({
            "query_id": "q-1",
            "image_path": "one.png",
            "image_sha256": digest,
            "predicted_slug": "wine-one",
            "latency_ms": 42,
        }) + "\n", encoding="utf-8")
        receipt = validate_eval_predictions(
            self.manifest, self.images, predictions, self.catalog)
        self.assertTrue(receipt["valid"])
        self.assertFalse(receipt["accuracy_available"])
        self.assertEqual(receipt["p95_latency_ms"], 42)

    def test_reports_duplicate_image_content_without_rewriting_test(self):
        (self.images / "copy.png").write_bytes((self.images / "one.png").read_bytes())
        self.manifest.write_text(
            "query_id\timage_path\nq-1\tone.png\nq-2\tcopy.png\n", encoding="utf-8")
        receipt = validate_eval_package(self.manifest, self.images)
        self.assertTrue(receipt["valid"])
        self.assertEqual(receipt["duplicate_content_images"], 1)
        self.assertEqual(receipt["warnings"][0]["same_as"], "one.png")

    def test_rejects_unknown_prediction_slug(self):
        digest = hashlib.sha256((self.images / "one.png").read_bytes()).hexdigest()
        predictions = self.root / "predictions.jsonl"
        predictions.write_text(json.dumps({
            "query_id": "q-1", "image_path": "one.png", "image_sha256": digest,
            "predicted_slug": "invented", "latency_ms": 10,
        }) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unknown predicted_slug"):
            validate_eval_predictions(self.manifest, self.images, predictions, self.catalog)


if __name__ == "__main__":
    unittest.main()
