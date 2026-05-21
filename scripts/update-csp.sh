#!/usr/bin/env bash
#
# scripts/update-csp.sh
#
# Recompute SHA-256 hashes of inline <script> and <style> bodies in
# index.html and rewrite the Content-Security-Policy header in
# firebase.json. Run before each deploy so CSP doesn't go stale.
#
# Mitigates pentest finding F-03 (REP-PT-001) — adds defense-in-depth
# layer if Firebase Hosting build or Cloudflare zone is ever compromised
# and HTML payload is altered: injected scripts without a hash in the
# allowlist refuse to execute.
#
# Idempotent. Cross-platform (BSD/GNU). No external deps beyond python3.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 required" >&2
    exit 1
fi

# Extract script + style hashes from index.html. HTML comments are stripped
# first so <script> mentioned inside <!-- ... --> doesn't false-match.
read -r -d '' PY_EXTRACT <<'PY' || true
import re, hashlib, base64, sys, json

with open('index.html','r',encoding='utf-8') as f:
    raw = f.read()

def strip_comments(s):
    out = []
    i = 0
    while i < len(s):
        if s.startswith('<!--', i):
            end = s.find('-->', i+4)
            if end == -1:
                break
            i = end + 3
        else:
            out.append(s[i]); i += 1
    return ''.join(out)

html = strip_comments(raw)

def hash_all(tag):
    p = re.compile(r'<' + tag + r'[^>]*>(.*?)</' + tag + r'>', re.DOTALL)
    return [base64.b64encode(hashlib.sha256(m.group(1).encode('utf-8')).digest()).decode('ascii')
            for m in p.finditer(html)]

scripts = hash_all('script')
styles  = hash_all('style')

# Hashes for inline style="..." attribute values — only when 'unsafe-hashes'
# is in style-src. Each unique style attr value needs its own hash.
attr_p = re.compile(r'\sstyle="([^"]*)"')
style_attrs = sorted({m.group(1) for m in attr_p.finditer(html)})
style_attr_hashes = [base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode('ascii')
                     for s in style_attrs]

print(json.dumps({
    'scripts': scripts,
    'styles': styles,
    'style_attrs': style_attr_hashes,
    'style_attr_count': len(style_attrs),
}))
PY

EXTRACT=$(python3 -c "$PY_EXTRACT")
SCRIPTS=$(echo "$EXTRACT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(f\"'sha256-{h}'\" for h in d['scripts']))")
STYLES=$(echo "$EXTRACT"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(f\"'sha256-{h}'\" for h in d['styles']))")
STYLE_ATTRS=$(echo "$EXTRACT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(f\"'sha256-{h}'\" for h in d['style_attrs']))")
STYLE_ATTR_COUNT=$(echo "$EXTRACT" | python3 -c "import sys,json; print(json.load(sys.stdin)['style_attr_count'])")

# Build CSP. style-src includes 'unsafe-hashes' only if there are inline
# style attributes to authorize (otherwise it's needless attack surface).
STYLE_SRC="'self' $STYLES"
if [[ "$STYLE_ATTR_COUNT" -gt 0 ]]; then
    STYLE_SRC="$STYLE_SRC 'unsafe-hashes' $STYLE_ATTRS"
fi

CSP="default-src 'none'; script-src 'self' $SCRIPTS; style-src $STYLE_SRC; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self' https://ipapi.co; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; manifest-src 'self'"

# Rewrite the Content-Security-Policy value in firebase.json. Uses python
# for JSON-safe in-place edit (preserves field order; jq isn't guaranteed
# available on macOS without brew).
python3 - "$CSP" <<'PY'
import json, sys, pathlib
csp = sys.argv[1]
p = pathlib.Path('firebase.json')
data = json.loads(p.read_text())
found = False
for hs in data.get('hosting', {}).get('headers', []):
    for h in hs.get('headers', []):
        if h.get('key') == 'Content-Security-Policy':
            h['value'] = csp
            found = True
if not found:
    sys.exit("ERROR: Content-Security-Policy header not found in firebase.json — add a placeholder first.")
p.write_text(json.dumps(data, indent=2) + '\n')
PY

echo "[update-csp] CSP refreshed in firebase.json"
echo "[update-csp]   scripts: $(echo "$EXTRACT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['scripts']))")"
echo "[update-csp]   styles:  $(echo "$EXTRACT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['styles']))")"
echo "[update-csp]   style-attrs: $STYLE_ATTR_COUNT"
