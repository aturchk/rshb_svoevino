#!/usr/bin/env bash

# Idempotent first-run preparation for a host-local ML + Nuxt stack.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
cd "$root"

model_id="google/siglip2-base-patch16-384"
model_revision="f775b65a79762255128c981547af89addcfe0f88"
adapter="work/models/siglip2-field-adapter.safetensors"
device="${ML_DEVICE:-auto}"
precision="${ML_PRECISION:-auto}"
batch_size="${ML_BATCH_SIZE:-8}"

if ! command -v node >/dev/null 2>&1 || ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number)
  process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)
'; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use "$(cat frontend/.nvmrc)"
  fi
fi
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number)
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error(`Node >=22.12 required; found ${process.versions.node}`)
  }
'

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -e './ml[siglip,orb,api,test]'

if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm ci)
fi

.venv/bin/wine-cv prepare-strict --data-root .

if [ ! -f "$adapter" ] || [ ! -f "$adapter.json" ]; then
  printf 'No frozen adapter found; training it locally. This is a one-time operation.\n'
  .venv/bin/wine-cv train-adapter \
    --gallery work/gallery-strict.jsonl --data-root . --output "$adapter" \
    --model-id "$model_id" --model-revision "$model_revision" \
    --device "$device" --precision "$precision" --batch-size "$batch_size" \
    --train-views 4 --val-views 1 --rank 64 --epochs 15 --seed 20260928
fi

.venv/bin/wine-cv build-index \
  --pipeline siglip2 --gallery work/gallery-strict.jsonl --data-root . \
  --model-id "$model_id" --model-revision "$model_revision" \
  --adapter-path "$adapter" --device "$device" --precision "$precision" \
  --batch-size "$batch_size" --cache-policy auto

(cd frontend && npm run build:images && npm run build)
printf 'Local stack is prepared. Start it with: make local\n'
