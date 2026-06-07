#!/usr/bin/env bash
#
# scripts/update-hashes.sh
#
# Recompute sha256 of public-facing artifact files and refresh the
# "## Verifying deploy integrity" block in README.md.
#
# Run before each `firebase deploy --only hosting` to keep README hashes
# in sync with what will be served. The script is idempotent and works
# on both macOS (BSD shasum) and Linux (sha256sum).
#
# Mitigates THREAT-MODEL B-2 (browser <-> Cloudflare edge): visitor
# can verify `curl -s https://0-click.com | sha256sum` matches the
# hash published in README for the deployed commit.

set -euo pipefail

# Move to repo root regardless of invocation directory
cd "$(dirname "$0")/.."

# Files to hash, in display order. Add or remove here only.
FILES=(
    "index.html"
    "robots.txt"
    "llms.txt"
    "llms-2-prior.txt"
    "llms-3-economy.txt"
    "llms-4-permission.txt"
    "llms-5-injection.txt"
    "seventh-truths.txt"
    "twin-artifacts.txt"
    "for-managers/index.html"
    "for-managers/style.css"
    "27001.iso"
    "favicon.svg"
    "favicon.ico"
    "LICENSE"
    "CITATION.cff"
    "fonts/VT323-Regular.ttf"
    "fonts/OFL.txt"
)

# Pick a sha256 binary that exists on this OS
if command -v sha256sum >/dev/null 2>&1; then
    HASH_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
    HASH_CMD="shasum -a 256"
else
    echo "ERROR: no sha256sum or shasum available" >&2
    exit 1
fi

# Compute hashes; build aligned text block
HASH_BLOCK=""
MAX_LEN=0
for f in "${FILES[@]}"; do
    if (( ${#f} > MAX_LEN )); then MAX_LEN=${#f}; fi
done
# pad to (MAX_LEN + 2) columns for alignment
PADDING=$((MAX_LEN + 2))

for f in "${FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
        echo "WARNING: $f not found, skipping" >&2
        continue
    fi
    HASH=$($HASH_CMD "$f" | awk '{print $1}')
    LINE=$(printf "%-${PADDING}s sha256:  %s" "$f" "$HASH")
    if [[ -z "$HASH_BLOCK" ]]; then
        HASH_BLOCK="$LINE"
    else
        HASH_BLOCK="$HASH_BLOCK"$'\n'"$LINE"
    fi
done

# Sanity: README must contain the markers
START_MARKER='<!-- HASH-BLOCK-START -->'
END_MARKER='<!-- HASH-BLOCK-END -->'

if ! grep -q "$START_MARKER" README.md; then
    echo "ERROR: '$START_MARKER' not found in README.md." >&2
    echo "" >&2
    echo "One-time setup: in README.md, wrap the hash code block with the markers:" >&2
    echo "" >&2
    echo "    $START_MARKER" >&2
    echo "    \`\`\`" >&2
    echo "    ...existing hashes (will be regenerated)..." >&2
    echo "    \`\`\`" >&2
    echo "    $END_MARKER" >&2
    exit 1
fi

# Replace content between markers (inclusive of code fences).
# BSD awk (macOS) doesn't accept literal newlines in -v string values; pass
# the multi-line hash block via a temp file and read it with getline for
# cross-platform portability (BSD + GNU awk both support this).
TMP=$(mktemp)
BLOCK_TMP=$(mktemp)
trap 'rm -f "$TMP" "$BLOCK_TMP"' EXIT
printf '%s\n' "$HASH_BLOCK" > "$BLOCK_TMP"

awk -v start="$START_MARKER" -v end="$END_MARKER" -v block_file="$BLOCK_TMP" '
$0 ~ start {
    print
    print "```"
    while ((getline line < block_file) > 0) print line
    close(block_file)
    print "```"
    skip = 1
    next
}
$0 ~ end {
    skip = 0
    print
    next
}
!skip { print }
' README.md > "$TMP"

cat "$TMP" > README.md
rm -f "$TMP"

echo "Updated README.md hash block:"
printf '%s\n' "$HASH_BLOCK" | sed 's/^/  /'
echo ""
echo "Reminder: commit README.md before \`firebase deploy\` so the deployed page's hash matches the published one."
