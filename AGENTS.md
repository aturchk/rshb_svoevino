# Repository Guidelines

## Project Structure & Module Organization

Python code lives in `ml/src/wine_cv/`. `catalog.py` builds the reference gallery, `field_data.py` manages annotations, `pipelines.py` defines the retrieval interface, `siglip.py` implements GPU retrieval, and `benchmark.py`, `api.py`, and `cli.py` provide evaluation and entry points. Tests are in `ml/tests/` and use `unittest`. The Nuxt application lives in `frontend/`.

Treat `dataset/` as source material. Reviewed annotation inputs belong in `data/`; organizer fixtures are in `eval/`. Generated galleries, caches, predictions, and reports belong in ignored `work/`. Consult `ml/docs/ARCHITECTURE.md`, `ml/docs/FIELD_DATA.md`, and `ml/docs/CV_PLAN.md` before changing data or model contracts.

## Build, Test, and Development Commands

Create a local environment and install the needed extras:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e './ml[orb,api]'
```

Use `./ml[siglip,api]` on a VM after installing the matching CUDA PyTorch build.

```bash
.venv/bin/wine-cv prepare --data-root .
.venv/bin/wine-cv validate-field --manifest data/field_mapping.tsv --data-root .
.venv/bin/python -m unittest discover -s ml/tests -v
.venv/bin/wine-cv benchmark --pipeline dhash \
  --output work/dhash.jsonl --summary work/dhash-summary.json
```

`prepare` regenerates the trusted gallery; review count changes before accepting them. GPU commands are documented in `ml/README.md`.

## Coding Style & Naming Conventions

Target Python 3.10+. Use four-space indentation, type hints on public functions, `pathlib.Path` for filesystem work, and small modules. Use `snake_case` for functions and variables, `PascalCase` for classes, and kebab-case CLI subcommands. No formatter or linter is configured, so follow standard-library import grouping and nearby style. Keep paths portable and validate hashes at data boundaries.

## Testing Guidelines

Name files `test_*.py` and methods `test_*`. Prefer deterministic temporary images and tiny local model fixtures. Tests must not require network downloads or a GPU; optional integration tests should skip when dependencies are absent. Cover linkage ambiguity, cache validation, split leakage, and metric changes.

## Data Integrity & Reproducibility

Do not rename or rewrite source images. Preserve generated query IDs and SHA-256 values. Never infer ground truth from filenames or report F1 without reviewed labels. Keep model revision, precision, runtime versions, gallery hash, and split hash in benchmark artifacts.

## Commit & Pull Request Guidelines

History contains only an initial commit, so no message convention exists. Use short imperative subjects, for example `Add SigLIP cache validation`. Keep commits focused. Pull requests should explain the change, list verification commands, identify data-count or schema changes, and include GPU/model details for performance claims. Link issues when available; include screenshots only for UI changes. Do not commit `work/`, virtual environments, model weights, or caches.
