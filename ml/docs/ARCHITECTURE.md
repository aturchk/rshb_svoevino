# Experiment architecture

```text
CSV + Strapi uploads ──> catalog linkage ──> strict quality quarantine
                                                    │
                                      portable gallery-strict.jsonl
                                                    │
                       explicit data root + SHA-256 validation
                                                    │
                           ┌────────────────────────┴──────────────────────┐
                           │                                               │
              SigLIP 2 gallery encoding                         dHash / ORB baselines
                           │
          content/config-addressed safetensors cache + JSON metadata
                           │
field photo ──> identical preprocessing ──> exact cosine ranking ──> Top-K slugs
                                                                  │
                                               benchmark artifacts or eval API

field photos ──> annotation template + catalog lookup ──> validation
                                                              │
                                      reviewed dev/test queries + labels
```

## Layer boundaries

| Layer | Code | Responsibility |
| --- | --- | --- |
| Catalog linkage | `src/wine_cv/catalog.py` | Deduplicate the catalog, link photo names to uploads, verify readable candidates, quarantine ambiguous/shared assets and byte-identical cross-slug images, then apply the strict semantic-collision and pixel-resolution filters. Write relative paths, dimensions, quality profile, and content hashes to `gallery-strict.jsonl`. |
| Portable gallery loading | `src/wine_cv/catalog.py` | Resolve every reference below an explicit `data_root`; validate JSONL structure, unique slug/reference IDs, path containment, file existence, and SHA-256 before indexing or inference. |
| Field-data preparation | `src/wine_cv/field_data.py` | Create an annotation TSV and catalog lookup, validate label/review enums, hashes, catalog membership, parent/group consistency, and split leakage, then export only confirmed indexed original field/organizer images to benchmark query and label TSVs. |
| Pipeline contract | `src/wine_cv/pipelines.py` | Register interchangeable `dhash`, `orb`, and `siglip2` implementations behind `fit(gallery)` and `predict(image, top_k)`. Scores are comparable only within one configured pipeline. |
| SigLIP 2 retrieval | `src/wine_cv/siglip.py` | Load the frozen FixRes or NaFlex vision tower, apply EXIF-aware RGB preprocessing from the matching processor, L2-normalize embeddings in FP32, keep the gallery matrix on the selected device, and rank all references by exact cosine similarity. |
| Evaluation | `src/wine_cv/benchmark.py` | Run a fixed manifest after configurable warm-up, synchronize CUDA around timings, save full rankings, and report Top-1/micro-F1, Recall@5/@20, F1@5, mean/p50/p95 latency, and the rate within three seconds when labels exist. |
| Sealed acceptance I/O | `src/wine_cv/eval_data.py`, `eval/run_acceptance.sh` | Validate test paths, image decoding and hashes before inference; preserve query order; record model metadata; validate output slugs and latency without requiring or inferring private answer labels. |
| API adapter | `src/wine_cv/api.py` | Load the validated gallery and configured pipeline, including the required SigLIP cache, accept multipart field `image`, and return the organizer-compatible Top-1 response `{"slug":"..."}`. |
| Orchestration | `src/wine_cv/cli.py` | Expose gallery preparation, SigLIP index building, benchmarking, serving, and field-template/validation/export commands with one shared set of model, device, precision, cache, and data-root options. |

## SigLIP cache contract

`wine-cv build-index` writes normalized gallery embeddings as safetensors and a JSON sidecar. The cache fingerprint includes the format version, model ID and resolved revision, inference precision and batch size, PyTorch and Transformers versions, processor fingerprint, attention implementation, NaFlex patch limit when applicable, and the ordered `(slug, image_sha256)` gallery snapshot. Filesystem locations are excluded, so the same verified data can move between machines using the same runtime stack.

On load, the pipeline requires matching metadata and slug order and checks tensor row count, embedding dimension, finite values, and unit norms. A missing or incompatible cache is rebuilt under `auto`, rebuilt under `refresh`, and rejected under `require`; `serve` defaults to `require`. Model weights can be restricted to the local Hugging Face cache with `--offline`.

## Reproducible evaluation

Each benchmark summary records gallery, query-manifest, and optional label hashes; ranking depth and warm-up count; total index setup time; and SigLIP runtime metadata including resolved model revision, device, precision, cache hit, model-load time, cache-load time, and gallery-encoding time. CUDA synchronization keeps measured query latency aligned with completed GPU work.

Field-photo splits are prepared outside the benchmark. Validation keeps each `bottle_group_id` within one active split and requires derived rows to share their parent's active split. Uncertain, out-of-catalog, non-indexed, synthetic, and derived rows remain in the audit manifest but are excluded from the exact-slug retrieval score.

## Extending the system

New retrieval pipelines implement the common `fit`/`predict` contract and register in `make_pipeline` and the CLI. Query and reference preprocessing must remain identical, returned scores must be higher-is-better, and benchmark metadata must fully identify any new model or index state. OCR, geometric reranking, and calibrated rejection remain later stages described in [CV_PLAN.md](CV_PLAN.md).

The product service can resolve the predicted slug to the full Strapi wine card and add an after-search action. Out-of-catalog rejection requires a separately labeled dataset and calibrated threshold; cosine similarity and the Top-1/Top-2 margin are not probabilities or per-image F1 scores.
