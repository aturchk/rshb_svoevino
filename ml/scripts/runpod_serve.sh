#!/usr/bin/env bash

# Start the frozen, already-trained candidate on the same RunPod workspace used
# by runpod_train.sh. This script never retrains or changes thresholds.

set -euo pipefail

root="${1:-/workspace/rshb_svoevino}"
venv_dir="${RSHB_VENV_DIR:-/tmp/rshb-venv}"

cd "$root"
for artifact in \
  work/gallery-strict.jsonl \
  work/models/siglip2-field-adapter.safetensors \
  work/models/siglip2-field-adapter.safetensors.json \
  work/siglip-cache; do
  [ -e "$artifact" ] || {
    printf 'Missing frozen artifact: %s. Complete runpod_train.sh first.\n' "$artifact" >&2
    exit 1
  }
done
[ -x "$venv_dir/bin/wine-cv" ] || {
  printf 'Missing RunPod environment: %s/bin/wine-cv\n' "$venv_dir" >&2
  exit 1
}

export WINE_CV_BIN="$venv_dir/bin/wine-cv"
export ML_GALLERY_PATH="${ML_GALLERY_PATH:-work/gallery-strict.jsonl}"
export ML_DATA_ROOT="${ML_DATA_ROOT:-.}"
export ML_ADAPTER_PATH="${ML_ADAPTER_PATH:-work/models/siglip2-field-adapter.safetensors}"
export ML_CACHE_DIR="${ML_CACHE_DIR:-work/siglip-cache}"
export ML_DEVICE="${ML_DEVICE:-cuda}"
export ML_PRECISION="${ML_PRECISION:-bfloat16}"
export ML_BATCH_SIZE="${ML_BATCH_SIZE:-32}"
export ML_OFFLINE="${ML_OFFLINE:-true}"
export ML_PORT="${ML_PORT:-8080}"

exec ml/scripts/serve.sh
