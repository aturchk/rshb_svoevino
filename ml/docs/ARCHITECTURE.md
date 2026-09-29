# ML architecture and production candidate

```text
vino-svoe sitemap + Nuxt payload + original photos
      │  resumable parser, exact slug join, SHA checks, visual quarantine
      ▼
dataset/vino-svoe/ (2,110 cards) ──> reviewed gallery (1,936 SKU)
                                         │ full bottle + label crop
                                         ▼
                           frozen SigLIP 2 vision encoder
                                         │ rank-64 trained adapter
                                         ▼
                            hash-addressed embedding cache
                                         │
field photo ──> EXIF/RGB processor ──> exact cosine Top-K slugs
                                         │
                          ML API ──> Nuxt catalog/card/organizer API

field photo labels ──> SHA-bound pool selection ──> benchmark + accuracy report
```

The original CSV/Strapi linker and its 928-SKU strict gallery remain available
as a historical baseline and fallback audit; they are no longer the default
production gallery. The site snapshot is tracked, so deployment does not
depend on the site's availability. The 385 KB adapter is tracked under
`ml/models/`; the pinned public base encoder and caches are resolved at setup.
No field image is used for adapter training. The selected query policy keeps
the whole field frame; extra center crops are an ablation, not a deployment
default.

## Layer boundaries

| Layer | Code | Responsibility |
| --- | --- | --- |
| Catalog linkage | `src/wine_cv/catalog.py` | Deduplicate the catalog, link photo names to uploads, verify readable candidates, quarantine ambiguous/shared assets and byte-identical cross-slug images, then apply the strict semantic-collision and pixel-resolution filters. Write relative paths, dimensions, quality profile, and content hashes to `gallery-strict.jsonl`. |
| Site snapshot | `src/wine_cv/site_dataset.py`, `data/site_reference_review.tsv` | Resume sitemap/page/image capture, preserve complete parsed attributes and original bytes, normalize transparent/padded reference photos, quarantine shared or misleading images, and export the reviewed portable gallery. Decisions are bound to the source-image SHA-256. |
| Portable gallery loading | `src/wine_cv/catalog.py` | Resolve every reference below an explicit `data_root`; validate JSONL structure, unique slug/reference IDs, path containment, file existence, and SHA-256 before indexing or inference. |
| Field-data preparation | `src/wine_cv/field_data.py` | Create an annotation TSV and catalog lookup, validate label/review enums, hashes, catalog membership, parent/group consistency, and split leakage, then export only confirmed indexed original field/organizer images to benchmark query and label TSVs. |
| Pipeline contract | `src/wine_cv/pipelines.py` | Register interchangeable `dhash`, `orb`, and `siglip2` implementations behind `fit(gallery)` and `predict(image, top_k)`. Scores are comparable only within one configured pipeline. |
| SigLIP 2 retrieval | `src/wine_cv/siglip.py`, `src/wine_cv/views.py` | Load the frozen FixRes or NaFlex vision tower, apply EXIF-aware RGB preprocessing from the matching processor, L2-normalize embeddings in FP32, encode full-bottle and source-pixel label views, and rank all references by exact cosine similarity. |
| Adapter training | `src/wine_cv/training.py`, `ml/models/` | Freeze the encoder; train a low-rank residual head on seeded catalog-derived field-like full/label views with no field/test photographs. Save weights and full provenance sidecar. |
| Evaluation | `src/wine_cv/benchmark.py` | Run a fixed manifest after configurable warm-up, synchronize CUDA around timings, save full rankings, and report Top-1/micro-F1, Recall@5/@20, F1@5, mean/p50/p95 latency, and the rate within three seconds when labels exist. |
| Accuracy audit | `src/wine_cv/field_report.py`, `reports/runpod-2026-09-29/` | Lock gallery/annotation/query/prediction hashes, reject stale or inconsistent summaries, and retain inspectable errors plus the requested TZ metrics on one-pass field-photo pool. |
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

New retrieval pipelines implement the common `fit`/`predict` contract and register in `make_pipeline` and the CLI. Query and reference preprocessing must remain identical, returned scores must be higher-is-better, and benchmark metadata must fully identify any new model or index state. OCR, geometric reranking, and calibrated rejection are not part of the current production configuration.

The product service can resolve the predicted slug to the full Strapi wine card and add an after-search action. Out-of-catalog rejection requires a separately labeled dataset and calibrated threshold; cosine similarity and the Top-1/Top-2 margin are not probabilities or per-image F1 scores.
