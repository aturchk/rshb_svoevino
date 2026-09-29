#!/usr/bin/env bash

# Seals the input package, records model metadata, runs the organizer transport
# contract sequentially, and validates predictions without needing answer labels.

set -euo pipefail

images_dir="${TEST_IMAGES_DIR:-eval/test/images}"
manifest="${TEST_MANIFEST:-eval/test/queries.tsv}"
endpoint="${TEST_ENDPOINT:-http://127.0.0.1:3000/api/v1/eval/predict}"
metadata_url="${TEST_METADATA_URL:-http://127.0.0.1:3000/api/v1/metadata}"
output_dir="${TEST_OUTPUT_DIR:-work/acceptance}"
wine_cv="${WINE_CV:-.venv/bin/wine-cv}"

usage() {
  printf '%s\n' \
    "Usage: $0 [--images-dir DIR] [--manifest FILE] [--endpoint URL]" \
    "          [--metadata-url URL] [--output-dir DIR]" \
    "" \
    "Defaults target eval/test/. The output directory must not already exist."
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --images-dir) images_dir="${2:?}"; shift 2 ;;
    --manifest) manifest="${2:?}"; shift 2 ;;
    --endpoint) endpoint="${2:?}"; shift 2 ;;
    --metadata-url) metadata_url="${2:?}"; shift 2 ;;
    --output-dir) output_dir="${2:?}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

for command_name in curl jq; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command not found: $command_name"
done
[ -x "$wine_cv" ] || die "wine-cv not found: $wine_cv; run make install"
[ -x eval/participant_test.sh ] || die "eval/participant_test.sh is not executable"
[ ! -e "$output_dir" ] || die "output directory already exists: $output_dir"

mkdir -p "$output_dir"
cleanup_on_error() {
  status=$?
  if [ "$status" -ne 0 ]; then
    printf 'Acceptance run failed; partial evidence preserved in %s\n' "$output_dir" >&2
  fi
  exit "$status"
}
trap cleanup_on_error EXIT

"$wine_cv" validate-eval-package \
  --images-dir "$images_dir" \
  --manifest "$manifest" \
  --report "$output_dir/input-receipt.json" >/dev/null

curl --fail --silent --show-error --max-time 10 "$metadata_url" \
  | jq --sort-keys . > "$output_dir/model-metadata.json"

eval/participant_test.sh \
  --images-dir "$images_dir" \
  --manifest "$manifest" \
  --endpoint "$endpoint" \
  --output "$output_dir/predictions.jsonl"

"$wine_cv" validate-eval-predictions \
  --images-dir "$images_dir" \
  --manifest "$manifest" \
  --predictions "$output_dir/predictions.jsonl" \
  --report "$output_dir/run-receipt.json"

trap - EXIT
printf 'Acceptance evidence: %s\n' "$output_dir"
