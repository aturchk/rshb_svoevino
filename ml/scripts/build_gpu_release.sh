#!/usr/bin/env bash
# Build a portable offline release on the target NVIDIA host. The index is
# generated with the exact image later used by the production ML service.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
cd "$root"

release_id="${1:-siglip2-site-20260929}"
release_output="${2:-work/release}"
build_dir="$root/work/production"
model_id="google/siglip2-base-patch16-384"
model_revision="f775b65a79762255128c981547af89addcfe0f88"
precision="${ML_PRECISION:-float16}"
batch_size="${ML_BATCH_SIZE:-32}"
reference_view_mode="${ML_REFERENCE_VIEW_MODE:-full-label}"

command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 is required" >&2; exit 1; }
docker compose config --format json | \
  ML_BUILD_PRECISION="$precision" \
  ML_BUILD_BATCH_SIZE="$batch_size" \
  ML_BUILD_REFERENCE_VIEW_MODE="$reference_view_mode" \
  ML_BUILD_RELEASE_OUTPUT="$release_output" \
  python3 -c '
import json
import os
import sys
from pathlib import Path

service = json.load(sys.stdin)["services"]["ml"]
environment = service["environment"]
expected = {
    "ML_MODEL_ID": "google/siglip2-base-patch16-384",
    "ML_MODEL_REVISION": "f775b65a79762255128c981547af89addcfe0f88",
    "ML_PRECISION": os.environ["ML_BUILD_PRECISION"],
    "ML_BATCH_SIZE": os.environ["ML_BUILD_BATCH_SIZE"],
    "ML_REFERENCE_VIEW_MODE": os.environ["ML_BUILD_REFERENCE_VIEW_MODE"],
    "ML_QUERY_VIEW_MODE": "full",
    "ML_GALLERY_PATH": "/opt/svoe/release/gallery-reviewed.jsonl",
    "ML_DATA_ROOT": "/opt/svoe/release",
    "ML_ADAPTER_PATH": "/opt/svoe/release/siglip2-site-label-adapter.safetensors",
    "ML_CACHE_DIR": "/opt/svoe/release/siglip-cache",
    "ML_PIPELINE": "siglip2",
    "ML_DEVICE": "cuda",
    "ML_OFFLINE": "true",
}
for key, value in expected.items():
    if environment.get(key) != value:
        raise SystemExit(f"Compose {key}={environment.get(key)!r} differs from release build {value!r}")
volume = next(item for item in service["volumes"] if item["target"] == "/opt/svoe/release")
if Path(volume["source"]).resolve() != Path(os.environ["ML_BUILD_RELEASE_OUTPUT"]).resolve():
    raise SystemExit("Compose ML_RELEASE_DIR differs from release output")
'
mkdir -p "$build_dir/siglip-cache" "$build_dir/huggingface"

docker build -t svoe-vino-ml:release -f ml/docker/Dockerfile.api .

docker run --rm --gpus all --user "$(id -u):$(id -g)" \
  -e HF_HOME=/opt/svoe/work/huggingface \
  -e XDG_CACHE_HOME=/opt/svoe/work/.cache \
  -e TRANSFORMERS_OFFLINE=0 \
  -v "$root/dataset:/opt/svoe/source/dataset:ro" \
  -v "$root/ml/models:/opt/svoe/source/ml/models:ro" \
  -v "$build_dir:/opt/svoe/work" \
  --entrypoint wine-cv svoe-vino-ml:release build-index \
  --pipeline siglip2 \
  --gallery /opt/svoe/source/dataset/vino-svoe/gallery-reviewed-candidates.jsonl \
  --data-root /opt/svoe/source \
  --model-id "$model_id" --model-revision "$model_revision" \
  --adapter-path /opt/svoe/source/ml/models/siglip2-site-label-adapter.safetensors \
  --device cuda --precision "$precision" --batch-size "$batch_size" \
  --reference-view-mode "$reference_view_mode" --query-view-mode full \
  --cache-dir /opt/svoe/work/siglip-cache --cache-policy auto

# Check the *offline* runtime and the index once more before packaging.
docker run --rm --gpus all --user "$(id -u):$(id -g)" \
  -e HF_HOME=/opt/svoe/work/huggingface \
  -e XDG_CACHE_HOME=/opt/svoe/work/.cache \
  -e TRANSFORMERS_OFFLINE=1 \
  -v "$root/dataset:/opt/svoe/source/dataset:ro" \
  -v "$root/ml/models:/opt/svoe/source/ml/models:ro" \
  -v "$build_dir:/opt/svoe/work" \
  --entrypoint wine-cv svoe-vino-ml:release build-index \
  --pipeline siglip2 \
  --gallery /opt/svoe/source/dataset/vino-svoe/gallery-reviewed-candidates.jsonl \
  --data-root /opt/svoe/source \
  --model-id "$model_id" --model-revision "$model_revision" \
  --adapter-path /opt/svoe/source/ml/models/siglip2-site-label-adapter.safetensors \
  --device cuda --precision "$precision" --batch-size "$batch_size" \
  --reference-view-mode "$reference_view_mode" --query-view-mode full \
  --cache-dir /opt/svoe/work/siglip-cache --cache-policy require --offline

python3 ml/scripts/build_release.py \
  --cache-dir work/production/siglip-cache \
  --model-dir work/production/huggingface \
  --precision "$precision" --batch-size "$batch_size" \
  --reference-view-mode "$reference_view_mode" \
  --release-id "$release_id" --output "$release_output"

printf 'Release ready at %s. Start it with: docker compose up --build\n' "$release_output"
