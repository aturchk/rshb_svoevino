# Model card: Svoe Vino SigLIP 2 retrieval candidate

## Intended use

Retrieval of an exact wine SKU from a trusted reference gallery using a mobile/field photo. The product API returns Top-5 raw cosine-ranked candidates. The organizer endpoint returns a flat Top-1 slug.

## Model

- Backbone: `google/siglip2-base-patch16-384`
- Revision: `f775b65a79762255128c981547af89addcfe0f88`
- Adaptation: frozen vision tower + rank-64 residual adapter
- Embedding: 768 dimensions, L2-normalized FP32 output
- Retrieval: exact cosine over 928 references
- Optional reranker: ORB reciprocal-rank fusion over SigLIP Top-50; disabled by default

## Training data

Four deterministic field-like transforms per strict catalog reference. This is single-reference augmentation, not independent field-photo supervision. Every gallery item participates as a negative in the 928-way objective.

## Evaluation

Synthetic proxy only: 928 deterministic JPEG queries generated from the same catalog references. Adapter-SigLIP reached Top-1 0.940733, Recall@5 0.998922 and p95 84.89 ms. These values must not be represented as accuracy on real retail photographs.

## Runtime

RTX PRO 4500 Blackwell; BF16; SDPA; PyTorch 2.8.0+cu128; CUDA 12.8; Transformers 5.17.0. Production load requires the pinned offline model snapshot, adapter sidecar, content-addressed gallery cache and the verified reference-image release.

## Known limitations

- Strict gallery covers 928/2 103 SKU (44.13%).
- The 100 real photos have one-pass manual decisions (64 confirmed, 35 out of catalog,
  one uncertain), but they are a single-reviewed development pool, not an official test.
- Only 23 confirmed photos target SKU represented in the strict gallery; 41 confirmed
  photos expose reference-coverage gaps.
- Cosine similarity is not a probability.
- `matched` and `not_found` must remain uncalibrated until reviewed in/out-of-catalog field examples exist.
- Near-identical vintages/labels are deliberately quarantined where the catalog-to-image relation is ambiguous.

## Release policy

Every release pins the model revision, adapter hash, gallery file hash, reference-image hashes, runtime versions and threshold version. One process owns one GPU; the browser reaches ML only through the Nuxt server proxy. The candidate must remain frozen after the official 1 October test package is opened.
