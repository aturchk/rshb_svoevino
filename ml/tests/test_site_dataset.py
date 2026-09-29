"""Offline checks for the public catalog snapshot parser."""

from __future__ import annotations

import io
import json
import csv
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from wine_cv.site_dataset import (
    build_outputs, fetch_wine_page, normalize_bottle, parse_sitemap,
    parse_wine_page, read_site_reference_review,
)


class SiteDatasetTests(unittest.TestCase):
    def _build_review_fixture(self, directory: Path, *, duplicate_image: bool = False,
                              stale_allow: bool = False, semantic_pair: bool = True) -> tuple[dict, Path]:
        output = directory / "snapshot"
        (output / "items").mkdir(parents=True)
        (output / "wines-sitemap.xml").write_bytes(b"<urlset/>")
        entries = []
        hashes = {}
        for slug, title, color in (
                ("wine-a", "Same name", (160, 30, 30)),
                ("wine-b", "Same name" if semantic_pair else "Other name", (30, 160, 30)),
                ("wine-c", "Unique name", (30, 30, 160))):
            image = Image.new("RGB", (200, 400),
                              (160, 30, 30) if duplicate_image and slug == "wine-b" else color)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            data = buffer.getvalue()
            digest = hashlib.sha256(data).hexdigest()
            hashes[slug] = digest
            for kind in ("raw", "normalized"):
                path = output / "images" / kind / f"{slug}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            image_url = f"https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/{slug}.png"
            entry = {
                "slug": slug, "page_url": f"https://vino-svoe.ru/wines/{slug}",
                "site_lastmod": "2026-09-29T00:00:00Z",
                "sitemap_images": [{"url": image_url, "title": title, "caption": title}],
            }
            item = {
                **entry,
                "site_wine": {
                    "slug": slug, "title": title, "manufacturer": {"name": "Winery"},
                    "image": {"url": f"/uploads/{slug}.png"},
                },
                "downloaded_images": [{
                    "url": image_url, "path": f"images/raw/{slug}.png",
                    "sha256": digest, "width": 200, "height": 400,
                    "normalized": {
                        "path": f"images/normalized/{slug}.png", "sha256": digest,
                        "source_bbox_xyxy": [0, 0, 200, 400],
                    },
                }],
            }
            (output / "items" / f"{slug}.json").write_text(json.dumps(item), encoding="utf-8")
            entries.append(entry)
        review_path = directory / "review.tsv"
        with review_path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["slug", "source_image_sha256", "decision", "reason"],
                                    delimiter="\t", lineterminator="\n")
            writer.writeheader()
            writer.writerow({"slug": "wine-a", "source_image_sha256": "0" * 64 if stale_allow else hashes["wine-a"],
                             "decision": "allow", "reason": "Verified label"})
            writer.writerow({"slug": "wine-b", "source_image_sha256": hashes["wine-b"],
                             "decision": "quarantine", "reason": "Wrong label"})
        return build_outputs(output, entries, None, None, {}, review_manifest=review_path), output

    def test_sitemap_keeps_page_and_full_size_image_url(self) -> None:
        xml = b'''<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
          xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url>
          <loc>https://vino-svoe.ru/wines/sample-wine</loc>
          <lastmod>2026-09-29T10:00:00Z</lastmod><image:image>
          <image:loc>https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/a.webp</image:loc>
          <image:caption>Sample</image:caption></image:image></url></urlset>'''
        entries = parse_sitemap(xml)
        self.assertEqual(entries[0]["slug"], "sample-wine")
        self.assertEqual(entries[0]["sitemap_images"][0]["caption"], "Sample")

    def test_nuxt_payload_resolves_wine_attributes(self) -> None:
        payload = [
            {"wine": 1, "similarWines": 12},
            {"slug": 2, "title": 3, "alcohol": 4, "grapes": 5,
             "image": 8, "description": 11},
            "sample-wine", "Sample", 13, [6], {"name": 7}, "Рислинг",
            {"url": 9}, "/uploads/sample.webp", None, "Aroma", [],
        ]
        html = (f'<script type="application/json" id="__NUXT_DATA__">'
                f'{json.dumps(payload, ensure_ascii=False)}</script>').encode()
        parsed = parse_wine_page(html, "sample-wine")
        self.assertEqual(parsed["wine"]["alcohol"], 13)
        self.assertEqual(parsed["wine"]["grapes"][0]["name"], "Рислинг")
        self.assertEqual(parsed["wine"]["image"]["url"], "/uploads/sample.webp")
        with self.assertRaises(ValueError):
            parse_wine_page(html, "other-wine")

        with patch("wine_cv.site_dataset.fetch", side_effect=[b"<html></html>", html]) as fetch:
            with patch("wine_cv.site_dataset.time.sleep"):
                result = fetch_wine_page("https://vino-svoe.ru/wines/sample-wine", "sample-wine")
        self.assertEqual(result["wine"]["title"], "Sample")
        self.assertEqual(fetch.call_count, 2)

    def test_normalization_uses_alpha_bounds_without_stretching(self) -> None:
        image = Image.new("RGBA", (200, 100), (0, 0, 0, 0))
        for x in range(80, 120):
            for y in range(10, 90):
                image.putpixel((x, y), (200, 20, 20, 255))
        source = io.BytesIO()
        image.save(source, format="PNG")
        normalized, transform = normalize_bottle(source.getvalue(), side=256)
        self.assertEqual(transform["source_bbox_xyxy"], [80, 10, 120, 90])
        with Image.open(io.BytesIO(normalized)) as result:
            self.assertEqual(result.size, (256, 256))
            self.assertEqual(result.getpixel((0, 0)), (255, 255, 255))

    def test_sha_bound_review_releases_only_verified_semantic_collision(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temporary:
            report, output = self._build_review_fixture(Path(temporary))
            base = [json.loads(line) for line in
                    (output / "gallery-merged-candidates.jsonl").read_text().splitlines()]
            reviewed = [json.loads(line) for line in
                        (output / "gallery-reviewed-candidates.jsonl").read_text().splitlines()]
            self.assertEqual([row["slug"] for row in base], ["wine-c"])
            self.assertEqual({row["slug"] for row in reviewed}, {"wine-a", "wine-c"})
            self.assertEqual(report["review_added_slugs"], ["wine-a"])
            self.assertEqual(report["reviewed_gallery_excluded_slugs"], ["wine-b"])
            self.assertEqual(report["review_stale_slugs"], [])
            added = next(row for row in reviewed if row["slug"] == "wine-a")
            self.assertEqual(added["review_status"], "site_image_reviewed")
            self.assertTrue(added["source_image_path"].endswith("images/raw/wine-a.png"))

    def test_changed_source_sha_fails_closed_even_when_title_becomes_unique(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temporary:
            report, output = self._build_review_fixture(
                Path(temporary), stale_allow=True, semantic_pair=False)
            reviewed = [json.loads(line) for line in
                        (output / "gallery-reviewed-candidates.jsonl").read_text().splitlines()]
            self.assertEqual({row["slug"] for row in reviewed}, {"wine-c"})
            self.assertEqual(report["review_stale_slugs"], ["wine-a"])
            self.assertEqual(report["review_added_slugs"], [])

    def test_shared_source_image_cannot_be_released_by_review(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temporary:
            report, output = self._build_review_fixture(Path(temporary), duplicate_image=True)
            reviewed = [json.loads(line) for line in
                        (output / "gallery-reviewed-candidates.jsonl").read_text().splitlines()]
            self.assertEqual({row["slug"] for row in reviewed}, {"wine-c"})
            self.assertEqual(len(report["shared_image_hashes"]), 1)
            self.assertEqual(report["review_added_slugs"], [])

    def test_review_manifest_rejects_duplicate_slug(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "review.tsv"
            path.write_text(
                "slug\tsource_image_sha256\tdecision\treason\n"
                + f"wine-a\t{'0' * 64}\tallow\tchecked\n" * 2, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicated review slug"):
                read_site_reference_review(path)


if __name__ == "__main__":
    unittest.main()
