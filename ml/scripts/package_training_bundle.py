#!/usr/bin/env python3
"""Create a minimal, hash-preserving local training bundle without source rewrites."""

from __future__ import annotations

import argparse
import json
import tarfile
from pathlib import Path


def portable_tar_info(info: tarfile.TarInfo) -> tarfile.TarInfo:
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    return info


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    parser.add_argument("--output", type=Path, default=Path("work/training-bundle.tar.gz"))
    args = parser.parse_args()
    root = args.root.resolve()
    gallery_path = (root / args.gallery).resolve()
    files = {
        root / "ml/pyproject.toml", root / "ml/README.md",
        root / "ml/docs/ARCHITECTURE.md", root / "ml/docs/CV_PLAN.md",
        root / "ml/docs/FIELD_DATA.md", root / "ml/docs/TASK_CONTEXT.md",
        root / "ml/docs/TRAINING_RESULTS.md",
        gallery_path, root / "work/catalog-strict-report.json",
        root / "dataset/strapi_output0709.csv",
    }
    for directory in (root / "ml/src", root / "ml/tests", root / "ml/scripts", root / "data",
                      root / "eval", root / "dataset/real_photo"):
        if directory.is_dir():
            files.update(path for path in directory.rglob("*") if path.is_file()
                         and "__pycache__" not in path.parts
                         and path.name != ".DS_Store"
                         and not any(part.endswith(".egg-info") for part in path.parts))
    for line in gallery_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            files.add(root / json.loads(line)["image_path"])
    missing = sorted(str(path) for path in files if not path.is_file())
    if missing:
        raise FileNotFoundError(f"Bundle inputs are missing: {missing[:10]}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.output, "w:gz") as archive:
        for path in sorted(files):
            archive.add(path, arcname=(Path("rshb_svoevino") / path.relative_to(root)).as_posix(),
                        recursive=False, filter=portable_tar_info)
    print(json.dumps({"output": str(args.output), "files": len(files),
                      "bytes": args.output.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
