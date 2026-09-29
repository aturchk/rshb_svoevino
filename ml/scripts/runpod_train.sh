#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/workspace/rshb_svoevino}"
cd "$ROOT"

mkdir -p work/logs work/models work/proxy-eval
exec > >(tee -a work/logs/runpod-train.log) 2>&1

VENV_DIR="${RSHB_VENV_DIR:-/tmp/rshb-venv}"
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  python -m venv --system-site-packages "$VENV_DIR"
fi
PYTHON="$VENV_DIR/bin/python"
WINE_CV="$VENV_DIR/bin/wine-cv"
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -e './ml[siglip,orb,api]'
"$PYTHON" -m unittest discover -s ml/tests -v

MODEL_ID="google/siglip2-base-patch16-384"
MODEL_REVISION="f775b65a79762255128c981547af89addcfe0f88"
ADAPTER="work/models/siglip2-field-adapter.safetensors"

"$WINE_CV" train-adapter \
  --gallery work/gallery-strict.jsonl --data-root . \
  --output "$ADAPTER" \
  --model-id "$MODEL_ID" --model-revision "$MODEL_REVISION" \
  --device cuda --precision bfloat16 --batch-size 32 \
  --train-views 4 --val-views 1 --rank 64 --epochs 15 \
  --learning-rate 3e-4 --weight-decay 1e-4 --temperature 0.05 \
  --seed 20260928

"$WINE_CV" make-proxy-eval \
  --gallery work/gallery-strict.jsonl --data-root . \
  --output-dir work/proxy-eval --seed 20260929

"$WINE_CV" build-index \
  --pipeline siglip2 --gallery work/gallery-strict.jsonl --data-root . \
  --model-id "$MODEL_ID" --model-revision "$MODEL_REVISION" \
  --adapter-path "$ADAPTER" --device cuda --precision bfloat16 --batch-size 32 \
  --cache-policy refresh --offline

"$WINE_CV" benchmark \
  --pipeline siglip2 --gallery work/gallery-strict.jsonl --data-root . \
  --manifest work/proxy-eval/queries.tsv --images-dir work/proxy-eval/images \
  --labels work/proxy-eval/labels.tsv --output work/proxy-siglip-predictions.jsonl \
  --summary work/proxy-siglip-summary.json --top-k 20 --warmup 3 \
  --model-id "$MODEL_ID" --model-revision "$MODEL_REVISION" \
  --adapter-path "$ADAPTER" --device cuda --precision bfloat16 --batch-size 32 \
  --cache-policy require --offline

"$WINE_CV" benchmark \
  --pipeline siglip2-orb --gallery work/gallery-strict.jsonl --data-root . \
  --manifest work/proxy-eval/queries.tsv --images-dir work/proxy-eval/images \
  --labels work/proxy-eval/labels.tsv --output work/proxy-siglip-orb-predictions.jsonl \
  --summary work/proxy-siglip-orb-summary.json --top-k 20 --warmup 3 \
  --model-id "$MODEL_ID" --model-revision "$MODEL_REVISION" \
  --adapter-path "$ADAPTER" --candidate-k 50 --orb-weight 0.35 --rrf-k 20 \
  --device cuda --precision bfloat16 --batch-size 32 \
  --cache-policy require --offline

"$PYTHON" - <<'PY'
import hashlib
import json
import platform
from pathlib import Path

import torch
import transformers

artifacts = {}
for path in sorted(Path("work").rglob("*")):
    if path.is_file() and (path.suffix in {".json", ".jsonl", ".safetensors"} or
                           path.name.endswith(".safetensors.json")):
        artifacts[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
receipt = {
    "status": "complete",
    "python": platform.python_version(),
    "torch": torch.__version__,
    "cuda_runtime": torch.version.cuda,
    "gpu": torch.cuda.get_device_name(0),
    "transformers": transformers.__version__,
    "artifacts_sha256": artifacts,
    "warning": "Proxy metrics are synthetic regression signals, not real-photo accuracy.",
}
Path("work/runpod-receipt.json").write_text(
    json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt, ensure_ascii=False, indent=2))
PY
