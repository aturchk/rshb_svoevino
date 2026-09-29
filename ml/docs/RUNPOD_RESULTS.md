# RunPod SigLIP 2 training receipt — 28 September 2026

## Outcome

The strict 928-SKU gallery was trained and benchmarked on a RunPod Secure Cloud
`NVIDIA RTX PRO 4500 Blackwell` Pod using the official
`runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` image. The backbone was
`google/siglip2-base-patch16-384` at revision
`f775b65a79762255128c981547af89addcfe0f88`, with PyTorch 2.8.0+cu128,
Transformers 5.17.0, BF16 inference, and SDPA attention.

The run produced a rank-64 residual adapter, an adapter-bound gallery cache, complete
Top-20 predictions, two benchmark summaries, and a machine-readable receipt with
SHA-256 hashes. All 11 listed artifact hashes were verified again after download.

## Results

All accuracy values below use deterministic synthetic distortions of the same catalog
images. They are useful for regression and pipeline selection, but must not be reported
as quality on real shop photos.

| Stage | Top-1 | Recall@5 | Recall@20 | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Frozen features, training validation proxy | 0.9009 | 0.9860 | — | — | — |
| Best adapter epoch (14), training validation proxy | 0.9504 | 1.0000 | — | — | — |
| Adapter-SigLIP, separate JPEG proxy | 0.9407 | 0.9989 | 1.0000 | 54.0 ms | 84.9 ms |
| Adapter-SigLIP + ORB Top-50 RRF | 0.9418 | 1.0000 | 1.0000 | 90.0 ms | 133.5 ms |

Adapter training took 567.9 seconds. The adapter-SigLIP gallery encode took 82.7
seconds; the resulting 928 × 768 cache is 2.85 MB. Every timed query completed within
the task's three-second target on this VM.

The ORB gain is too small on synthetic data to justify making it the default before a
reviewed field-photo development set exists. The current production candidate is
adapter-SigLIP; `siglip2-orb` stays as a configurable ablation.

## Local artifacts

Downloaded results are under `work/runpod-results/work/`:

- `models/siglip2-field-adapter.safetensors` and its JSON training receipt;
- `siglip-cache/` with adapter-bound gallery vectors and metadata;
- `proxy-siglip-summary.json` and `proxy-siglip-orb-summary.json`;
- complete prediction JSONL files;
- `runpod-receipt.json` with runtime versions and artifact SHA-256 values;
- `logs/runpod-train.log`.

The complete download archive is `work/runpod-results/rshb-results-20260928.tar.gz`
with SHA-256
`967b43b85906c92717fae78e2d0244979f0a0d1c8edfc9b44ac17d1d5e96aae4`.

## Infrastructure cleanup

The training Pod and its 50 GB network volume were terminated after the verified
download. The temporary RunPod SSH-key registration was restored to the account's
initial empty state. No Pod, volume, or registered SSH key from this run remains.

## Remaining acceptance gate

The one-pass `real_photo` mapping is complete (64 confirmed, 35 out of catalog, one
uncertain), but only 23 confirmed photos are represented in strict gallery and the pool
has one reviewer. It is development evidence, not the official test. Keep the published
adapter-SigLIP configuration frozen until the sealed test arrives on 1 October 2026, run
it through `eval/run_acceptance.sh`, and publish field-quality claims only from an
official answer set or organizer score. OCR, crop logic and ORB weights must not be tuned
after the test is opened.
