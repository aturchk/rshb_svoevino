# GPU plan for accurate and fast wine-label retrieval

Status: frozen SigLIP 2 retrieval, low-rank adapter training, and optional ORB reranking were executed on reference GPU hardware on 28 September 2026. Measured numbers are synthetic proxy-regression results only, not real-photo accuracy. See [TRAINING_RESULTS.md](TRAINING_RESULTS.md). The task requirements and data audit are in [TASK_CONTEXT.md](TASK_CONTEXT.md).

## 1. Start from a trusted catalog and a real evaluation set

`wine-cv prepare-strict` now creates a **928-wine strict model gallery** from 2,103 distinct CSV slugs. The linkage stage first produces 1,014 unique candidates: 917 by normalized photo name and 97 by exact Russian-to-Latin transliteration. It excludes 1,039 missing links, 26 ambiguous links, and 24 linked rows involved in four shared asset IDs or 12 byte-identical content groups; these conflict groups partly overlap. The strict stage then excludes 81 candidates from 70 full-catalog groups where normalized wine name plus winery identifies multiple slugs, and five low-resolution references. The six remaining exact-slug filename candidates stay in a manual-review queue. The report `work/catalog-strict-report.json` records every exception and threshold.

For the first model comparisons, use only this 928-item strict gallery. Keep every excluded row in the report so it cannot silently enter evaluation. Manually inspect all retained links when practical, or at minimum a stratified sample plus every transliterated link; filename agreement is strong technical linkage but does not prove visual label correctness. If the original Strapi media relation or additional uploads become available later, regenerate the gallery as a new version and rerun every benchmark.

The 100 photos in `dataset/real_photo` now have one-pass manual decisions in
`data/field_mapping.tsv`: 64 confirmed exact-SKU, 35 `not_in_catalog`, and one
`uncertain`. Only 23 confirmed photos target SKU present in strict gallery; 41 expose
missing reference coverage. The rows remain a single-reviewed pool, not a final test.
The three photos in `eval/queries/` still have no answers and are transport fixtures only.
The official test is expected separately on 1 October 2026. The full annotation contract
is in [FIELD_DATA.md](FIELD_DATA.md).

Keep the manually reviewed 100-photo pool for development and targeted error analysis;
do not retroactively call it a held-out test. Group burst photos, crops and shots of the
same physical bottle before any future training/dev split. Freeze the model before the
separate official test is opened on 1 October. One hundred field photos remain too small
for a stable 90–100% performance claim across conditions; expand coverage with confusing
sibling vintages and absent products after the competition. The three unlabeled organizer
fixtures can check API behavior and latency only.

## 2. Measurement contract

Use one gallery snapshot and the same query split for every experiment. Save the exact model checkpoint, preprocessing version, gallery file hash, split hash, hardware, precision, and per-query ranking. Report:

| Metric | Purpose |
| --- | --- |
| Top-1 accuracy and micro-F1@1 | Exact `slug` hit on in-gallery queries. With one required prediction and one true slug per query, these are numerically equal. |
| Recall@5, Recall@20 | Whether a reranker has a chance to recover the answer. If the true slug misses Top-20, improve retrieval before reranking. |
| Set-based F1@5 | To satisfy the brief's Top-5 F1 request; state its definition and also show Recall@5, which is easier to interpret. |
| Sibling-vintage error rate | Failures where the correct producer/line is found but year or variant is wrong. |
| Out-of-gallery false-accept and reject rates | Product behavior only, measured on separately labeled absent wines. |
| p50/p95 latency and stage timings | Decode, crop, encoder, search, OCR, local matching, and serialization on the target VM. Include cold-start/index-build separately. |

Never call the similarity score or Top-1/Top-2 margin “F1” or a calibrated probability. The organizer endpoint must always return one `slug`; the consumer product may later abstain if an independently calibrated threshold supports it. Keep both contracts explicit.

## 3. First GPU retrieval system

