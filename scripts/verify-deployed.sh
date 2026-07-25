#!/usr/bin/env bash
#
# scripts/verify-deployed.sh
#
# POST-DEPLOY gate: verify that the bytes Cloudflare actually serves match
# the SHA-256 hashes published in README.md.
#
# Why this exists (AUDIT-OSA-008):
#   scripts/check-hashes.sh compares README <-> WORKING TREE. deploy.sh
#   regenerates the README block from the working tree (step 3) and then
#   verifies the block against that same working tree (step 4), so the gate
#   is a tautology — it cannot fail, and it has never once inspected the
#   boundary it was written to protect.
#
#   B-2 is the edge: "what I built" vs "what visitors receive". Only a
#   live fetch observes it. This script closes that gap and, as a side
#   effect, is the standing detector for CF HTML rewriting (Rocket Loader,
#   Email Obfuscation, Zaraz) — any injection changes the served bytes and
#   shows up here as a mismatch on the next deploy.
#
# Also detects the OSA-004/005 class: a file that 404s but is served as
# 200 + index.html by a catch-all rewrite. Those surface as a hash
# mismatch plus a text/html content-type on a non-HTML path.
#
# Usage:
#   scripts/verify-deployed.sh                 # verify against https://0-click.com
#   scripts/verify-deployed.sh https://host    # verify another origin
#   SKIP_VERIFY=1 scripts/deploy.sh            # bypass (records the bypass loudly)
#
# Exit codes:
#   0  every published hash matches the served bytes
#   1  one or more mismatches (drift, injection, or missing file)
#   2  hash block not parseable, or curl unavailable

set -euo pipefail
cd "$(dirname "$0")/.."

ORIGIN="${1:-https://0-click.com}"
ORIGIN="${ORIGIN%/}"

if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR: curl not available" >&2
    exit 2
fi

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

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

DRIFT=0
TOTAL=0
MATCH=0

echo "[verify-deployed] origin: $ORIGIN"
echo ""

while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*([^[:space:]]+)[[:space:]]+sha256:[[:space:]]+([a-f0-9]{64})[[:space:]]*$ ]]; then
        file="${BASH_REMATCH[1]}"
        expected="${BASH_REMATCH[2]}"
        TOTAL=$((TOTAL+1))

        # README lists repo-relative paths; index.html is served at /
        url_path="/$file"
        [[ "$file" == "index.html" ]] && url_path="/"

        body="$TMP/body.bin"
        code=$(curl -sS -o "$body" -w '%{http_code}' \
                    -H 'Accept-Encoding: identity' \
                    --max-time 30 "$ORIGIN$url_path" 2>/dev/null || echo "000")
        ctype=$(curl -sSI --max-time 15 "$ORIGIN$url_path" 2>/dev/null \
                | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | tail -1)

        if [[ "$code" != "200" ]]; then
            echo "[HTTP $code] $file"
            DRIFT=1
            continue
        fi

        actual=$($HASH_CMD "$body" | awk '{print $1}')

        if [[ "$actual" == "$expected" ]]; then
            MATCH=$((MATCH+1))
        else
            echo "[DRIFT]   $file"
            echo "          README: $expected"
            echo "          served: $actual"
            if [[ "$file" != *.html && "$ctype" == *"text/html"* ]]; then
                echo "          NOTE:   served as text/html on a non-HTML path —"
                echo "                  file is probably not deployed and a rewrite"
                echo "                  is answering with index.html (OSA-004/005)."
            fi
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
echo "[verify-deployed] $MATCH/$TOTAL served files match the published hashes"
if [[ $DRIFT -eq 0 ]]; then
    echo "[verify-deployed] OK — served bytes match README (B-2 intact)"
    exit 0
else
    echo "[verify-deployed] MISMATCH — served bytes differ from published hashes." >&2
    echo "                  Causes, in order of likelihood:" >&2
    echo "                    1. README block not regenerated/committed after the last edit" >&2
    echo "                    2. file not deployed (see NOTE lines above)" >&2
    echo "                    3. edge rewriting response bodies (CF Rocket Loader /" >&2
    echo "                       Email Obfuscation / Zaraz) — check the zone dashboard" >&2
    exit 1
fi
