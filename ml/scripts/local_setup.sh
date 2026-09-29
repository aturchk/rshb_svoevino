#!/usr/bin/env bash

# Idempotent first-run preparation for a host-local ML + Nuxt stack.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
cd "$root"

model_id="google/siglip2-base-patch16-384"
model_revision="f775b65a79762255128c981547af89addcfe0f88"
gallery="dataset/vino-svoe/gallery-reviewed-candidates.jsonl"
adapter="ml/models/siglip2-site-label-adapter.safetensors"
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

for artifact in "$gallery" "$adapter" "$adapter.json"; do
  [ -f "$artifact" ] || {
    printf 'Missing production artifact: %s\n' "$artifact" >&2
    exit 1
  }
done

.venv/bin/wine-cv build-index \
  --pipeline siglip2 --gallery "$gallery" --data-root . \
  --model-id "$model_id" --model-revision "$model_revision" \
  --adapter-path "$adapter" --device "$device" --precision "$precision" \
  --batch-size "$batch_size" --reference-view-mode full-label \
  --query-view-mode full --cache-policy auto

(cd frontend && npm run build:images && npm run build)
printf 'Local stack is prepared. Start it with: make local\n'
