"""Create, validate, and export auditable field-photo annotations."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

from .catalog import IMAGE_EXTENSIONS, catalog_rows, read_jsonl

SCHEMA_VERSION = 1
REQUIRED_COLUMNS = [
    "query_id", "image_path", "image_sha256", "source_kind", "parent_query_id",
    "bottle_group_id", "split", "label_status", "true_slug", "review_status",
    "reviewer_ids", "adjudicator_id",
]
OPTIONAL_COLUMNS = [
    "capture_session_id", "glare", "blur", "perspective", "occlusion", "lighting",
    "label_visibility", "multiple_bottles", "label_bbox_xyxy", "visible_year",
    "visible_text", "notes",
]
SOURCE_KINDS = {"field", "organizer", "synthetic", "derived_crop"}
SPLITS = {"pool", "train", "dev", "test", "none"}
LABEL_STATUSES = {"confirmed", "not_in_catalog", "uncertain", "exclude"}
REVIEW_STATUSES = {"pending", "single_reviewed", "double_agreed", "adjudicated"}
LEVELS = {"", "none", "mild", "strong"}
LIGHTING_VALUES = {"", "normal", "low", "harsh", "mixed"}
VISIBILITY_VALUES = {"", "full", "partial", "tiny", "none"}
YES_NO_VALUES = {"", "yes", "no"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_path(root: Path, value: str) -> Path:
    relative = Path(value)
    if not value or relative.is_absolute():
        raise ValueError("path must be nonempty and relative")
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError("path escapes data root")
    return resolved


def _single_line(value: str | None) -> str:
    """Keep lookup TSV rows easy to edit in spreadsheet tools."""
    return " ".join((value or "").split())


def make_field_template(images_dir: Path, data_root: Path, output: Path,
                        source_kind: str = "field", force: bool = False) -> int:
    if source_kind not in SOURCE_KINDS:
        raise ValueError(f"Unsupported source_kind: {source_kind}")
    if output.exists() and not force:
        raise FileExistsError(f"Output already exists: {output}; use --force to replace it")
    root = data_root.resolve()
    directory = images_dir.resolve() if images_dir.is_absolute() else (root / images_dir).resolve()
    if not directory.is_dir() or not directory.is_relative_to(root):
        raise ValueError("images-dir must be an existing directory under data-root")
    images = sorted(path for path in directory.iterdir()
                    if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)
    if not images:
        raise ValueError("No supported images found")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=REQUIRED_COLUMNS + OPTIONAL_COLUMNS,
                                delimiter="\t", lineterminator="\n")
        writer.writeheader()
        for index, path in enumerate(images, start=1):
            row = {column: "" for column in REQUIRED_COLUMNS + OPTIONAL_COLUMNS}
            row.update({
                "query_id": f"field-{index:06d}",
                "image_path": path.relative_to(root).as_posix(),
                "image_sha256": sha256_file(path),
                "source_kind": source_kind,
                "split": "pool",
                "review_status": "pending",
            })
            writer.writerow(row)
    return len(images)


def make_catalog_lookup(csv_path: Path, gallery_path: Path, output: Path) -> int:
    gallery = {item["slug"]: item for item in read_jsonl(gallery_path)}
    rows = sorted(catalog_rows(csv_path), key=lambda row: row["Slug"])
    fields = ["slug", "wine_name", "winery", "category", "region", "grape",
              "gallery_state", "reference_image_path"]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            slug = row["Slug"].strip()
            reference = gallery.get(slug)
            writer.writerow({
                "slug": slug,
                "wine_name": _single_line(row["Название вина"]),
                "winery": _single_line(row["Винодельня"]),
                "category": _single_line(row["Категория"]),
                "region": _single_line(row["Регион"]),
                "grape": _single_line(row["Сорт винограда"]),
                "gallery_state": "indexed" if reference else "not_indexed",
                "reference_image_path": reference["image_path"] if reference else "",
            })
    return len(rows)


def read_field_manifest(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter="\t")
        fields = reader.fieldnames or []
        missing = [column for column in REQUIRED_COLUMNS if column not in fields]
        if missing:
            raise ValueError(f"Field manifest is missing columns: {missing}")
        return list(reader), fields


def validate_field_manifest(manifest: Path, data_root: Path, catalog_csv: Path,
                            gallery_path: Path) -> dict:
    rows, _ = read_field_manifest(manifest)
    root = data_root.resolve()
    catalog_slugs = {row["Slug"].strip() for row in catalog_rows(catalog_csv)}
    gallery_rows = read_jsonl(gallery_path)
    gallery_slugs = {row["slug"] for row in gallery_rows}
    gallery_hashes = {row.get("image_sha256") for row in gallery_rows
                      if row.get("image_sha256")}
    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    groups: dict[str, list[dict]] = defaultdict(list)
    sha_splits: dict[str, set[str]] = defaultdict(set)
    session_splits: dict[str, set[str]] = defaultdict(set)
    by_id: dict[str, dict] = {}
    label_counts = Counter()
    gallery_counts = Counter()
    split_counts = Counter()

    for line, row in enumerate(rows, start=2):
        prefix = f"line {line}"
        query_id = row["query_id"].strip()
        if not query_id or query_id in seen_ids:
            errors.append(f"{prefix}: query_id is empty or duplicated: {query_id!r}")
        else:
            seen_ids.add(query_id)
            by_id[query_id] = row
        image_value = row["image_path"].strip()
        if image_value in seen_paths:
            errors.append(f"{prefix}: image_path is duplicated: {image_value}")
        seen_paths.add(image_value)
        image_size = None
        expected_sha = row["image_sha256"].strip().lower()
        try:
            image_path = _safe_path(root, image_value)
            if not image_path.is_file():
                errors.append(f"{prefix}: image does not exist: {image_value}")
            else:
                actual_sha = sha256_file(image_path)
                if not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
                    errors.append(f"{prefix}: image_sha256 must be 64 lowercase hex characters")
                elif actual_sha != expected_sha:
                    errors.append(f"{prefix}: image SHA-256 does not match: {image_value}")
                try:
                    with Image.open(image_path) as image:
                        image.verify()
                    with Image.open(image_path) as image:
                        image_size = image.size
                except (OSError, ValueError) as error:
                    errors.append(f"{prefix}: image cannot be decoded: {image_value}: {error}")
        except ValueError as error:
            errors.append(f"{prefix}: invalid image_path {image_value!r}: {error}")

        source = row["source_kind"].strip()
        split = row["split"].strip()
        label_status = row["label_status"].strip()
        review_status = row["review_status"].strip()
        true_slug = row["true_slug"].strip()
        group = row["bottle_group_id"].strip()
        parent = row["parent_query_id"].strip()
        if source not in SOURCE_KINDS:
            errors.append(f"{prefix}: unsupported source_kind: {source!r}")
        if split not in SPLITS:
            errors.append(f"{prefix}: unsupported split: {split!r}")
        if label_status and label_status not in LABEL_STATUSES:
            errors.append(f"{prefix}: unsupported label_status: {label_status!r}")
        if review_status not in REVIEW_STATUSES:
            errors.append(f"{prefix}: unsupported review_status: {review_status!r}")
        if source in {"synthetic", "derived_crop"} and not parent:
            errors.append(f"{prefix}: {source} requires parent_query_id")
        if label_status == "confirmed":
            if not true_slug:
                errors.append(f"{prefix}: confirmed label requires true_slug")
            elif true_slug not in catalog_slugs:
                errors.append(f"{prefix}: true_slug is not in the catalog: {true_slug}")
            elif true_slug in gallery_slugs:
                gallery_counts["indexed"] += 1
            else:
                gallery_counts["not_indexed"] += 1
                warnings.append(f"{prefix}: confirmed catalog slug is not in the working gallery: {true_slug}")
        elif true_slug:
            errors.append(f"{prefix}: true_slug must be blank unless label_status=confirmed")
        else:
            gallery_counts["na"] += 1
        if split in {"train", "dev", "test"}:
            if not group:
                errors.append(f"{prefix}: scored/training row requires bottle_group_id")
            if not label_status:
                errors.append(f"{prefix}: scored/training row requires label_status")
            if label_status in {"confirmed", "not_in_catalog"} and review_status == "pending":
                errors.append(f"{prefix}: labeled {split} row is still pending review")
            if split == "test" and review_status not in {"double_agreed", "adjudicated"}:
                errors.append(f"{prefix}: test row requires double_agreed or adjudicated review")
            if expected_sha in gallery_hashes:
                errors.append(f"{prefix}: active query is byte-identical to a gallery reference")
        elif expected_sha in gallery_hashes:
            warnings.append(f"{prefix}: query is byte-identical to a gallery reference")
        if review_status == "adjudicated" and not row["adjudicator_id"].strip():
            errors.append(f"{prefix}: adjudicated row requires adjudicator_id")
        if review_status == "double_agreed" and len(
                [value for value in row["reviewer_ids"].split(";") if value.strip()]) < 2:
            errors.append(f"{prefix}: double_agreed row requires at least two reviewer_ids")
        if group:
            groups[group].append(row)
        if row["image_sha256"].strip() and split not in {"pool", "none", ""}:
            sha_splits[row["image_sha256"].strip()].add(split)
        session = row.get("capture_session_id", "").strip()
        if session and split not in {"pool", "none", ""}:
            session_splits[session].add(split)
        label_counts[label_status or "unlabeled"] += 1
        split_counts[split or "blank"] += 1

        for condition in ("glare", "blur", "perspective", "occlusion"):
            if condition in row and row[condition].strip() not in LEVELS:
                errors.append(f"{prefix}: {condition} must be blank/none/mild/strong")
        if row.get("lighting", "").strip() not in LIGHTING_VALUES:
            errors.append(f"{prefix}: lighting must be blank/normal/low/harsh/mixed")
        if row.get("label_visibility", "").strip() not in VISIBILITY_VALUES:
            errors.append(f"{prefix}: label_visibility must be blank/full/partial/tiny/none")
        multiple = row.get("multiple_bottles", "").strip()
        if multiple not in YES_NO_VALUES:
            errors.append(f"{prefix}: multiple_bottles must be blank/yes/no")
        bbox = row.get("label_bbox_xyxy", "").strip()
        if bbox:
            try:
                coords = [int(value.strip()) for value in bbox.split(",")]
                if len(coords) != 4:
                    raise ValueError
                x1, y1, x2, y2 = coords
                if image_size is None or not (0 <= x1 < x2 <= image_size[0] and
                                              0 <= y1 < y2 <= image_size[1]):
                    raise ValueError
            except ValueError:
                errors.append(
                    f"{prefix}: label_bbox_xyxy must be x1,y1,x2,y2 inside the original image")
        if multiple == "yes" and not bbox:
            warnings.append(f"{prefix}: multiple-bottle image has no target label_bbox_xyxy")

    for group, members in groups.items():
        active_splits = {row["split"].strip() for row in members
                         if row["split"].strip() not in {"pool", "none", ""}}
        slugs = {row["true_slug"].strip() for row in members if row["true_slug"].strip()}
        if len(active_splits) > 1:
            errors.append(f"bottle_group_id {group!r} appears in multiple splits: {sorted(active_splits)}")
        if len(slugs) > 1:
            errors.append(f"bottle_group_id {group!r} has conflicting slugs: {sorted(slugs)}")
    for digest, splits in sha_splits.items():
        if len(splits) > 1:
            errors.append(f"image SHA-256 {digest} appears in multiple splits: {sorted(splits)}")
    for session, splits in session_splits.items():
        if len(splits) > 1:
            warnings.append(
                f"capture_session_id {session!r} appears in multiple splits: {sorted(splits)}")
    for line, row in enumerate(rows, start=2):
        parent = row["parent_query_id"].strip()
        if parent:
            if parent not in by_id:
                errors.append(f"line {line}: parent_query_id does not exist: {parent}")
            elif (row["split"].strip() not in {"pool", "none", ""} and
                  by_id[parent]["split"].strip() != row["split"].strip()):
                errors.append(f"line {line}: child and parent must use the same active split")

    return {
        "schema_version": SCHEMA_VERSION,
        "rows": len(rows),
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "label_status_counts": dict(label_counts),
        "gallery_state_counts": dict(gallery_counts),
        "split_counts": dict(split_counts),
        "catalog_slug_count": len(catalog_slugs),
        "gallery_slug_count": len(gallery_slugs),
    }


def export_field_eval(manifest: Path, data_root: Path, catalog_csv: Path,
                      gallery_path: Path, split: str, output_dir: Path) -> dict:
    if split not in {"dev", "test"}:
        raise ValueError("Evaluation split must be dev or test")
    report = validate_field_manifest(manifest, data_root, catalog_csv, gallery_path)
    if report["errors"]:
        raise ValueError("Field manifest is invalid; run `wine-cv validate-field` first")
    rows, _ = read_field_manifest(manifest)
    gallery_slugs = {row["slug"] for row in read_jsonl(gallery_path)}
    selected = [row for row in rows if row["split"].strip() == split and
                row["label_status"].strip() == "confirmed" and
                row["true_slug"].strip() in gallery_slugs and
                row["source_kind"].strip() in {"field", "organizer"}]
    if not selected:
        raise ValueError(f"No confirmed, indexed original rows found for split {split}")
    output_dir.mkdir(parents=True, exist_ok=True)
    queries = output_dir / f"queries.{split}.tsv"
    labels = output_dir / f"labels.{split}.tsv"
    with queries.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["query_id", "image_path"], delimiter="\t",
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows({"query_id": row["query_id"], "image_path": row["image_path"]}
                         for row in selected)
    with labels.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["query_id", "slug"], delimiter="\t",
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows({"query_id": row["query_id"], "slug": row["true_slug"]}
                         for row in selected)
    excluded = Counter()
    for row in rows:
        if row["split"].strip() != split:
            continue
        if row["label_status"].strip() != "confirmed":
            excluded[row["label_status"].strip() or "unlabeled"] += 1
        elif row["true_slug"].strip() not in gallery_slugs:
            excluded["not_indexed"] += 1
        elif row["source_kind"].strip() not in {"field", "organizer"}:
            excluded["derived_or_synthetic"] += 1
    receipt = {"split": split, "exported": len(selected), "excluded": dict(excluded),
               "queries": str(queries), "labels": str(labels)}
    (output_dir / f"export.{split}.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt
