# Svoe Vino: reproducible CV retrieval experiments

This package turns the supplied catalog and media export into a reviewable reference gallery, validates manual field-photo labels, compares interchangeable retrieval pipelines, and serves both the product and organizer prediction endpoints. The source brief is summarized in [TASK_CONTEXT.md](docs/TASK_CONTEXT.md), the experiment order is in [CV_PLAN.md](docs/CV_PLAN.md), and the annotation contract is in [FIELD_DATA.md](docs/FIELD_DATA.md).

The older strict-gallery training receipt in
[TRAINING_RESULTS.md](docs/TRAINING_RESULTS.md) is a historical synthetic regression
experiment, not the production candidate. The 100 `real_photo` files have
one-pass manual decisions and remain a development pool; no closed-test result
is claimed here.

## Production candidate (29 September 2026)

The checked-in snapshot under `dataset/vino-svoe/` contains 2,110 wine pages,
their complete parsed site attributes, original downloaded photos, normalized
white-background views, and a SHA-checked 1,936-SKU reviewed gallery. The
11 manually released ambiguous references and three quarantined mistakes are
bound to source-image SHA-256 in `data/site_reference_review.tsv`. The
original Strapi inputs remain untouched. See [SITE_DATASET.md](docs/SITE_DATASET.md)
for provenance, resumable refresh, normalization, and exclusion rules.

The inference model is frozen
`google/siglip2-base-patch16-384` at revision
`f775b65a79762255128c981547af89addcfe0f88` plus the committed
[rank-64 adapter](models/README.md) trained on catalog-derived full-bottle and
label views on an RTX 5090. It indexes both whole-bottle and existing-pixel
label crops, retaining the full field photo as its query. The base checkpoint
is downloaded once; no field or closed-test image was used to train the
adapter. The packaged model component is
`ml/models/siglip2-site-label-adapter.safetensors` with its JSON receipt.

On the same 59 one-pass reviewed, gallery-covered field photos, the RTX 5090
baseline scored **39/59 Top-1 (66.1%)**, **51/59 Recall@5 (86.4%)**, p95
**232.25 ms**. The adapter scored **41/59 Top-1 (69.5%)**, **53/59 Recall@5
(89.8%)**, p95 **237.50 ms**. Both were below three seconds for all 59.
Five confirmed photos have no indexed answer, and the pool is not an
independent test; do not present these as official accuracy or the 90% target.
Definitions, prediction files, SHA receipts, full commands, limitations, and
all requested TZ metrics are in [FIELD_ACCURACY_REPORT.md](docs/FIELD_ACCURACY_REPORT.md).

For the complete local application:

```bash
make local-setup
make local
```

`make local-setup` downloads the pinned base encoder, validates every gallery
image hash, builds the adapter-specific `full-label` index, and builds Nuxt.
The inference service and UI then run at `127.0.0.1:8080` and
`127.0.0.1:3000`. CUDA, Apple MPS, and CPU are supported, but the measured
latencies above are for the specified RTX 5090 configuration.

## Current data snapshot

The public site can be refreshed separately with:

```bash
PYTHONPATH=ml/src .venv/bin/python -m wine_cv.site_dataset --workers 8
```

This produces a resumable catalog, full-size site photos, normalized reference
views, an exact-slug join to the CSV below, and candidate galleries in
`work/vino-svoe/`. See [SITE_DATASET.md](docs/SITE_DATASET.md) for the data
contract. The checked-in snapshot is the selected production gallery; the
older strict-gallery numbers below are retained for historical comparison.

`dataset/strapi_output0709.csv` has 4,147 rows but only 2,103 distinct slugs; 2,044 rows are exact duplicates. The three upload folders contain 3,483 supported images. The deterministic linker finds 1,038 filename matches before conflict checks: 941 after separator and Strapi-hash normalization, plus 97 after exact Russian-to-Latin transliteration. It then quarantines every cross-slug asset or byte-identical image conflict.

The resulting trusted gallery contains **1,014 slugs**: 917 ordinary normalized-name links and 97 transliterated links. Another 1,039 catalog rows have no matching upload, 26 are ambiguous, and 24 linked rows are quarantined because they participate in four shared asset IDs or 12 byte-identical content groups. Some conflict groups overlap, so those group counts must not be added. Six weaker slug-filename candidates remain in the review report and are not indexed.

The model-facing **strict gallery contains 928 slugs**. It additionally quarantines 81 linked rows belonging to 70 catalog groups where normalized wine name plus winery identifies more than one slug, and five genuinely low-resolution references. The latter rule is deliberately conservative: short side below 192 pixels or fewer than 150,000 total pixels. These sets do not overlap in the current snapshot.

Underscores do not need to be changed to spaces. The linker already treats spaces, underscores, and hyphens equivalently. Do not rename the source photos: paths and SHA-256 hashes are part of the reproducibility contract.

## Installation

Python 3.10+ is required.

For the lightweight CPU harness:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e './ml[orb,api]'
```

For the complete local SigLIP pipeline (CUDA, Apple MPS, or CPU):

```bash
.venv/bin/python -m pip install -e './ml[siglip,api]'
```

The project pins `transformers==5.17.0`. No API key is needed. The first online run downloads the public Apache-2.0 model; final benchmark and service runs can use `--offline` after the files are cached. From the repository root, `make local-setup` performs the full preparation and automatically selects CUDA, Apple MPS, or CPU.

## Historical strict-gallery harness

The following steps preserve the original 928-SKU experiment and annotation
workflow. For the production candidate, use the checked-in 1,936-SKU site
gallery and `make local-setup` above.

## 1. Build the reference gallery

Run from the repository root:

```bash
.venv/bin/wine-cv prepare-strict --data-root .
```

This writes portable `work/gallery-strict.jsonl` and the full decision log `work/catalog-strict-report.json`. Every gallery row has a stable `reference_id`, a relative path, the image SHA-256, dimensions, and `quality_profile=strict-v1`. Readers reject absolute or escaping paths, missing files, modified bytes, duplicate slugs, and duplicate reference IDs. The source catalog and photos are never rewritten or renamed.

Use `wine-cv prepare` only when the broader 1,014-row linkage gallery is needed for audit or coverage analysis. Review the strict report before treating the 928 retained links as semantically correct. Filename agreement proves a deterministic technical link; it does not replace a visual check or the original Strapi media relation.

## 2. Review the manual field mapping

The repository already contains:

- `data/field_mapping.tsv`: one row for each of the 100 original field photos, with stable IDs, paths, and hashes.
- `data/catalog_lookup.tsv`: all 2,103 catalog slugs and identifying fields, plus `indexed` or `not_indexed` gallery state.

The current mapping contains 64 exact-SKU confirmations, 35 `not_in_catalog`
decisions, and one `uncertain` row. All 100 rows are `single_reviewed` and remain in
`split=pool`: they are not a frozen final test. Of the 64 confirmations, 23 photos are
retrievable by the current strict gallery and 41 expose the catalog-coverage gap.
Keep real slugs for `not_indexed` products; never substitute a similar indexed slug.

Validate the sheet:

```bash
.venv/bin/wine-cv validate-field \
  --manifest data/field_mapping.tsv --data-root . \
  --report work/field-validation.json
```

Export only confirmed, indexed, original photos for a benchmark:

```bash
.venv/bin/wine-cv export-field-eval \
  --manifest data/field_mapping.tsv --data-root . \
  --split dev --output-dir work/field-eval
```

See [FIELD_DATA.md](docs/FIELD_DATA.md) for every required and optional field, allowed values, examples, split rules, and review policy.

## 3. Build the SigLIP gallery index locally

Start with the fixed-resolution base model. The revision below freezes the checkpoint used by this repository plan:

```bash
.venv/bin/wine-cv build-index \
  --pipeline siglip2 --gallery work/gallery-strict.jsonl --data-root . \
  --model-id google/siglip2-base-patch16-384 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device auto --precision auto --batch-size 8 \
  --cache-policy refresh
```

`auto` selects CUDA first, then Apple MPS, then CPU, and chooses a supported precision. The implementation loads only the vision tower, applies the checkpoint's official image processor to EXIF-corrected RGB input, computes L2-normalized FP32 embeddings, and keeps the 928-reference matrix on the selected device. Retrieval is exact cosine search, which is appropriate at this gallery size.

The content-addressed cache consists of one `.safetensors` file and one JSON metadata file under `work/siglip-cache/`. Its identity includes model and resolved revision, PyTorch and Transformers versions, processor configuration, precision, batch size, attention implementation, NaFlex patch setting, and the ordered gallery slugs and image hashes. A service with `--cache-policy require` refuses to encode the gallery silently if the expected cache is missing or invalid.

## 4. Benchmark SigLIP on reviewed photos

After a reviewed bottle-grouped development split has been frozen and exported:

```bash
.venv/bin/wine-cv benchmark \
  --pipeline siglip2 --gallery work/gallery-strict.jsonl --data-root . \
  --manifest work/field-eval/queries.dev.tsv --images-dir . \
  --labels work/field-eval/labels.dev.tsv \
  --output work/siglip384-dev-predictions.jsonl \
  --summary work/siglip384-dev-summary.json \
  --top-k 20 --warmup 3 \
  --model-id google/siglip2-base-patch16-384 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device auto --precision auto --batch-size 8 \
  --cache-policy require --offline
