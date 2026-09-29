#!/usr/bin/env python3
"""Check whether field photos are already represented by catalog assets."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import unicodedata
from pathlib import Path


def normalized_stem(value: str) -> str:
    stem = Path(value.strip()).stem.casefold()
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", stem)
        if character.isalnum()
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audit(data_root: Path) -> dict:
    catalog_csv = data_root / "dataset" / "strapi_output0709.csv"
    real_directory = data_root / "dataset" / "real_photo"
    real_photos = sorted(path for path in real_directory.iterdir() if path.is_file())

    with catalog_csv.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    catalog_names = [row.get("Название фото", "").strip() for row in rows]
    catalog_names = [value for value in catalog_names if value]
    exact_names = {Path(value).name.casefold() for value in catalog_names}
    normalized_names = {normalized_stem(value) for value in catalog_names}

    catalog_hashes: dict[str, list[str]] = {}
    for upload_directory in sorted((data_root / "dataset").glob("prod-svoe-vino-*/uploads")):
        for path in upload_directory.iterdir():
            if path.is_file() and path.name != ".DS_Store":
                catalog_hashes.setdefault(sha256(path), []).append(
                    path.relative_to(data_root).as_posix()
                )

    exact = [path.name for path in real_photos if path.name.casefold() in exact_names]
    normalized = [
        path.name for path in real_photos if normalized_stem(path.name) in normalized_names
    ]
    identical = [
        {
            "field_photo": path.name,
            "catalog_assets": catalog_hashes[sha256(path)],
        }
        for path in real_photos
        if sha256(path) in catalog_hashes
    ]
    return {
        "field_photo_count": len(real_photos),
        "catalog_row_count": len(rows),
        "checks": {
            "exact_filename": {"count": len(exact), "matches": exact},
            "normalized_filename": {"count": len(normalized), "matches": normalized},
            "byte_identical": {"count": len(identical), "matches": identical},
        },
        "conclusion": (
            "manual_annotation_required"
            if not exact and not normalized and not identical
            else "review_matches_before_annotation"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("."))
    parser.add_argument(
        "--output", type=Path, default=Path("work/real-photo-overlap.json")
    )
    args = parser.parse_args()
    root = args.data_root.resolve()
    result = audit(root)
    output = args.output if args.output.is_absolute() else root / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
