"""Deduplicate the catalog and link CSV photo names to Strapi upload files."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".tif", ".tiff"}
RESIZE_PREFIX = re.compile(r"^(?:thumbnail|small|medium|large)_", re.I)
STRAPI_HASH = re.compile(r"_([0-9a-f]{10})$", re.I)
STRICT_PROFILE = "strict-v1"
STRICT_MIN_SHORT_SIDE = 192
STRICT_MIN_PIXELS = 150_000
CYRILLIC_LATIN = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    ("a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "j", "k", "l", "m", "n",
     "o", "p", "r", "s", "t", "u", "f", "h", "cz", "ch", "sh", "shh", "", "y", "", "e", "yu", "ya"),
))


def photo_key(name: str, *, upload: bool = False) -> str:
    stem = Path(name).stem
    if upload:
        stem = RESIZE_PREFIX.sub("", stem)
        stem = STRAPI_HASH.sub("", stem)
    return "".join(c for c in unicodedata.normalize("NFKC", stem).casefold() if c.isalnum())


def transliterated_photo_key(name: str) -> str:
    """Approximate Strapi's Russian→Latin filename conversion, then normalize."""
    stem = Path(name).stem.casefold()
    latin = "".join(CYRILLIC_LATIN.get(c, c) for c in stem)
    return photo_key(latin + Path(name).suffix)


def semantic_key(value: str) -> str:
    """Normalize catalog text for conservative ambiguity detection."""
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def catalog_rows(csv_path: Path) -> list[dict[str, str]]:
    by_slug: dict[str, dict[str, str]] = {}
    with csv_path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required = {"Slug", "Название фото", "Название вина"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Catalog is missing columns: {sorted(required - set(reader.fieldnames or []))}")
        for row in reader:
            slug = row["Slug"].strip()
            if not slug:
                raise ValueError("Catalog contains an empty slug")
            if slug in by_slug and row != by_slug[slug]:
                raise ValueError(f"Conflicting catalog rows for slug: {slug}")
            by_slug[slug] = row
    return list(by_slug.values())


def _relative_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as error:
        raise ValueError(f"Image is outside data root {root}: {path}") from error


def build_gallery(csv_path: Path, uploads: list[Path], data_root: Path | None = None) -> tuple[list[dict], dict]:
    data_root = (data_root or Path.cwd()).resolve()
    csv_path = csv_path.resolve() if csv_path.is_absolute() else (data_root / csv_path).resolve()
    uploads = [path.resolve() if path.is_absolute() else (data_root / path).resolve()
               for path in uploads]
    rows = catalog_rows(csv_path)
    with csv_path.open(encoding="utf-8-sig", newline="") as file:
        source_catalog_rows = sum(1 for _ in csv.DictReader(file))
    by_key: dict[str, list[Path]] = defaultdict(list)
    total_files = 0
    for directory in uploads:
        if not directory.is_dir():
            raise FileNotFoundError(directory)
        for path in directory.rglob("*"):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                by_key[photo_key(path.name, upload=True)].append(path.resolve())
                total_files += 1

    statuses = Counter()
    gallery = []
    issues = []
    match_methods = Counter()
    slug_match_candidates = []
    for row in rows:
        slug = row["Slug"].strip()
        paths = by_key.get(photo_key(row["Название фото"]), [])
        match_method = "photo_name"
        if not paths:
            paths = by_key.get(transliterated_photo_key(row["Название фото"]), [])
            match_method = "transliterated_photo_name"
        # A different Strapi content hash means a different asset, even if the
        # human-readable stem is identical. Do not guess the intended one.
        assets = defaultdict(list)
        for path in paths:
            match = STRAPI_HASH.search(path.stem)
            asset_id = match.group(1).lower() if match else str(path)
            assets[asset_id].append(path)
        if not paths:
            status = "missing"
        elif len(assets) > 1:
            status = "ambiguous"
        else:
            status = "linked"
        statuses[status] += 1
        if status != "linked":
            issues.append({"slug": slug, "photo_name": row["Название фото"], "status": status})
            if status == "missing":
                slug_paths = by_key.get(photo_key(slug + ".webp"), [])
                slug_assets = {STRAPI_HASH.search(path.stem).group(1).lower()
                               if STRAPI_HASH.search(path.stem) else str(path) for path in slug_paths}
                if len(slug_assets) == 1:
                    slug_match_candidates.append({
                        "slug": slug,
                        "photo_name": row["Название фото"],
                        "candidate_paths": [_relative_path(path, data_root) for path in slug_paths],
                    })
            continue
        # Prefer a full-resolution file over Strapi resized variants.
        asset_id, candidates = next(iter(assets.items()))
        candidates.sort(key=lambda path: (bool(RESIZE_PREFIX.match(path.name)), -path.stat().st_size, str(path)))
        selected = None
        for candidate in candidates:
            try:
                with Image.open(candidate) as image:
                    image.verify()
                selected = candidate
                break
            except (OSError, ValueError):
                continue
        if selected is None:
            statuses["unreadable"] += 1
            statuses["linked"] -= 1
            issues.append({"slug": slug, "photo_name": row["Название фото"], "status": "unreadable"})
            continue
        image_sha256 = hashlib.sha256(selected.read_bytes()).hexdigest()
        gallery.append({
            "reference_id": f"{slug}:{asset_id}",
            "slug": slug,
            "image_path": _relative_path(selected, data_root),
            "image_sha256": image_sha256,
            "asset_id": asset_id,
            "view": "reference",
            "review_status": "auto_linked",
            "name": row["Название вина"].strip(),
            "photo_name": row["Название фото"],
            "match_method": match_method,
        })

    # One image cannot reliably distinguish two wine slugs. Detect both shared
    # Strapi IDs and byte-identical uploads with different IDs.
    asset_counts = Counter(item["asset_id"] for item in gallery)
    shared_ids = {asset_id for asset_id, count in asset_counts.items() if count > 1}
    sha_counts = Counter(item["image_sha256"] for item in gallery)
    shared_hashes = {digest for digest, count in sha_counts.items() if count > 1}
    shared_assets = [
        {"asset_id": asset_id,
         "slugs": [item["slug"] for item in gallery if item["asset_id"] == asset_id],
         "image_paths": sorted({item["image_path"] for item in gallery if item["asset_id"] == asset_id})}
        for asset_id in sorted(shared_ids)
    ]
    shared_content = [
        {"image_sha256": digest,
         "slugs": [item["slug"] for item in gallery if item["image_sha256"] == digest],
         "image_paths": sorted({item["image_path"] for item in gallery if item["image_sha256"] == digest})}
        for digest in sorted(shared_hashes)
    ]
    shared_reference_ids = {
        item["reference_id"] for item in gallery
        if item["asset_id"] in shared_ids or item["image_sha256"] in shared_hashes
    }
    for item in gallery:
        if item["reference_id"] in shared_reference_ids:
            issues.append({"slug": item["slug"], "photo_name": item["photo_name"],
                           "status": "shared_asset", "asset_id": item["asset_id"],
                           "image_sha256": item["image_sha256"]})
    gallery = [item for item in gallery if item["reference_id"] not in shared_reference_ids]
    statuses["shared_asset"] = len(shared_reference_ids)
    statuses["linked"] -= statuses["shared_asset"]
    match_methods = Counter(item["match_method"] for item in gallery)

    report = {"source_catalog_rows": source_catalog_rows,
              "duplicate_catalog_rows": source_catalog_rows - len(rows),
              "catalog_rows": len(rows), "upload_images": total_files,
              "linked": statuses["linked"], "missing": statuses["missing"],
              "ambiguous": statuses["ambiguous"], "unreadable": statuses["unreadable"],
              "shared_asset_rows": statuses["shared_asset"], "shared_asset_count": len(shared_assets),
              "shared_assets": shared_assets, "shared_content_count": len(shared_content),
              "shared_content": shared_content,
              "match_methods": dict(match_methods), "slug_match_candidates": slug_match_candidates,
              "issues": issues}
    return gallery, report


def filter_strict_gallery(
        gallery: list[dict], rows: list[dict[str, str]], data_root: Path,
        min_short_side: int = STRICT_MIN_SHORT_SIDE,
        min_pixels: int = STRICT_MIN_PIXELS) -> tuple[list[dict], dict]:
    """Remove machine-detectable risky references from a linked gallery.

    A name/winery collision is evaluated against the complete catalog, not only
    against linked references. This prevents an indexed sibling from standing
    in for an unindexed vintage or variant with the same human-facing identity.
    """
    if min_short_side <= 0:
        raise ValueError("min_short_side must be positive")
    if min_pixels <= 0:
        raise ValueError("min_pixels must be positive")

    root = data_root.resolve()
    rows_by_slug = {row["Slug"].strip(): row for row in rows}
    semantic_groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for slug, row in rows_by_slug.items():
        key = (semantic_key(row["Название вина"]), semantic_key(row.get("Винодельня", "")))
        semantic_groups[key].append(slug)
    ambiguous_keys = {key for key, slugs in semantic_groups.items() if len(slugs) > 1}
    gallery_slugs = {item["slug"] for item in gallery}
    ambiguous_groups = []
    for key in sorted(ambiguous_keys):
        slugs = sorted(semantic_groups[key])
        ambiguous_groups.append({
            "normalized_name": key[0],
            "normalized_winery": key[1],
            "catalog_slugs": slugs,
            "candidate_gallery_slugs": [slug for slug in slugs if slug in gallery_slugs],
        })

    strict_gallery = []
    exclusions = []
    exclusion_counts = Counter()
    for item in gallery:
        slug = item["slug"]
        row = rows_by_slug.get(slug)
        if row is None:
            raise ValueError(f"Gallery slug is absent from catalog: {slug}")
        image_path = (root / item["image_path"]).resolve()
        if not image_path.is_relative_to(root) or not image_path.is_file():
            raise ValueError(f"Invalid gallery image_path for {slug}: {item['image_path']}")
        with Image.open(image_path) as image:
            width, height = image.size

        reasons = []
        key = (semantic_key(row["Название вина"]), semantic_key(row.get("Винодельня", "")))
        if key in ambiguous_keys:
            reasons.append("ambiguous_name_winery")
        if min(width, height) < min_short_side or width * height < min_pixels:
            reasons.append("low_pixel_resolution")

        enriched = dict(item)
        enriched.update({
            "image_width": width,
            "image_height": height,
            "quality_profile": STRICT_PROFILE,
        })
        if reasons:
            exclusion_counts.update(reasons)
            exclusions.append({
                "slug": slug,
                "reference_id": item["reference_id"],
                "image_path": item["image_path"],
                "image_width": width,
                "image_height": height,
                "reasons": reasons,
            })
        else:
            strict_gallery.append(enriched)

    report = {
        "quality_profile": STRICT_PROFILE,
        "candidate_gallery_rows": len(gallery),
        "strict_gallery_rows": len(strict_gallery),
        "strict_unique_slugs": len({item["slug"] for item in strict_gallery}),
        "strict_unique_image_sha256": len({item["image_sha256"] for item in strict_gallery}),
        "strict_excluded_rows": len(exclusions),
        "strict_exclusion_counts": dict(sorted(exclusion_counts.items())),
        "strict_thresholds": {
            "min_short_side": min_short_side,
            "min_pixels": min_pixels,
        },
        "semantic_ambiguity_group_count": len(ambiguous_groups),
        "semantic_ambiguity_groups": ambiguous_groups,
        "strict_exclusions": exclusions,
    }
    return strict_gallery, report


def build_strict_gallery(
        csv_path: Path, uploads: list[Path], data_root: Path | None = None,
        min_short_side: int = STRICT_MIN_SHORT_SIDE,
        min_pixels: int = STRICT_MIN_PIXELS) -> tuple[list[dict], dict]:
    """Build the trusted linkage gallery and apply the strict quality profile."""
    root = (data_root or Path.cwd()).resolve()
    resolved_csv = csv_path.resolve() if csv_path.is_absolute() else (root / csv_path).resolve()
    gallery, linkage_report = build_gallery(csv_path, uploads, root)
    strict_gallery, strict_report = filter_strict_gallery(
        gallery, catalog_rows(resolved_csv), root, min_short_side, min_pixels)
    return strict_gallery, {**linkage_report, **strict_report}


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for record in records:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def read_gallery(path: Path, data_root: Path) -> list[dict]:
    """Read a portable gallery and resolve image paths under an explicit root."""
    root = data_root.resolve()
    records = []
    with path.open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid gallery JSON on line {line_number}: {error}") from error
    seen_slugs = set()
    seen_references = set()
    for line_number, record in enumerate(records, start=1):
        slug = record.get("slug", "")
        reference_id = record.get("reference_id", "")
        relative = Path(record.get("image_path", ""))
        declared_sha = record.get("image_sha256", "")
        if not slug or slug in seen_slugs:
            raise ValueError(f"Gallery line {line_number} has an empty or duplicate slug: {slug}")
        if not reference_id or reference_id in seen_references:
            raise ValueError(
                f"Gallery line {line_number} has an empty or duplicate reference_id: {reference_id}")
        if not re.fullmatch(r"[0-9a-f]{64}", declared_sha):
            raise ValueError(f"Gallery line {line_number} has an invalid image_sha256")
        if relative.is_absolute():
            raise ValueError("Gallery contains absolute image paths; rerun `wine-cv prepare`")
        resolved = (root / relative).resolve()
        if not resolved.is_relative_to(root) or not resolved.is_file():
            raise ValueError(f"Invalid gallery image_path for {slug}: {relative}")
        actual_sha = hashlib.sha256(resolved.read_bytes()).hexdigest()
        if actual_sha != declared_sha:
            raise ValueError(f"Gallery image SHA-256 mismatch for {slug}: {relative}")
        seen_slugs.add(slug)
        seen_references.add(reference_id)
        record["image_path"] = str(resolved)
    if not records:
        raise ValueError("Gallery is empty")
    return records
