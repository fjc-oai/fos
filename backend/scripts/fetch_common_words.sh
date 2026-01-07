#!/usr/bin/env bash
set -euo pipefail

# Download a common English words list and save to backend/data/common_words.txt
# Accepts an optional URL; defaults to google-10000-english.txt

URL="${1:-https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/data/common_words.txt"

mkdir -p "$ROOT/data"
echo "Fetching: $URL"
curl -fsSL "$URL" -o "$OUT.tmp"

# Keep plain newline-delimited, strip empties, to lower
awk 'NF' "$OUT.tmp" | tr '[:upper:]' '[:lower:]' > "$OUT"
rm -f "$OUT.tmp"

echo "Saved to: $OUT"
wc -l "$OUT" || true


