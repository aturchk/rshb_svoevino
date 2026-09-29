"""Snapshot the public vino-svoe.ru wine catalog without changing the legacy data.

The wine sitemap is the inventory and the server-rendered Nuxt payload is the
source of product attributes. Downloads are checkpointed per wine so a run can
be resumed after a network interruption.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from threading import Lock

from PIL import Image, ImageOps, UnidentifiedImageError


SITEMAP_URL = "https://vino-svoe.ru/wines-sitemap.xml"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
USER_AGENT = "wine-cv-dataset/1.0 (public wine catalog snapshot)"
MAX_HTML_BYTES = 3_000_000
MAX_IMAGE_BYTES = 20_000_000
NORMALIZATION_VERSION = "exif-alpha-crop-pad-white-webp0-v2"
REVIEW_FIELDS = {"slug", "source_image_sha256", "decision", "reason"}
SITE_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
IMAGE_NS = "{http://www.google.com/schemas/sitemap-image/1.1}"


class NuxtPayloadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_payload = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and dict(attrs).get("id") == "__NUXT_DATA__":
            self.in_payload = True

    def handle_data(self, data: str) -> None:
        if self.in_payload:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_payload = False


def _read_limited(response: object, maximum: int) -> bytes:
    data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError(f"Response exceeds {maximum} bytes")
    return data


def fetch(url: str, *, maximum: int = MAX_HTML_BYTES, attempts: int = 4) -> bytes:
    """Fetch a bounded public resource with retries for transient failures."""
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,image/*,application/xml"})
            with urllib.request.urlopen(request, timeout=25) as response:
                if response.status != 200:
                    raise ValueError(f"HTTP {response.status} for {url}")
                return _read_limited(response, maximum)
        except (OSError, ValueError, urllib.error.HTTPError) as error:
            last_error = error
            if isinstance(error, urllib.error.HTTPError) and error.code not in (408, 429, 500, 502, 503, 504):
                break
            if attempt + 1 < attempts:
                time.sleep(min(8.0, 0.5 * 2**attempt) + random.uniform(0, 0.2))
    raise RuntimeError(f"Could not download {url}: {last_error}") from last_error


def parse_sitemap(xml: bytes) -> list[dict]:
    root = ET.fromstring(xml)
    entries: list[dict] = []
    seen: set[str] = set()
    for node in root.findall(f"{SITE_NS}url"):
        page_url = (node.findtext(f"{SITE_NS}loc") or "").strip()
        parsed = urllib.parse.urlparse(page_url)
        slug = parsed.path.removeprefix("/wines/")
        if parsed.scheme != "https" or parsed.netloc != "vino-svoe.ru" or not SLUG_RE.fullmatch(slug):
            raise ValueError(f"Invalid wine page URL in sitemap: {page_url}")
        if slug in seen:
            raise ValueError(f"Duplicate wine slug in sitemap: {slug}")
        seen.add(slug)
        images = []
        for image in node.findall(f"{IMAGE_NS}image"):
            url = (image.findtext(f"{IMAGE_NS}loc") or "").strip()
            parsed_image = urllib.parse.urlparse(url)
            if (parsed_image.scheme != "https" or parsed_image.netloc != "api.vino-svoe.ru"
                    or not parsed_image.path.startswith("/v1/img/str-api/")):
                raise ValueError(f"Invalid wine image URL in sitemap: {url}")
            images.append({
                "url": url,
                "caption": image.findtext(f"{IMAGE_NS}caption"),
                "title": image.findtext(f"{IMAGE_NS}title"),
            })
        entries.append({
            "slug": slug, "page_url": page_url,
            "site_lastmod": node.findtext(f"{SITE_NS}lastmod"),
            "sitemap_images": images,
        })
    if not entries:
        raise ValueError("Wine sitemap contains no entries")
    return entries


def _resolve(payload: list, index: int) -> object:
    if index < 0:
        return None
    value = payload[index]
    if isinstance(value, dict):
        return {key: _resolve(payload, ref) for key, ref in value.items()}
    if isinstance(value, list):
        if value and value[0] in ("ShallowReactive", "Reactive", "Ref", "ShallowRef"):
            return _resolve(payload, value[1])
        return [_resolve(payload, ref) for ref in value]
    return value


def parse_wine_page(html: bytes, expected_slug: str) -> dict:
    parser = NuxtPayloadParser()
    parser.feed(html.decode("utf-8"))
    if not parser.parts:
        raise ValueError("Missing __NUXT_DATA__ payload")
    payload = json.loads("".join(parser.parts))
    if not isinstance(payload, list):
        raise ValueError("Invalid Nuxt payload")
    for value in payload:
        if not isinstance(value, dict) or "wine" not in value:
            continue
        wine = _resolve(payload, value["wine"])
        if isinstance(wine, dict) and wine.get("slug") == expected_slug and wine.get("title"):
            related = _resolve(payload, value["similarWines"]) if "similarWines" in value else []
            return {"wine": wine, "similar_wines": related or []}
    raise ValueError(f"Wine {expected_slug} absent from Nuxt payload")


def fetch_wine_page(url: str, slug: str) -> dict:
    """Retry a transient 200 response that lacks the expected rendered data."""
    for attempt in range(3):
        try:
            return parse_wine_page(fetch(url), slug)
        except ValueError:
            if attempt == 2:
                raise
            time.sleep(0.5 * 2**attempt + random.uniform(0, 0.2))
    raise AssertionError("unreachable")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)


def _write_json_atomic(path: Path, data: object) -> None:
    _write_bytes_atomic(path, (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8"))


def normalize_bottle(data: bytes, side: int = 768) -> tuple[bytes, dict]:
    """EXIF-correct, crop only verified alpha whitespace, and pad without stretching."""
    with Image.open(io.BytesIO(data)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGBA")
    original_size = list(image.size)
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    cropped_alpha = bool(bbox and bbox != (0, 0, *image.size))
    if cropped_alpha:
        image = image.crop(bbox)
    else:
        bbox = (0, 0, *image.size)
    image.thumbnail((side - 48, side - 48), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 255))
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    output = io.BytesIO()
    canvas.convert("RGB").save(output, format="WEBP", lossless=True, method=0)
    return output.getvalue(), {
        "version": NORMALIZATION_VERSION, "original_size": original_size,
        "source_bbox_xyxy": list(bbox), "alpha_cropped": cropped_alpha,
        "output_size": [side, side],
    }


def _image_extension(url: str) -> str:
    extension = Path(urllib.parse.urlparse(url).path).suffix.lower()
    return extension if extension in {".webp", ".png", ".jpg", ".jpeg"} else ".img"


def _existing_item(path: Path, expected_slug: str) -> dict | None:
    if not path.is_file():
        return None
    try:
        item = json.loads(path.read_text(encoding="utf-8"))
        if item.get("slug") == expected_slug and item.get("site_wine", {}).get("slug") == expected_slug:
            return item
    except (OSError, ValueError, TypeError):
        pass
    return None


def collect_one(entry: dict, output: Path, *, download_images: bool, normalize: bool,
                refresh: bool = False) -> dict:
    slug = entry["slug"]
    item_path = output / "items" / f"{slug}.json"
    item = _existing_item(item_path, slug)
    if (item is None or refresh or item.get("site_lastmod") != entry["site_lastmod"]
            or item.get("sitemap_images") != entry["sitemap_images"]):
        parsed = fetch_wine_page(entry["page_url"], slug)
        previous_images = item.get("downloaded_images", []) if item else []
        item = {
            **entry,
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
            "site_wine": parsed["wine"],
            "similar_wines": parsed["similar_wines"],
            "downloaded_images": previous_images,
        }
        _write_json_atomic(item_path, item)
    if not download_images or not entry["sitemap_images"]:
        return item

    image_meta = []
    for number, image in enumerate(entry["sitemap_images"]):
        extension = _image_extension(image["url"])
        suffix = "" if number == 0 else f"-{number + 1}"
        raw_path = output / "images" / "raw" / f"{slug}{suffix}{extension}"
        previous = (item.get("downloaded_images") or [])
        previous_image = previous[number] if number < len(previous) else None
        valid_raw = (previous_image and previous_image.get("url") == image["url"] and raw_path.is_file()
                     and _sha256(raw_path.read_bytes()) == previous_image.get("sha256"))
        previous_normalized = (previous_image or {}).get("normalized") or {}
        normalized_path = output / "images" / "normalized" / f"{slug}{suffix}.webp"
        valid_normalized = (not normalize or
                            (normalized_path.is_file() and previous_normalized.get("version") ==
                             NORMALIZATION_VERSION and previous_normalized.get("sha256") ==
                             _sha256(normalized_path.read_bytes())))
        if valid_raw and valid_normalized:
            image_meta.append(previous_image)
            continue
        if valid_raw:
            data = raw_path.read_bytes()
        else:
            data = fetch(image["url"], maximum=MAX_IMAGE_BYTES)
            with Image.open(io.BytesIO(data)) as source:
                source.verify()
            _write_bytes_atomic(raw_path, data)
        try:
            with Image.open(io.BytesIO(data)) as source:
                source.load()
                width, height = source.size
                format_name = source.format
        except (UnidentifiedImageError, OSError) as error:
            raise ValueError(f"Unreadable image for {slug}: {image['url']}") from error
        record = {
            "url": image["url"], "path": raw_path.relative_to(output).as_posix(),
            "sha256": _sha256(data), "bytes": len(data), "width": width,
            "height": height, "format": format_name,
        }
        if normalize:
            normalized_data, transform = normalize_bottle(data)
            if not normalized_path.is_file() or _sha256(normalized_path.read_bytes()) != _sha256(normalized_data):
                _write_bytes_atomic(normalized_path, normalized_data)
            record["normalized"] = {
                "path": normalized_path.relative_to(output).as_posix(),
                "sha256": _sha256(normalized_data), **transform,
            }
        image_meta.append(record)
    item["downloaded_images"] = image_meta
    _write_json_atomic(item_path, item)
    return item


def _legacy_rows(path: Path) -> dict[str, dict[str, str]]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as file:
        rows = csv.DictReader(file)
        return {row["Slug"].strip(): row for row in rows if row.get("Slug", "").strip()}


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    data = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    _write_bytes_atomic(path, data.encode("utf-8"))


def read_site_reference_review(path: Path | None) -> dict[str, dict[str, str]]:
    """Load image-specific decisions; invalid review data must never widen the gallery."""
    if path is None:
        return {}
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        missing = REVIEW_FIELDS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Site reference review is missing columns: {sorted(missing)}")
        decisions = {}
        for line, row in enumerate(reader, start=2):
            slug = (row.get("slug") or "").strip()
            digest = (row.get("source_image_sha256") or "").strip()
            decision = (row.get("decision") or "").strip()
            reason = (row.get("reason") or "").strip()
            if not SLUG_RE.fullmatch(slug) or slug in decisions:
                raise ValueError(f"Invalid or duplicated review slug on line {line}: {slug!r}")
            if not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError(f"Invalid source image SHA-256 on review line {line}")
            if decision not in {"allow", "quarantine"} or not reason:
                raise ValueError(f"Invalid decision or missing reason on review line {line}")
            decisions[slug] = {
                "source_image_sha256": digest, "decision": decision, "reason": reason,
            }
    return decisions


def build_outputs(output: Path, entries: list[dict], legacy_csv: Path | None,
                  legacy_gallery: Path | None, failures: dict,
                  review_manifest: Path | None = Path("data/site_reference_review.tsv")) -> dict:
    legacy = _legacy_rows(legacy_csv) if legacy_csv else {}
    review = read_site_reference_review(review_manifest)
    by_slug = {entry["slug"]: entry for entry in entries}
    items = []
    for entry in entries:
        item = _existing_item(output / "items" / f"{entry['slug']}.json", entry["slug"])
        if item and item.get("site_lastmod") == entry["site_lastmod"]:
            items.append(item)
    items.sort(key=lambda row: row["slug"])
    _write_jsonl(output / "catalog.jsonl", items)
    merged = [{**item, "legacy_catalog": legacy.get(item["slug"])} for item in items]
    _write_jsonl(output / "merged.jsonl", merged)

    image_hashes: dict[str, set[str]] = defaultdict(set)
    normalized_hashes: dict[str, set[str]] = defaultdict(set)
    name_groups: dict[tuple[str, str], set[str]] = defaultdict(set)
    page_image_mismatch = []
    for item in items:
        wine = item["site_wine"]
        manufacturer = wine.get("manufacturer") or {}
        key = (str(wine.get("title") or "").strip().casefold(),
               str(manufacturer.get("name") or "").strip().casefold())
        name_groups[key].add(item["slug"])
        page_image = (wine.get("image") or {}).get("url")
        sitemap_images = item.get("sitemap_images") or []
        if sitemap_images and (not page_image or not urllib.parse.unquote(
                urllib.parse.urlparse(sitemap_images[0]["url"]).path).endswith(page_image)):
            page_image_mismatch.append(item["slug"])
        for image in item.get("downloaded_images", []):
            image_hashes[image["sha256"]].add(item["slug"])
            if image.get("normalized"):
                normalized_hashes[image["normalized"]["sha256"]].add(item["slug"])
    collisions = {digest: sorted(slugs) for digest, slugs in image_hashes.items() if len(slugs) > 1}
    normalized_collisions = {digest: sorted(slugs) for digest, slugs in normalized_hashes.items()
                             if len(slugs) > 1}
    semantic_collisions = {" | ".join(key): sorted(slugs) for key, slugs in name_groups.items()
                           if len(slugs) > 1}
    hard_blocked = set(page_image_mismatch)
    hard_blocked.update(slug for group in (collisions, normalized_collisions)
                        for slugs in group.values() for slug in slugs)
    semantic_blocked = {slug for slugs in semantic_collisions.values() for slug in slugs}
    stale_review = set()
    review_quarantine = set()
    for slug, decision in review.items():
        item = by_slug.get(slug)
        if item is None:
            continue
        images = item.get("downloaded_images") or []
        if not images or images[0]["sha256"] != decision["source_image_sha256"]:
            stale_review.add(slug)
        elif decision["decision"] == "quarantine":
            review_quarantine.add(slug)
    blocked = hard_blocked | semantic_blocked | stale_review | review_quarantine
    gallery = []
    site_references = {}
    try:
        output_relative = output.resolve().relative_to(Path.cwd().resolve())
    except ValueError:
        output_relative = None
    if output_relative is not None:
        for item in items:
            images = item.get("downloaded_images") or []
            if not images:
                continue
            image = images[0]
            view = image.get("normalized") or image
            bbox = view.get("source_bbox_xyxy")
            effective_width = bbox[2] - bbox[0] if bbox else image["width"]
            effective_height = bbox[3] - bbox[1] if bbox else image["height"]
            flags = []
            if min(effective_width, effective_height) < 128:
                flags.append("small_bottle_pixels")
            reference = {
                "reference_id": f"vino-svoe:{item['slug']}", "slug": item["slug"],
                "image_path": (output_relative / view["path"]).as_posix(),
                "image_sha256": view["sha256"], "view": "site_normalized" if image.get("normalized") else "site_raw",
                "review_status": "site_linked_unreviewed", "source_page_url": item["page_url"],
                "source_image_url": image["url"],
                "source_image_path": (output_relative / image["path"]).as_posix(),
                "source_image_sha256": image["sha256"],
                "site_lastmod": item["site_lastmod"], "quality_flags": flags,
            }
            site_references[item["slug"]] = reference
            if item["slug"] not in blocked:
                gallery.append(reference)
        _write_jsonl(output / "gallery-site-candidates.jsonl", gallery)
    combined_gallery = list(gallery)
    legacy_fallback = []
    if legacy_gallery and legacy_gallery.is_file() and output_relative is not None:
        from .catalog import read_gallery

        root = Path.cwd().resolve()
        for reference in read_gallery(legacy_gallery, root):
            slug = reference["slug"]
            if slug in by_slug:  # A current site record takes precedence, even if quarantined.
                continue
            legacy_fallback.append({
                **reference,
                "image_path": Path(reference["image_path"]).relative_to(root).as_posix(),
                "origin": "legacy_strict_fallback",
            })
        combined_gallery.extend(legacy_fallback)
    if output_relative is not None:
        _write_jsonl(output / "gallery-merged-candidates.jsonl", combined_gallery)
    reviewed_added = []
    if output_relative is not None:
        for slug in sorted(review):
            decision = review[slug]
            if (decision["decision"] == "allow" and slug in semantic_blocked and
                    slug not in hard_blocked and slug not in stale_review and
                    slug in site_references):
                reviewed_added.append({
                    **site_references[slug], "review_status": "site_image_reviewed",
                })
        _write_jsonl(output / "gallery-reviewed-candidates.jsonl",
                     combined_gallery + reviewed_added)
    statuses = Counter()
    for item in items:
        statuses["with_site_image"] += bool(item["sitemap_images"])
        statuses["with_downloaded_image"] += bool(item.get("downloaded_images"))
        statuses["with_legacy_slug"] += item["slug"] in legacy
    report = {
        "format_version": 1,
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "sitemap_sha256": _sha256((output / "wines-sitemap.xml").read_bytes()),
        "catalog_sha256": _sha256((output / "catalog.jsonl").read_bytes()),
        "merged_sha256": _sha256((output / "merged.jsonl").read_bytes()),
        "legacy_csv_sha256": _sha256(legacy_csv.read_bytes()) if legacy_csv and legacy_csv.is_file() else None,
        "gallery_site_sha256": _sha256((output / "gallery-site-candidates.jsonl").read_bytes())
        if output_relative is not None else None,
        "gallery_merged_sha256": _sha256((output / "gallery-merged-candidates.jsonl").read_bytes())
        if output_relative is not None else None,
        "gallery_reviewed_sha256": _sha256((output / "gallery-reviewed-candidates.jsonl").read_bytes())
        if output_relative is not None else None,
        "review_manifest_sha256": _sha256(review_manifest.read_bytes()) if review_manifest else None,
        "sitemap_items": len(entries), "complete_items": len(items),
        "failed_items": failures,
        "legacy_items": len(legacy), "legacy_slug_matches": statuses["with_legacy_slug"],
        "legacy_only_slugs": sorted(set(legacy) - set(by_slug)),
        "site_only_slugs": sorted(set(by_slug) - set(legacy)),
        "with_site_image": statuses["with_site_image"],
        "with_downloaded_image": statuses["with_downloaded_image"],
        "shared_image_hashes": collisions,
        "shared_normalized_image_hashes": normalized_collisions,
        "ambiguous_name_manufacturer": semantic_collisions,
        "page_sitemap_image_mismatch": page_image_mismatch,
        "gallery_candidate_count": len(gallery),
        "legacy_fallback_count": len(legacy_fallback),
        "merged_gallery_candidate_count": len(combined_gallery),
        "review_decision_count": len(review),
        "review_allow_count": sum(row["decision"] == "allow" for row in review.values()),
        "review_quarantine_count": sum(row["decision"] == "quarantine" for row in review.values()),
        "review_stale_slugs": sorted(stale_review),
        "review_added_slugs": [row["slug"] for row in reviewed_added],
        "reviewed_gallery_candidate_count": len(combined_gallery) + len(reviewed_added),
        "gallery_excluded_slugs": sorted(blocked),
        "complete": len(items) == len(entries) and not failures,
    }
    _write_json_atomic(output / "report.json", report)
    return report


def run(output: Path, *, workers: int, limit: int | None, download_images: bool,
        normalize: bool, legacy_csv: Path | None,
        legacy_gallery: Path | None, refresh: bool = False,
        review_manifest: Path | None = Path("data/site_reference_review.tsv")) -> dict:
    if not 1 <= workers <= 32:
        raise ValueError("workers must be between 1 and 32")
    sitemap = fetch(SITEMAP_URL)
    entries = parse_sitemap(sitemap)
    _write_bytes_atomic(output / "wines-sitemap.xml", sitemap)
    if limit is not None:
        if limit < 1:
            raise ValueError("limit must be positive")
        entries = entries[:limit]
    failures: dict[str, str] = {}
    completed = 0
    lock = Lock()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(collect_one, entry, output, download_images=download_images,
                               normalize=normalize, refresh=refresh): entry["slug"] for entry in entries}
        for future in as_completed(futures):
            slug = futures[future]
            try:
                future.result()
            except Exception as error:  # Keep the complete batch and checkpoint failures.
                failures[slug] = str(error)
            with lock:
                completed += 1
                if completed % 100 == 0 or completed == len(entries):
                    print(f"{completed}/{len(entries)} processed, {len(failures)} failed", flush=True)
    report = build_outputs(output, entries, legacy_csv, legacy_gallery, failures,
                           review_manifest=review_manifest)
    print(json.dumps({key: value for key, value in report.items() if not isinstance(value, (list, dict))},
                     ensure_ascii=False, indent=2), flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("work/vino-svoe"))
    parser.add_argument("--legacy-csv", type=Path, default=Path("dataset/strapi_output0709.csv"))
    parser.add_argument("--legacy-gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    parser.add_argument("--review-manifest", type=Path, default=Path("data/site_reference_review.tsv"))
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, help="Smoke test on the first N sitemap entries")
    parser.add_argument("--no-images", action="store_true", help="Download attributes only")
    parser.add_argument("--no-normalize", action="store_true", help="Skip padded reference views")
    parser.add_argument("--refresh", action="store_true", help="Refetch every wine page even if lastmod is unchanged")
    args = parser.parse_args()
    output = Path("work/vino-svoe-smoke") if args.limit and args.output == Path("work/vino-svoe") else args.output
    report = run(output, workers=args.workers, limit=args.limit,
                 download_images=not args.no_images, normalize=not args.no_normalize,
                 legacy_csv=args.legacy_csv,
                 legacy_gallery=None if args.limit else args.legacy_gallery,
                 refresh=args.refresh, review_manifest=args.review_manifest)
    if not report["complete"]:
        raise SystemExit("Snapshot incomplete; rerun the same command to resume")


if __name__ == "__main__":
    main()
