"""Field accuracy reports must bind predictions to reviewed image hashes."""

from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from wine_cv.field_data import REQUIRED_COLUMNS
from wine_cv.field_report import prepare_field_sample, score_field_sample


class FieldReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.images = self.root / "images"
        self.images.mkdir()
        for name, color in (("reference", "red"), ("one", "blue"),
                            ("two", "green"), ("absent", "yellow")):
            Image.new("RGB", (32, 48), color).save(self.images / f"{name}.png")
        self.catalog = self.root / "catalog.csv"
        with self.catalog.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["Slug", "Название фото", "Название вина"])
            writer.writeheader()
            writer.writerows([
                {"Slug": "wine-one", "Название фото": "reference.png", "Название вина": "One"},
                {"Slug": "wine-two", "Название фото": "two.png", "Название вина": "Two"},
            ])
        self.gallery = self.root / "gallery.jsonl"
        reference = self.images / "reference.png"
        self.gallery.write_text(json.dumps({
            "slug": "wine-one", "reference_id": "wine-one:1",
            "image_path": "images/reference.png",
            "image_sha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
        }) + "\n", encoding="utf-8")
        self.mapping = self.root / "mapping.tsv"
        with self.mapping.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=REQUIRED_COLUMNS, delimiter="\t")
            writer.writeheader()
            for name, status, slug in (("one", "confirmed", "wine-one"),
                                       ("two", "confirmed", "wine-two"),
                                       ("absent", "not_in_catalog", "")):
                path = self.images / f"{name}.png"
                row = dict.fromkeys(REQUIRED_COLUMNS, "")
                row.update({
                    "query_id": f"q-{name}", "image_path": f"images/{name}.png",
                    "image_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "source_kind": "field", "split": "pool", "label_status": status,
                    "true_slug": slug, "review_status": "single_reviewed",
                    "reviewer_ids": "r01",
                })
                writer.writerow(row)
        self.out = self.root / "out"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _prepare_and_predict(self) -> tuple[dict, Path, Path]:
        selection = prepare_field_sample(self.mapping, self.catalog, self.gallery,
                                         self.root, "pool", self.out)
        self.assertEqual(selection["selected_count"], 1)
        self.assertEqual(selection["confirmed_original_reviewed"], 2)
        self.assertEqual(selection["excluded"], {"not_indexed": 1,
                                                 "not_in_catalog": 1})
        row = selection["rows"][0]
        predictions = self.root / "predictions.jsonl"
        predictions.write_text(json.dumps({
            "query_id": row["query_id"], "image_path": row["image_path"],
            "image_sha256": row["image_sha256"], "true_slug": row["slug"],
            "predicted_slug": "wine-one", "latency_ms": 42,
            "ranking": [{"slug": "wine-one", "score": 0.8}],
        }) + "\n", encoding="utf-8")
        summary = self.root / "summary.json"
        summary.write_text(json.dumps({
            "gallery_sha256": selection["gallery_sha256"],
            "query_manifest_sha256": selection["query_manifest_sha256"],
            "labels_sha256": selection["labels_sha256"],
            "query_count": 1, "ranking_depth": 20,
            "labels_available": True, "pipeline": "siglip2",
        }), encoding="utf-8")
        return selection, predictions, summary

    def test_reports_tz_metrics_and_gallery_ceiling(self) -> None:
        _, predictions, summary = self._prepare_and_predict()
        report = score_field_sample(self.out / "selection.pool.json", self.gallery,
                                    predictions, summary, self.out)
        self.assertEqual(report["metrics"]["top1_accuracy"], 1.0)
        self.assertEqual(report["metrics"]["mean_set_f1_at_5"], 1.0)
        self.assertEqual(report["metrics"]["gallery_coverage_of_confirmed"], 0.5)
        self.assertEqual(report["metrics"]["p95_latency_ms"], 42)
        self.assertIn("не официальный test", (self.out / "accuracy.md").read_text())

    def test_rejects_changed_query_or_unrelated_benchmark(self) -> None:
        _, predictions, summary = self._prepare_and_predict()
        record = json.loads(predictions.read_text())
        record["image_sha256"] = "0" * 64
        predictions.write_text(json.dumps(record) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "identity/label mismatch"):
            score_field_sample(self.out / "selection.pool.json", self.gallery,
                               predictions, summary, self.out)
        record["image_sha256"] = self._image_sha("one")
        predictions.write_text(json.dumps(record) + "\n", encoding="utf-8")
        other = json.loads(summary.read_text())
        other["gallery_sha256"] = "0" * 64
        summary.write_text(json.dumps(other), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "gallery_sha256"):
            score_field_sample(self.out / "selection.pool.json", self.gallery,
                               predictions, summary, self.out)

    def test_rejects_stale_annotations(self) -> None:
        _, predictions, summary = self._prepare_and_predict()
        self.mapping.write_text(self.mapping.read_text(encoding="utf-8") + "\n",
                                encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "annotations changed"):
            score_field_sample(self.out / "selection.pool.json", self.gallery,
                               predictions, summary, self.out)

    def _image_sha(self, name: str) -> str:
        return hashlib.sha256((self.images / f"{name}.png").read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
