# Production SigLIP 2 adapter

`siglip2-site-label-adapter.safetensors` is the trained rank-64 residual adapter
for the frozen `google/siglip2-base-patch16-384` vision encoder at immutable
revision `f775b65a79762255128c981547af89addcfe0f88`. The base checkpoint is
not vendored here; `make local-setup` downloads it once into the Hugging Face
cache. The adapter's SHA-256 is
`bde343102f06d5e4fe02df953ecce622e2725deb800a0fa57eb34b99d3bf9701`.

The adjacent JSON sidecar is the immutable training receipt: source-gallery
digest, model/runtime versions, seed, augmentation, hyperparameters, epoch
history, and synthetic proxy scores. Keep it with the weights. The training
gallery has 1,936 SHA-checked references from the reviewed site snapshot.
Training used only synthetic derivatives of catalog images, never field or
organizer-test photographs.

Production inference uses `--reference-view-mode full-label` and
`--query-view-mode full`. It compares both the whole bottle and an existing-pixel
label crop against the entire field photograph. The exact field-photo metrics,
denominators, limitations, and Runpod commands are in
[`../docs/FIELD_ACCURACY_REPORT.md`](../docs/FIELD_ACCURACY_REPORT.md).

This small adapter is the repository's trained model component. The frozen
base checkpoint is fetched by its pinned revision, then the hash-addressed
gallery index is built locally; caches and the 1.5 GB base weights are not
committed to Git.
