#!/usr/bin/env bash

set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
port="${SMOKE_PORT:-4173}"
base_url="http://127.0.0.1:${port}"
log_file="$root/work/frontend-smoke.log"
response_file="$root/work/frontend-smoke-response.json"
image="$root/dataset/real_photo/1.73_06-09-2026_14-54-06.webp"

mkdir -p "$root/work"
[ -f "$root/frontend/.output/server/index.mjs" ] || {
  printf 'Build is missing; run npm run build in frontend first.\n' >&2
  exit 1
}
[ -f "$image" ] || { printf 'Smoke image is missing: %s\n' "$image" >&2; exit 1; }

(
  cd "$root/frontend"
  HOST=127.0.0.1 PORT="$port" NUXT_PUBLIC_DEMO_SCAN=true \
    node .output/server/index.mjs >"$log_file" 2>&1
) &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

ready=false
for _ in $(seq 1 60); do
  if curl --fail --silent "$base_url/api/health" >/dev/null; then
    ready=true
    break
  fi
  sleep 0.25
done
[ "$ready" = true ] || { printf 'Frontend did not become ready; see %s\n' "$log_file" >&2; exit 1; }

for route in /scan /catalog /history; do
  curl --fail --silent --output /dev/null "$base_url$route"
done

curl --fail --silent --show-error \
  --form "image=@${image}" \
  --form "scenario=matched" \
  "$base_url/api/v1/recognize" > "$response_file"

node - "$response_file" <<'NODE'
const fs = require('node:fs')
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (body.status !== 'matched' || body.demo !== true || !body.top1?.slug || !body.card?.slug) {
  throw new Error(`Unexpected demo response: ${JSON.stringify(body)}`)
}
console.log(`demo smoke ok: ${body.top1.slug}, ${body.latencyMs} ms`)
NODE