**Implemented first retrieval baseline:** frozen [SigLIP 2 B/16 at 384 px](https://github.com/google-research/big_vision/blob/main/big_vision/configs/proj/image_text/README_siglip2.md), with exact cosine search over L2-normalized image embeddings. Compare it with the native-aspect-ratio B/16 NaFlex checkpoint at 256 and then 512 patches because small vintage text and tall labels may benefit from additional resolution and preserved aspect ratio; performance on these wine photos is still unmeasured. A later control can use a visual-only [DINOv3 ViT-S/16 or ViT-B/16](https://github.com/facebookresearch/dinov3/blob/main/README.md) checkpoint. Pick the winner on held-out field photos and target-VM latency.

Precompute each reference embedding offline. A 2,103 × 768 float32 matrix is about 6.5 MB, so exact GPU matrix multiplication is simple; [Faiss `IndexFlatIP`](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes) is another exact inner-product implementation after vector normalization. Approximate indexes are unnecessary at this catalog size and can lose hard near-duplicate candidates. Keep the embedding tensor resident on the GPU. Search itself should be a small fraction of total latency; measure before optimizing it.

For each query, compare two views: the orientation-corrected full image and a label crop. Start with manually checked crop boxes on the field-photo set; then evaluate a small label detector if crops demonstrably improve results. Never discard the full-image branch when detection fails. Normalize EXIF orientation, color, scaling, and padding in exactly the same way for reference and query images. Test contrast enhancement and glare handling as ablations, not unvalidated default transformations. Perspective rectification is useful only when corners or a homography are geometrically plausible; otherwise keep the original crop. [OpenCV's homography guide](https://docs.opencv.org/4.x/d1/de0/tutorial_py_feature_homography.html) shows feature matching with RANSAC inlier checks.

Build a union of Top-20 or Top-50 results across useful views/encoders, deduplicate by `slug`, and record candidate recall before doing any expensive reranking. If Top-20 recall is not high on hard-vintage queries, add crop quality, resolution, or a second encoder first.

## 4. Rerank near duplicates with text and geometry

Run OCR on gallery labels offline and cache recognized tokens. Run query OCR once, preferably on the crop. Compare producer/brand, cuvée, grape, and visible vintage/year to the top visual candidates; normalize Cyrillic/Latin variants, punctuation, and common OCR substitutions. The CSV has **no structured vintage column**. Use year text from reference OCR and from name/slug only where actually present; do not invent a year. Penalize a year mismatch strongly only when both readings are reliable. [PaddleOCR PP-OCRv5](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md) documents Cyrillic/Russian and English recognition options; test this or another suitable engine on the actual VM and labels.

For the few candidates that remain visually close, compare local image correspondences. Begin with SIFT/ORB descriptors and RANSAC inlier counts on label crops, caching gallery descriptors offline. Evaluate [LightGlue](https://github.com/cvg/LightGlue) only if classical matching improves hard cases but becomes a latency bottleneck; its published speed is measured on other image-matching tasks, so wine performance must be benchmarked here. Use geometric evidence only when enough reliable keypoints survive glare and curvature.

Fuse visual similarity, OCR evidence, and geometric consistency with a small transparent reranker trained or tuned on development queries. Test each stage as an ablation. Route easy, high-margin cases through a fast visual path and invoke OCR/local matching for low-margin or known sibling-series cases only if the validation set shows this saves time without reducing accuracy. Calibrate any fast-path threshold on development data, then freeze it before the held-out test.

## 5. Conservative adapter before any backbone fine-tuning

With roughly one reference image per SKU, immediate full-model training is prone to memorizing backgrounds and synthetic artifacts. First collect more real labeled views of hard products. Generate controlled gallery augmentations that model perspective, glare, exposure, blur, scale, crop, and partial occlusion **without erasing the identifying words/year**. Group every derivative with its source image in all splits.

The implemented first step is a rank-64 residual adapter over a frozen backbone. Four deterministic augmented views per SKU are trained against all 928 reference prototypes, so the full catalog supplies in-batch hard negatives. A separate deterministic view is used only as a proxy-regression check. The best proxy epoch improved Top-1 from 0.9009 to 0.9504, but this is not independent real-photo evidence.

Next compare this adapter with the frozen encoder on a manually reviewed development split, then consider partial backbone tuning and only later full fine-tuning. Use positives from the same exact SKU and explicitly oversample negatives from the same winery/line with different vintage, color, or category. [Supervised contrastive learning](https://proceedings.neurips.cc/paper/2020/hash/d89a66c7c80a29b1bdbab0f2a1a94af8-Abstract.html) remains a candidate objective, not a guarantee of improvement. Accept a tuned model only when held-out real-photo Top-1 and hard-sibling performance improve without a material latency regression.

## 6. GPU VM implementation and speed work

Use a CUDA-enabled VM with enough VRAM for the chosen encoder plus OCR/reranker; choose batch size and resolution after the actual GPU model is known. Pin CUDA, PyTorch, model checkpoints, and container versions, then build a reproducible image. At startup load weights, reference vectors, OCR text, and local descriptors; warm the model before timed requests. For the organizer's sequential request pattern, optimize batch size 1 latency rather than throughput.

Use `torch.inference_mode()` and test FP16/BF16 inference with [PyTorch AMP guidance](https://docs.pytorch.org/tutorials/recipes/recipes/amp_recipe.html). Compare every lower-precision ranking against FP32 on hard pairs. Synchronize CUDA when measuring stage time. If profiling shows encoder inference dominates, evaluate fixed-shape export or TensorRT; follow [NVIDIA's optimization guidance](https://docs.nvidia.com/deeplearning/tensorrt/latest/performance/optimization.html) and validate accuracy after conversion. If OCR dominates, reduce how often it runs before optimizing the vector index. Keep the organizer's flat `{"slug":"..."}` endpoint and reuse its script for end-to-end timing on the VM.

The goal from the brief is Top-1 accuracy near 90–100% and response time under 3 seconds. The reference GPU proxy run met the latency target with p95 84.9 ms for adapter-SigLIP and 133.5 ms with ORB, but **official test accuracy remains unmeasured**. Freeze the candidate before opening the sealed test package and preserve an accuracy guardrail for every later speed optimization.

## 7. Ordered experiment gates

| Gate | Experiment | Move forward when… |
| --- | --- | --- |
| A | Review the 928 strict links and label field photos | Gallery conflicts are quarantined; a frozen split and answer manifest exist. |
| B | dHash/ORB control, SigLIP 2 384 raw, DINOv3 raw | Top-1, Recall@20, and p95 are reported on the same real queries. |
| C | NaFlex at 256/512 patches, crop vs full image | Candidate recall improves enough to justify added GPU time. |
| D | OCR and geometry reranking, separately and together | Held-out Top-1 and sibling-vintage errors improve; p95 stays within the 3 s goal. |
| E | Conditional fast path and precision/export tuning | Speed improves without loss of held-out accuracy. |
| F | Adapter/contrastive fine-tuning if needed | Improvement persists on unseen real photos, beyond synthetic training views. |

The GPU path is implemented in `src/wine_cv/siglip.py`: official checkpoint preprocessing, a vision-only encoder, optional validated adapter, exact cosine retrieval, bounded decode size, and a content-addressed safetensors cache. `src/wine_cv/training.py` owns deterministic proxy views and adapter training. `SiglipOrbRerankPipeline` in `src/wine_cv/pipelines.py` implements the candidate-only geometric reranker. `src/wine_cv/field_data.py` owns manual-label validation and frozen benchmark export; the benchmark records complete rankings, hashes, metrics, CUDA-synchronized latency, and model/cache metadata. Future crop and OCR stages should keep the existing `fit`/`predict` contract so pipeline configuration changes do not rewrite evaluation or API code.
