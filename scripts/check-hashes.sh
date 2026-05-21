#!/usr/bin/env bash
#
# scripts/check-hashes.sh
#
# Gate script: verify that the SHA-256 hashes published in README.md
# match the current files on disk. Use this BEFORE deploy and as a CI
# step on the GitHub repo — if README drifts from served bytes, the
# vlastník's B-2 transparency mechanism (README hash ↔ live page) is
# silently broken.
#
# Mitigates pentest finding F-02 (REP-PT-001): "Vlastníkem publikovaný
# SHA-256 hash index.html v README NESOUHLASÍ s živým index.html."
# Root cause is decoupled commit cadence — README is updated AFTER
# firebase deploy but pushed to GitHub asynchronously. This script
# detects the drift; deploy.sh calls it before every deploy.
#
# Exit codes:
#   0  all hashes match
#   1  one or more files mismatch (drift detected)
#   2  hash block not parseable or scripts/update-hashes.sh hasn't run
#
# Cross-platform (BSD/GNU). No deps beyond shasum/sha256sum.

set -euo pipefail
cd "$(dirname "$0")/.."

if command -v sha256sum >/dev/null 2>&1; then
    HASH_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
    HASH_CMD="shasum -a 256"
else
    echo "ERROR: no sha256sum or shasum available" >&2
    exit 2
fi

START_MARKER='<!-- HASH-BLOCK-START -->'
END_MARKER='<!-- HASH-BLOCK-END -->'

if ! grep -q "$START_MARKER" README.md; then
    echo "ERROR: HASH-BLOCK markers missing in README.md" >&2
    exit 2
fi

# Extract the table between markers and parse "<filename> sha256: <hash>"
DRIFT=0
TOTAL=0
MATCH=0
MISSING=0

while IFS= read -r line; do
    # Match "<path>   sha256:  <hex>" with arbitrary whitespace
    if [[ "$line" =~ ^[[:space:]]*([^[:space:]]+)[[:space:]]+sha256:[[:space:]]+([a-f0-9]{64})[[:space:]]*$ ]]; then
        file="${BASH_REMATCH[1]}"
        expected="${BASH_REMATCH[2]}"
        TOTAL=$((TOTAL+1))
        if [[ ! -f "$file" ]]; then
            echo "[MISSING] $file (in README but not on disk)"
            MISSING=$((MISSING+1))
            DRIFT=1
            continue
        fi
        actual=$($HASH_CMD "$file" | awk '{print $1}')
        if [[ "$actual" == "$expected" ]]; then
            MATCH=$((MATCH+1))
        else
            echo "[DRIFT]   $file"
            echo "          README:   $expected"
            echo "          ondisk:   $actual"
            DRIFT=1
        fi
    fi
done < <(awk -v s="$START_MARKER" -v e="$END_MARKER" '
    $0 ~ s {flag=1; next}
    $0 ~ e {flag=0}
    flag
' README.md)

if [[ $TOTAL -eq 0 ]]; then
    echo "ERROR: no hash entries parsed from README.md hash block" >&2
    exit 2
fi

echo ""
echo "[check-hashes] $MATCH/$TOTAL files match"
if [[ $DRIFT -eq 0 ]]; then
    echo "[check-hashes] OK — README hash block matches working tree"
    exit 0
else
    echo "[check-hashes] DRIFT detected — run scripts/update-hashes.sh and commit before deploy" >&2
    exit 1
fi
