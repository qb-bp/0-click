#!/usr/bin/env bash
#
# scripts/deploy.sh
#
# Deploy wrapper for 0-click.com. Performs THREAT-MODEL mitigations
# automatically before each push to Firebase Hosting:
#
#   1. Updates <meta name="deploy-commit"> in index.html with current
#      git HEAD hash (B-4 mitigation — visitor can compare against
#      https://github.com/qb-bp/0-click commit history).
#   2. Runs scripts/update-hashes.sh to refresh the README hash block
#      (B-2 mitigation — visitor can verify deployed bytes match the
#      published sha256).
#   3. `firebase deploy --only hosting`.
#
# Usage:
#   cd ~/Documents/0-click.com
#   ./scripts/deploy.sh
#
# After the script finishes, the working tree has the meta + hash
# changes uncommitted. Commit them as a deploy artifact so the next
# deploy can advance the commit hash.

set -euo pipefail
cd "$(dirname "$0")/.."

COMMIT=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)

echo "============================================================"
echo "0-click.com deploy"
echo "  HEAD:        $SHORT  ($COMMIT)"
echo "  Target:      Firebase Hosting"
echo "============================================================"
echo ""

# 1. Update <meta name="deploy-commit"> to current HEAD
if ! grep -q '<meta name="deploy-commit"' index.html; then
    echo "ERROR: <meta name=\"deploy-commit\"> not found in index.html" >&2
    echo "       Add the meta tag in <head> before running this script." >&2
    exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

awk -v commit="$COMMIT" '
    /<meta name="deploy-commit"/ {
        sub(/content="[^"]*"/, "content=\"" commit "\"")
    }
    { print }
' index.html > "$TMP"
cat "$TMP" > index.html
rm -f "$TMP"

echo "[1/3] deploy-commit meta updated to $SHORT"

# 2. Refresh README hash block (must run AFTER meta update to cover it)
echo ""
echo "[2/3] Refreshing README hash block..."
scripts/update-hashes.sh

# 3. Deploy
echo ""
echo "[3/3] firebase deploy --only hosting"
echo ""
firebase deploy --only hosting

# Post-deploy reminders
echo ""
echo "============================================================"
echo "Deploy complete."
echo ""
echo "Post-deploy verification (B-2, B-4):"
echo "  curl -sI https://0-click.com | grep -i strict-transport-security"
echo "  curl -s https://0-click.com | sha256sum"
echo "    expected: $(sha256sum index.html 2>/dev/null | awk '{print $1}' || shasum -a 256 index.html | awk '{print $1}')"
echo ""
echo "  curl -s https://0-click.com | grep -o 'deploy-commit[^>]*'"
echo "    expected: deploy-commit\" content=\"$COMMIT\""
echo ""
echo "Commit the deploy artifact when ready:"
echo "  git add index.html README.md"
echo "  git commit -m 'deploy: $SHORT'"
echo "  git push"
echo "============================================================"
