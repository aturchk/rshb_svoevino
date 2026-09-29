#!/usr/bin/env python3
"""Package only verified gallery references and ML code for an isolated GPU run."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import tarfile
from pathlib import Path

from wine_cv.catalog import read_gallery


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def add_file(archive: tarfile.TarFile, source: Path, name: str) -> None:
    info = archive.gettarinfo(str(source), arcname=name)
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mtime = 0
    with source.open("rb") as content:
        archive.addfile(info, content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--gallery", type=Path,
                        default=Path("work/vino-svoe/gallery-reviewed-candidates.jsonl"))
    parser.add_argument("--output", type=Path, default=Path("work/runpod/site-training.tar"))
    args = parser.parse_args()

    root = args.root.resolve()
    gallery_path = (root / args.gallery).resolve()
    if not gallery_path.is_relative_to(root):
        raise ValueError("Gallery must be inside the repository root")
    gallery = read_gallery(gallery_path, root)
    references = sorted({Path(item["image_path"]).relative_to(root) for item in gallery})
    code = sorted((root / "ml" / "src" / "wine_cv").glob("*.py"))
    inputs = [root / "ml" / "pyproject.toml", *code, gallery_path,
              *(root / relative for relative in references)]
    output = args.output.resolve()
    if output.is_relative_to(root) and output in inputs:
        raise ValueError("Output archive overlaps an input")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing bundle: {output}")

    manifest = {
        "format": 1,
        "gallery": gallery_path.relative_to(root).as_posix(),
        "gallery_sha256": sha256(gallery_path),
        "references": len(gallery),
        "files": {path.relative_to(root).as_posix(): sha256(path) for path in inputs},
    }
    with tarfile.open(output, "w") as archive:
        for path in inputs:
            add_file(archive, path, path.relative_to(root).as_posix())
        data = (json.dumps(manifest, ensure_ascii=False, sort_keys=True,
                           indent=2) + "\n").encode("utf-8")
        info = tarfile.TarInfo("training-bundle-manifest.json")
        info.size = len(data)
        info.mtime = 0
        archive.addfile(info, io.BytesIO(data))
    print(json.dumps({"output": str(output), "bytes": output.stat().st_size,
                      "references": len(gallery), "gallery_sha256": manifest["gallery_sha256"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
