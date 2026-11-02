#!/usr/bin/env bash
# Upload NOTAZOD period grades to the Unimayor Campus. See README.md.
# Usage: run.sh <path-to-notazod.db> [--save]
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${1:-}"
MODE="${2:-}"
if [[ -z "$DB" || ( -n "$MODE" && "$MODE" != "--save" ) ]]; then
  echo "Usage: run.sh <path-to-notazod.db> [--save]" >&2
  exit 2
fi
if [[ ! -f "$DB" ]]; then
  echo "Database not found: $DB" >&2
  exit 2
fi

DB_ABS="$(cd "$(dirname "$DB")" && pwd)/$(basename "$DB")"
REPORT="${TMPDIR:-/tmp}/notazod-campus-upload-$(date +%Y%m%d-%H%M%S).json"
SAVE=false
[[ "$MODE" == "--save" ]] && SAVE=true

CONFIG="$(node -e 'console.log(JSON.stringify({ dbPath: process.argv[1], libUrl: "file://" + process.argv[2] + "/grades.mjs", save: process.argv[3] === "true", reportPath: process.argv[4] }))' "$DB_ABS" "$DIR" "$SAVE" "$REPORT")"

{ printf 'const CONFIG = %s;\n' "$CONFIG"; cat "$DIR/campus-upload.mjs"; } | ego-browser nodejs
