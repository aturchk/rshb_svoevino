#!/usr/bin/env bash

# One-command local acceptance run for the organizer package.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
cd "$root"

images_dir="${TEST_IMAGES_DIR:-eval/test/images}"
manifest="${TEST_MANIFEST:-eval/test/queries.tsv}"
[ -d "$images_dir" ] || { printf 'Missing test images: %s\n' "$images_dir" >&2; exit 2; }
[ -f "$manifest" ] || { printf 'Missing test manifest: %s\n' "$manifest" >&2; exit 2; }

mkdir -p work/local/logs
stack_log="work/local/logs/acceptance-stack.log"
"$script_dir/local_stack.sh" >"$stack_log" 2>&1 &
stack_pid=$!
cleanup() {
  status=$?
  trap - EXIT INT TERM
  kill "$stack_pid" 2>/dev/null || true
  wait "$stack_pid" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT INT TERM

printf 'Starting the full local stack'
for _ in $(seq 1 240); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3000/api/v1/metadata >/dev/null; then
    break
  fi
  if ! kill -0 "$stack_pid" 2>/dev/null; then
    printf '\nLocal stack failed. See %s\n' "$stack_log" >&2
    exit 1
  fi
  printf '.'
  sleep 1
done
curl --fail --silent --max-time 2 http://127.0.0.1:3000/api/v1/metadata >/dev/null || {
  printf '\nLocal stack readiness timeout. See %s\n' "$stack_log" >&2
  exit 1
}
printf ' ready\n'

output_dir="${TEST_OUTPUT_DIR:-work/acceptance-$(date +%Y%m%d-%H%M%S)}"
TEST_IMAGES_DIR="$images_dir" TEST_MANIFEST="$manifest" \
  TEST_ENDPOINT="http://127.0.0.1:3000/api/v1/eval/predict" \
  TEST_METADATA_URL="http://127.0.0.1:3000/api/v1/metadata" \
  TEST_OUTPUT_DIR="$output_dir" eval/run_acceptance.sh

printf 'Local acceptance completed: %s\n' "$output_dir"
