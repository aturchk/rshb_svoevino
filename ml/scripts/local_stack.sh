#!/usr/bin/env bash

# Run the real ML service and the production Nuxt server on this machine.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
cd "$root"

if [ ! -x .venv/bin/wine-cv ] || [ ! -f ml/models/siglip2-site-label-adapter.safetensors ] || \
   [ ! -d work/siglip-cache ] || [ ! -f frontend/.output/server/index.mjs ]; then
  "$script_dir/local_setup.sh"
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm use "$(cat frontend/.nvmrc)" >/dev/null
fi

mkdir -p work/local/logs
ml_log="work/local/logs/ml.log"
frontend_log="work/local/logs/frontend.log"
ml_port="${ML_PORT:-8080}"
frontend_port="${NITRO_PORT:-3000}"

cleanup() {
  status=$?
  trap - EXIT INT TERM
  [ -z "${frontend_pid:-}" ] || kill "$frontend_pid" 2>/dev/null || true
  [ -z "${ml_pid:-}" ] || kill "$ml_pid" 2>/dev/null || true
  [ -z "${frontend_pid:-}" ] || wait "$frontend_pid" 2>/dev/null || true
  [ -z "${ml_pid:-}" ] || wait "$ml_pid" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT INT TERM

ML_PORT="$ml_port" "$script_dir/local_serve.sh" "$root" >"$ml_log" 2>&1 &
ml_pid=$!

printf 'Loading local SigLIP 2 model'
for _ in $(seq 1 180); do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$ml_port/health/ready" >/dev/null; then
    break
  fi
  if ! kill -0 "$ml_pid" 2>/dev/null; then
    printf '\nML service failed. See %s\n' "$ml_log" >&2
    exit 1
  fi
  printf '.'
  sleep 1
done
curl --fail --silent --max-time 2 "http://127.0.0.1:$ml_port/health/ready" >/dev/null || {
  printf '\nML readiness timeout. See %s\n' "$ml_log" >&2
  exit 1
}
printf ' ready\n'

NUXT_ML_BASE_URL="http://127.0.0.1:$ml_port" \
  HOST=127.0.0.1 NITRO_PORT="$frontend_port" \
  node frontend/.output/server/index.mjs >"$frontend_log" 2>&1 &
frontend_pid=$!

for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$frontend_port/api/v1/metadata" >/dev/null; then
    break
  fi
  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    printf 'Frontend failed. See %s\n' "$frontend_log" >&2
    exit 1
  fi
  sleep 1
done
curl --fail --silent --max-time 2 "http://127.0.0.1:$frontend_port/api/v1/metadata" >/dev/null || {
  printf 'Frontend readiness timeout. See %s\n' "$frontend_log" >&2
  exit 1
}

printf '\nFull local application is ready: http://127.0.0.1:%s\n' "$frontend_port"
printf 'ML API: http://127.0.0.1:%s  |  logs: work/local/logs/\n' "$ml_port"
printf 'Press Ctrl+C to stop both processes.\n'
while kill -0 "$ml_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
if ! kill -0 "$ml_pid" 2>/dev/null; then
  wait "$ml_pid"
else
  wait "$frontend_pid"
fi
