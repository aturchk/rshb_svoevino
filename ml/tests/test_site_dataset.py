"""Offline checks for the public catalog snapshot parser."""

from __future__ import annotations

import io
import json
import unittest
from unittest.mock import patch

from PIL import Image

from wine_cv.site_dataset import fetch_wine_page, normalize_bottle, parse_sitemap, parse_wine_page


class SiteDatasetTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