```

Use the same model, revision, precision, gallery, and cache parameters for index build, benchmark, and service. The summary records file hashes, runtime configuration, index/cache timing, mean, p50, and p95 request latency, Top-1 accuracy, micro-F1@1, Recall@5, Recall@20, and set-based F1@5. Per-query JSONL retains the full requested ranking and Top-1/Top-2 margin. A similarity or margin is not a calibrated probability.

Run these experiments in order on the frozen development set:

1. `google/siglip2-base-patch16-384`.
2. `google/siglip2-base-patch16-naflex` with `--max-num-patches 256`.
3. The same NaFlex model with `--max-num-patches 512` if recall improves enough to justify the latency.
4. Full image versus an automatically produced label crop.
5. OCR and local-feature reranking only for the strongest frozen retriever.

Do not choose a model from the three unlabeled organizer fixtures. They are useful only
for endpoint and transport checks. Do not tune after opening the official 1 October test.

### Retrain the production catalog adapter (optional)

The implemented training path keeps the SigLIP 2 vision backbone frozen and
learns a rank-64 residual projection from four deterministic field-like views
per reference, mixing full bottles and label crops. The loss compares each
view against all 1,936 gallery classes. It does not rewrite source images or
use real field photos. The checked-in adapter was trained on Runpod; this
command reproduces its settings but creates a separate experimental output.

```bash
.venv/bin/wine-cv train-adapter \
  --gallery dataset/vino-svoe/gallery-reviewed-candidates.jsonl --data-root . \
  --output work/models/siglip2-site-label-adapter-retrain.safetensors \
  --model-id google/siglip2-base-patch16-384 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device cuda --precision float16 --batch-size 32 \
  --train-views 4 --val-views 1 --rank 64 --epochs 15 \
  --augmentation label-mix-v2 --seed 20260929
```

For a synthetic smoke/regression set only:

```bash
.venv/bin/wine-cv make-proxy-eval \
  --gallery work/gallery-strict.jsonl --data-root . \
  --output-dir work/proxy-eval --seed 20260929
```

The adapter file has a JSON sidecar with the exact gallery digest, model revision,
training parameters, runtime, epoch history, and an explicit proxy-only warning. Its
SHA-256 participates in the gallery-cache identity.

### Optional geometric reranker

`siglip2-orb` keeps the SigLIP Top-50 and fuses its rank with ORB local-feature rank using
reciprocal-rank fusion. Gallery descriptors are computed once; only the candidates are
matched per request.

```bash
.venv/bin/wine-cv benchmark \
  --pipeline siglip2-orb --gallery work/gallery-strict.jsonl --data-root . \
  --manifest work/field-eval/queries.dev.tsv --images-dir . \
  --labels work/field-eval/labels.dev.tsv \
  --output work/siglip-orb-dev.jsonl --summary work/siglip-orb-dev-summary.json \
  --adapter-path work/models/siglip2-field-adapter.safetensors \
  --candidate-k 50 --orb-weight 0.35 --rrf-k 20 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device auto --precision auto --batch-size 8 --cache-policy require --offline
```

The historical synthetic GPU proxy gain from ORB was only +0.0011 Top-1 while
p95 rose by about 49 ms. The selected production candidate is `siglip2` plus
the committed site-label adapter and `full-label` reference views; ORB is not
enabled. Re-evaluate it on independently reviewed field photos before rollout.

## 5. Serve the organizer endpoint

Prepare once and start the complete local ML + Nuxt stack:

```bash
make local-setup
make local
```

The application is available at `http://127.0.0.1:3000`, while the direct ML API is
at `http://127.0.0.1:8080`. On 1 October, after placing the sealed package under
`eval/test/`, stop the normal stack and run `make october-test`; it starts both services,
runs the acceptance contract through Nuxt, saves evidence, and shuts everything down.

The wrapper validates the sealed query package, records `/api/v1/metadata`, calls the
endpoint sequentially, and validates the resulting JSONL. The endpoint accepts multipart
field `image` and returns `{"slug":"..."}`. The organizer contract always requires one
slug; a later consumer flow may abstain only after its threshold is calibrated on
separately labeled out-of-catalog examples. See [`eval/README.md`](../eval/README.md).

## CPU controls and verification

The same harness supports cheap controls:

```bash
.venv/bin/wine-cv benchmark --pipeline dhash \
  --output work/dhash-predictions.jsonl --summary work/dhash-summary.json

.venv/bin/wine-cv benchmark --pipeline orb \
  --output work/orb-predictions.jsonl --summary work/orb-summary.json

.venv/bin/python -m unittest discover -s ml/tests -v
```

The supplied three query images have no answers, so their runs cannot produce accuracy or F1. The local verification covers linkage conflicts, portable gallery hashes, label export, metrics, and lazy SigLIP registration. Reference latency was measured on the hardware recorded in the evidence bundle; local latency depends on the selected CUDA/MPS/CPU device and must be read from the current receipt before making a machine-specific claim.

## Current limits

- The strict working gallery covers 928 of 2,103 catalog slugs. A model cannot retrieve a missing or quarantined reference.
- The one-pass field mapping is not an independent test: it has one reviewer, no frozen
  bottle groups, and 41 confirmed photos whose products are absent from strict gallery.
- The official test is not in the repository yet. Its package and prediction receipts
  belong under ignored `work/acceptance-<timestamp>/`; do not tune on it after disclosure.
- Shared or byte-identical media conflicts remain quarantined until a human or the source Strapi relation resolves them.
- OCR reranking, automatic label detection, rejection calibration, and fine-tuning remain experiments described in [CV_PLAN.md](docs/CV_PLAN.md); they should be added only when the frozen SigLIP benchmark shows where they help.
