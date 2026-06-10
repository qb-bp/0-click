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

# Extract script + style hashes from index.html.
#
# AUDIT-ZDR-001 A-01/A-02 fix (2026-06-10). The previous version stripped
# HTML comments from the WHOLE file before hashing, so the published hash
# covered comment-stripped bytes while the browser hashes the element's
# raw bytes — a latent silent total-breakage the day any '<!--' enters
# the executable script (the tool would exit 0 with a wrong hash and the
# browser would refuse the whole script). Now:
#   - element bodies are hashed as EXACT RAW BYTES (browser semantics);
#   - '<script>' inside <!-- ... --> is excluded by comment-SPAN check
#     (match position test), not by mutating content — preserves the
#     original false-match protection;
#   - non-executable script types (application/ld+json etc.) are skipped:
#     script-src never gates them, their hash is inert allowlist noise.
read -r -d '' PY_EXTRACT <<'PY' || true
import re, hashlib, base64, sys, json

with open('index.html','r',encoding='utf-8') as f:
    raw = f.read()

# Comment spans in the raw text — used to EXCLUDE matches that start
# inside <!-- ... -->, without ever mutating the bytes we hash.
comment_spans = []
i = 0
while True:
    s = raw.find('<!--', i)
    if s == -1:
        break
    e = raw.find('-->', s + 4)
    if e == -1:
        comment_spans.append((s, len(raw)))
        break
    comment_spans.append((s, e + 3))
    i = e + 3

def comment_end_for(pos):
    for s, e in comment_spans:
        if s <= pos < e:
            return e
    return None

def b64sha256(text):
    return base64.b64encode(hashlib.sha256(text.encode('utf-8')).digest()).decode('ascii')

def find_elements(pattern, text):
    # Like finditer, but a match that STARTS inside an HTML comment is
    # discarded and the search resumes after that COMMENT (not after the
    # match) — otherwise a '<script>' token inside a comment would
    # non-greedily swallow the next real element's opening tag.
    pos = 0
    while True:
        m = pattern.search(text, pos)
        if m is None:
            return
        ce = comment_end_for(m.start())
        if ce is not None:
            pos = ce
            continue
        yield m
        pos = m.end()

# Script types the browser will execute (and therefore gate via script-src).
# Empty/absent type and module are executable; data blocks are not.
EXEC_TYPES = {'', 'module', 'text/javascript', 'application/javascript'}

script_p = re.compile(r'<script\b([^>]*)>(.*?)</script\s*>', re.DOTALL | re.IGNORECASE)
type_p   = re.compile(r'''\btype\s*=\s*["']?([^"'\s>]+)''', re.IGNORECASE)
src_p    = re.compile(r'\bsrc\s*=', re.IGNORECASE)

scripts = []
skipped_nonexec = 0
for m in find_elements(script_p, raw):
    attrs = m.group(1)
    if src_p.search(attrs):
        continue  # external script — covered by 'self', not a hash
    tm = type_p.search(attrs)
    stype = (tm.group(1).strip().lower() if tm else '')
    if stype not in EXEC_TYPES:
        skipped_nonexec += 1
        continue
    scripts.append(b64sha256(m.group(2)))

style_p = re.compile(r'<style\b[^>]*>(.*?)</style\s*>', re.DOTALL | re.IGNORECASE)
styles = [b64sha256(m.group(1)) for m in find_elements(style_p, raw)]

# Hashes for inline style="..." attribute values — only when 'unsafe-hashes'
# is in style-src. Each unique style attr value needs its own hash.
attr_p = re.compile(r'\sstyle="([^"]*)"')
style_attrs = sorted({m.group(1) for m in attr_p.finditer(raw)
                      if comment_end_for(m.start()) is None})
style_attr_hashes = [b64sha256(s) for s in style_attrs]

if not scripts:
    sys.exit("ERROR: no executable inline <script> found — refusing to emit "
             "a script-src that would brick the page.")

print(json.dumps({
    'scripts': scripts,
    'styles': styles,
    'style_attrs': style_attr_hashes,
    'style_attr_count': len(style_attrs),
    'skipped_nonexec': skipped_nonexec,
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

# Verification gate (A-01 regression guard): recompute the raw-byte hash of
# every executable inline script independently and assert each one is present
# in the CSP just written to firebase.json. Fails loud instead of shipping a
# CSP that would brick the page.
python3 - <<'PY'
import re, hashlib, base64, json, sys

raw = open('index.html', encoding='utf-8').read()

comment_spans = []
i = 0
while True:
    s = raw.find('<!--', i)
    if s == -1: break
    e = raw.find('-->', s + 4)
    if e == -1:
        comment_spans.append((s, len(raw))); break
    comment_spans.append((s, e + 3)); i = e + 3

def comment_end_for(pos):
    for s, e in comment_spans:
        if s <= pos < e:
            return e
    return None

EXEC_TYPES = {'', 'module', 'text/javascript', 'application/javascript'}
script_p = re.compile(r'<script\b([^>]*)>(.*?)</script\s*>', re.DOTALL | re.IGNORECASE)
type_p   = re.compile(r'''\btype\s*=\s*["']?([^"'\s>]+)''', re.IGNORECASE)
src_p    = re.compile(r'\bsrc\s*=', re.IGNORECASE)

want = []
pos = 0
while True:
    m = script_p.search(raw, pos)
    if m is None:
        break
    ce = comment_end_for(m.start())
    if ce is not None:
        pos = ce
        continue
    pos = m.end()
    if src_p.search(m.group(1)):
        continue
    tm = type_p.search(m.group(1))
    if (tm.group(1).strip().lower() if tm else '') not in EXEC_TYPES:
        continue
    want.append(base64.b64encode(hashlib.sha256(m.group(2).encode('utf-8')).digest()).decode('ascii'))

fb = json.load(open('firebase.json'))
csp = next(h['value'] for hs in fb['hosting']['headers']
           for h in hs['headers'] if h['key'] == 'Content-Security-Policy')

missing = [h for h in want if f"'sha256-{h}'" not in csp]
if missing:
    for h in missing:
        print(f"[update-csp] VERIFY FAIL — executable script hash absent from CSP: sha256-{h}", file=sys.stderr)
    sys.exit(1)
print(f"[update-csp] verify OK — {len(want)}/{len(want)} executable script hash(es) present in CSP")
PY

echo "[update-csp] CSP refreshed in firebase.json"
echo "[update-csp]   scripts (executable): $(echo "$EXTRACT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['scripts']))")"
echo "[update-csp]   scripts skipped (non-executable, e.g. ld+json): $(echo "$EXTRACT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('skipped_nonexec',0))")"
echo "[update-csp]   styles:  $(echo "$EXTRACT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['styles']))")"
echo "[update-csp]   style-attrs: $STYLE_ATTR_COUNT"
