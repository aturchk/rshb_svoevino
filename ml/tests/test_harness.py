"""Small integration tests for data linking and benchmark contracts."""

import csv
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from wine_cv.benchmark import run_benchmark
from wine_cv.catalog import (build_gallery, build_strict_gallery, read_gallery,
                             write_jsonl)
from wine_cv.field_data import (REQUIRED_COLUMNS, export_field_eval,
                                validate_field_manifest)
from wine_cv.pipelines import Candidate, SiglipOrbRerankPipeline, make_pipeline
from wine_cv.training import field_augment


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.uploads = self.root / "uploads"
        self.uploads.mkdir()

    def tearDown(self):
        self.temporary.cleanup()

    def _image(self, path: Path, vertical: bool):
        image = Image.new("RGB", (100, 100), "white")
        draw = ImageDraw.Draw(image)
        if vertical:
            draw.rectangle((10, 10, 40, 90), fill="black")
        else:
            draw.rectangle((10, 10, 90, 40), fill="black")
        image.save(path)

    def test_linkage_skips_missing_and_ambiguous_assets(self):
        self._image(self.uploads / "wine_one_aaaaaaaaaa.png", vertical=True)
        self._image(self.uploads / "wine_two_bbbbbbbbbb.png", vertical=False)
        self._image(self.uploads / "wine_two_cccccccccc.png", vertical=True)
        self._image(self.uploads / "Agora_Bastardo_dddddddddd.png", vertical=False)
        csv_path = self.root / "catalog.csv"
        with csv_path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["Slug", "Название фото", "Название вина"])
            writer.writeheader()
            for slug, photo in [("one", "wine-one.png"), ("one", "wine-one.png"),
                                ("two", "wine-two.png"), ("three", "missing.png"),
                                ("agora-bastardo", "Агора Бастардо.png")]:
                writer.writerow({"Slug": slug, "Название фото": photo, "Название вина": slug})
        gallery, report = build_gallery(csv_path, [self.uploads], self.root)
        self.assertEqual([item["slug"] for item in gallery], ["one", "agora-bastardo"])
        self.assertEqual((report["linked"], report["ambiguous"], report["missing"]), (2, 1, 1))
        self.assertEqual(report["match_methods"]["transliterated_photo_name"], 1)

    def test_shared_asset_is_excluded_from_trusted_gallery(self):
        self._image(self.uploads / "shared_eeeeeeeeee.png", vertical=True)
        csv_path = self.root / "catalog.csv"
        with csv_path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["Slug", "Название фото", "Название вина"])
            writer.writeheader()
            for slug in ("vintage-2024", "vintage-2025"):
                writer.writerow({"Slug": slug, "Название фото": "shared.png", "Название вина": slug})
        gallery, report = build_gallery(csv_path, [self.uploads], self.root)
        self.assertEqual(gallery, [])
        self.assertEqual(report["shared_asset_rows"], 2)
        self.assertEqual(report["shared_asset_count"], 1)

    def test_strict_gallery_excludes_semantic_collisions_and_low_resolution(self):
        Image.new("RGB", (500, 500), "red").save(
            self.uploads / "clean_aaaaaaaaaa.png")
        Image.new("RGB", (500, 500), "blue").save(
            self.uploads / "sibling_one_bbbbbbbbbb.png")
        Image.new("RGB", (500, 500), "green").save(
            self.uploads / "sibling_two_cccccccccc.png")
        Image.new("RGB", (150, 500), "yellow").save(
            self.uploads / "tiny_dddddddddd.png")
        csv_path = self.root / "catalog.csv"
        with csv_path.open("w", encoding="utf-8", newline="") as file:
            fields = ["Slug", "Название фото", "Название вина", "Винодельня"]
            writer = csv.DictWriter(file, fieldnames=fields)
            writer.writeheader()
            writer.writerow({"Slug": "clean", "Название фото": "clean.png",
                             "Название вина": "Clean", "Винодельня": "A"})
            writer.writerow({"Slug": "sibling-one", "Название фото": "sibling-one.png",
                             "Название вина": "Sibling", "Винодельня": "B"})
            writer.writerow({"Slug": "sibling-two", "Название фото": "sibling-two.png",
                             "Название вина": "  SIBLING ", "Винодельня": "b"})
            writer.writerow({"Slug": "tiny", "Название фото": "tiny.png",
                             "Название вина": "Tiny", "Винодельня": "C"})
        gallery, report = build_strict_gallery(csv_path, [self.uploads], self.root)
        self.assertEqual([item["slug"] for item in gallery], ["clean"])
        self.assertEqual(gallery[0]["quality_profile"], "strict-v1")
        self.assertEqual((gallery[0]["image_width"], gallery[0]["image_height"]), (500, 500))
        self.assertEqual(report["candidate_gallery_rows"], 4)
        self.assertEqual(report["strict_gallery_rows"], 1)
        self.assertEqual(report["strict_excluded_rows"], 3)
        self.assertEqual(report["strict_exclusion_counts"], {
            "ambiguous_name_winery": 2,
            "low_pixel_resolution": 1,
        })

    def test_labeled_benchmark_reports_top1_and_top5(self):
        first = self.uploads / "first.png"
        second = self.uploads / "second.png"
        self._image(first, vertical=True)
        self._image(second, vertical=False)
        gallery = self.root / "gallery.jsonl"
        import hashlib
        write_jsonl(gallery, [
            {"reference_id": "first:1", "slug": "first", "image_path": "uploads/first.png",
             "image_sha256": hashlib.sha256(first.read_bytes()).hexdigest()},
            {"reference_id": "second:1", "slug": "second", "image_path": "uploads/second.png",
             "image_sha256": hashlib.sha256(second.read_bytes()).hexdigest()},
        ])
        query_dir = self.root / "queries"
        query_dir.mkdir()
        query = query_dir / "sample.png"
        self._image(query, vertical=True)
        manifest = self.root / "queries.tsv"
        manifest.write_text("query_id\timage_path\nq1\tsample.png\n", encoding="utf-8")
        labels = self.root / "labels.tsv"
        labels.write_text("query_id\tslug\nq1\tfirst\n", encoding="utf-8")
        predictions = self.root / "predictions.jsonl"
        summary = run_benchmark(gallery, manifest, query_dir, "dhash", predictions,
                                self.root / "summary.json", labels, data_root=self.root)
        self.assertEqual(summary["top1_accuracy"], 1.0)
        self.assertEqual(summary["recall_at_5"], 1.0)
        result = json.loads(predictions.read_text(encoding="utf-8"))
        self.assertEqual(result["predicted_slug"], "first")

    def test_gallery_is_portable_and_detects_changed_image(self):
        image = self.uploads / "wine_aaaaaaaaaa.png"
        self._image(image, vertical=True)
        catalog = self.root / "catalog.csv"
        with catalog.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["Slug", "Название фото", "Название вина"])
            writer.writeheader()
            writer.writerow({"Slug": "wine", "Название фото": "wine.png", "Название вина": "Wine"})
        records, _ = build_gallery(catalog, [self.uploads], self.root)
        gallery = self.root / "gallery.jsonl"
        write_jsonl(gallery, records)
        self.assertFalse(Path(records[0]["image_path"]).is_absolute())
        self.assertEqual(read_gallery(gallery, self.root)[0]["slug"], "wine")
        self._image(image, vertical=False)
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            read_gallery(gallery, self.root)

    def test_field_manifest_exports_only_confirmed_indexed_rows(self):
        indexed_reference = self.uploads / "indexed.png"
        indexed_query = self.uploads / "indexed-field.png"
        missing_reference = self.uploads / "field-only.png"
        self._image(indexed_reference, vertical=True)
        Image.new("RGB", (101, 100), "red").save(indexed_query)
        self._image(missing_reference, vertical=False)
        import hashlib
        gallery = self.root / "gallery.jsonl"
        write_jsonl(gallery, [{
            "reference_id": "indexed:1", "slug": "indexed",
            "image_path": "uploads/indexed.png",
            "image_sha256": hashlib.sha256(indexed_reference.read_bytes()).hexdigest(),
        }])
        catalog = self.root / "catalog.csv"
        with catalog.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["Slug", "Название фото", "Название вина"])
            writer.writeheader()
            writer.writerow({"Slug": "indexed", "Название фото": "indexed.png", "Название вина": "A"})
            writer.writerow({"Slug": "not-indexed", "Название фото": "none.png", "Название вина": "B"})
        manifest = self.root / "field.tsv"
        rows = []
        for query_id, path, slug in [("q1", indexed_query, "indexed"),
                                     ("q2", missing_reference, "not-indexed")]:
            row = {column: "" for column in REQUIRED_COLUMNS}
            row.update({
                "query_id": query_id,
                "image_path": path.relative_to(self.root).as_posix(),
                "image_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "source_kind": "field", "bottle_group_id": query_id, "split": "dev",
                "label_status": "confirmed", "true_slug": slug,
                "review_status": "single_reviewed", "reviewer_ids": "r1",
            })
            rows.append(row)
        with manifest.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=REQUIRED_COLUMNS, delimiter="\t")
            writer.writeheader()
            writer.writerows(rows)
        report = validate_field_manifest(manifest, self.root, catalog, gallery)
        self.assertTrue(report["valid"])
        self.assertEqual(report["gallery_state_counts"], {"indexed": 1, "not_indexed": 1})
        receipt = export_field_eval(manifest, self.root, catalog, gallery, "dev", self.root / "eval")
        self.assertEqual(receipt["exported"], 1)
        self.assertEqual(receipt["excluded"], {"not_indexed": 1})

    def test_siglip_factory_is_lazy(self):
        pipeline = make_pipeline("siglip2", cache_policy="off")
        self.assertEqual(pipeline.__class__.__name__, "Siglip2Pipeline")

    def test_field_augmentation_is_seeded(self):
        source = Image.new("RGB", (120, 180), "navy")
        first = field_augment(source, 42)
        second = field_augment(source, 42)
        third = field_augment(source, 43)
        self.assertEqual(first.tobytes(), second.tobytes())
        self.assertNotEqual(first.tobytes(), third.tobytes())

    def test_siglip_orb_reranker_uses_only_primary_candidates(self):
        class FakeSiglip:
            @staticmethod
            def predict(_image, _top_k):
                return [Candidate("a", 0.9), Candidate("b", 0.8), Candidate("c", 0.7)]

        class FakeOrb:
            @staticmethod
            def score_slugs(_image, slugs):
                self.assertEqual(slugs, ["a", "b", "c"])
                return {"a": 0.0, "b": 0.1, "c": 0.8}

        pipeline = SiglipOrbRerankPipeline.__new__(SiglipOrbRerankPipeline)
        pipeline.siglip = FakeSiglip()
        pipeline.orb = FakeOrb()
        pipeline.candidate_k = 3
        pipeline.orb_weight = 2.0
        pipeline.rrf_k = 1
        result = pipeline.predict(Path("unused.jpg"), top_k=2)
        self.assertEqual([item.slug for item in result], ["c", "a"])


if __name__ == "__main__":
    unittest.main()
