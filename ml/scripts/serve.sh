#!/usr/bin/env bash
set -euo pipefail

args=(
  serve
  --pipeline "${ML_PIPELINE:-siglip2}"
  --gallery "${ML_GALLERY_PATH:-/opt/svoe/release/gallery-strict.jsonl}"
  --data-root "${ML_DATA_ROOT:-/opt/svoe/release}"
  --model-id "${ML_MODEL_ID:-google/siglip2-base-patch16-384}"
  --model-revision "${ML_MODEL_REVISION:-f775b65a79762255128c981547af89addcfe0f88}"
  --device "${ML_DEVICE:-cuda}"
  --precision "${ML_PRECISION:-bfloat16}"
  --batch-size "${ML_BATCH_SIZE:-32}"
  --cache-dir "${ML_CACHE_DIR:-/opt/svoe/release/siglip-cache}"
  --cache-policy require
  --adapter-path "${ML_ADAPTER_PATH:-/opt/svoe/release/siglip2-field-adapter.safetensors}"
  --max-upload-mb "${ML_MAX_UPLOAD_MB:-12}"
  --product-top-k "${ML_TOP_K:-5}"
  --host 0.0.0.0
  --port "${ML_PORT:-8080}"
)

if [[ "${ML_OFFLINE:-true}" == "true" ]]; then
  args+=(--offline)
fi

thresholds=(
  "${ML_NOT_FOUND_SCORE_THRESHOLD:-}"
  "${ML_MATCHED_SCORE_THRESHOLD:-}"
  "${ML_MATCHED_MARGIN_THRESHOLD:-}"
)
if [[ -n "${thresholds[0]}${thresholds[1]}${thresholds[2]}" ]]; then
  if [[ -z "${thresholds[0]}" || -z "${thresholds[1]}" || -z "${thresholds[2]}" ]]; then
    echo "All ML thresholds must be configured together" >&2
    exit 2
  fi
  args+=(
    --not-found-score-threshold "${thresholds[0]}"
    --matched-score-threshold "${thresholds[1]}"
    --matched-margin-threshold "${thresholds[2]}"
    --threshold-version "${ML_THRESHOLD_VERSION:?ML_THRESHOLD_VERSION is required}"
  )
fi

exec "${WINE_CV_BIN:-wine-cv}" "${args[@]}"
