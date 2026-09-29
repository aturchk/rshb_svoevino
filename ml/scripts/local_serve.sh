#!/usr/bin/env bash

# Start the frozen candidate from host-local artifacts. Device selection is
# automatic: CUDA, Apple MPS, and CPU are supported by the same command.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${1:-$(cd "$script_dir/../.." && pwd)}"

cd "$root"
for artifact in \
  dataset/vino-svoe/gallery-reviewed-candidates.jsonl \
  ml/models/siglip2-site-label-adapter.safetensors \
  ml/models/siglip2-site-label-adapter.safetensors.json \
  work/siglip-cache; do
  [ -e "$artifact" ] || {
    printf 'Missing local artifact: %s. Run `make local-setup` first.\n' "$artifact" >&2
    exit 1
  }
done
[ -x .venv/bin/wine-cv ] || {
  printf 'Missing local Python environment. Run `make local-setup` first.\n' >&2
  exit 1
}

export WINE_CV_BIN="${WINE_CV_BIN:-.venv/bin/wine-cv}"
export ML_GALLERY_PATH="${ML_GALLERY_PATH:-dataset/vino-svoe/gallery-reviewed-candidates.jsonl}"
export ML_DATA_ROOT="${ML_DATA_ROOT:-.}"
export ML_ADAPTER_PATH="${ML_ADAPTER_PATH:-ml/models/siglip2-site-label-adapter.safetensors}"
export ML_CACHE_DIR="${ML_CACHE_DIR:-work/siglip-cache}"
export ML_REFERENCE_VIEW_MODE="${ML_REFERENCE_VIEW_MODE:-full-label}"
export ML_QUERY_VIEW_MODE="${ML_QUERY_VIEW_MODE:-full}"
export ML_DEVICE="${ML_DEVICE:-auto}"
export ML_PRECISION="${ML_PRECISION:-auto}"
export ML_BATCH_SIZE="${ML_BATCH_SIZE:-8}"
export ML_OFFLINE="${ML_OFFLINE:-true}"
export ML_PORT="${ML_PORT:-8080}"

exec ml/scripts/serve.sh
