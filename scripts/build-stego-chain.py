#!/usr/bin/env python3
"""
build-stego-chain.py — CTF #5 -> #6 carriers (spec: scratch/visitor-journey/stego-chain-56/spec.md)

  HOP 0  media/eye-b.mp4   ©cmt = FLAG #5, ©des = breadcrumb -> HOP 1   (ffprobe -show_format / exiftool)
  HOP 1  favicon.ico       bytes after the last ICO image = breadcrumb -> HOP 2   (xxd / tail -c)
  HOP 2  index.html        :root{ --last-node:"<base64>" } = FLAG #6 + pointer to seventh()   (view-source / base64 -d)

Deterministic + idempotent: re-running rewrites the same payloads, never stacks them.
Requires: python3 -m pip install --user mutagen
After running: ./scripts/deploy.sh refreshes CSP + README hashes (eye-b.mp4 and favicon.ico are already listed).

The breadcrumb TEXTS below carry the Mythos register; the info content (target ·
method · tool) stays fixed by the spec so a solver can still follow the chain.
Re-run this script after editing them.
"""
import base64, re, struct, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MP4  = ROOT / 'media' / 'eye-b.mp4'
ICO  = ROOT / 'favicon.ico'
HTML = ROOT / 'index.html'

PREFIX = '0C-NEXT:'   # per-hop canary: proves a clean extraction (spec invariant 4)

# Canonical tokens — MUST match build-blob / docs/CTF-FLAGS.md byte for byte (the KDF key depends on it).
FLAG5 = 'FLAG{EVEN_A_VIDEO_CAN_KEEP_A_SECRET}'
FLAG6 = 'FLAG{YOU_ARRIVED_AT_THE_LAST_REACHABLE_NODE}'

# Breadcrumb wording (Mythos register). Info content is fixed by the spec — a solver must still follow it.
CRUMB_0 = f'{PREFIX} the eye kept one secret; the icon holds the way on. /favicon.ico, past the last image — tail -c or xxd.'
CRUMB_1 = f'{PREFIX} the page wears its last node in the open. :root {{ --last-node }} in /index.html — base64 -d it.'
CRUMB_2 = f'{PREFIX} six in hand. give them to the door in order — window.synapse.seventh(f1, f2, f3, f4, f5, f6).'


def hop0():
    from mutagen.mp4 import MP4
    m = MP4(str(MP4_PATH))
    if m.tags is None:
        m.add_tags()
    m.tags['\xa9cmt'] = [FLAG5]
    m.tags['\xa9des'] = [CRUMB_0]
    m.save()
    back = MP4(str(MP4_PATH)).tags
    assert back['\xa9cmt'] == [FLAG5] and back['\xa9des'] == [CRUMB_0], 'hop0 read-back mismatch'
    print(f'hop0 ok  {MP4_PATH.relative_to(ROOT)}  ©cmt=FLAG#5  ©des=crumb')


def hop1():
    data = ICO.read_bytes()
    reserved, typ, count = struct.unpack_from('<HHH', data, 0)
    assert reserved == 0 and typ == 1 and count > 0, 'not an ICO file'
    end = 0
    for i in range(count):
        size, offset = struct.unpack_from('<II', data, 6 + i * 16 + 8)
        end = max(end, offset + size)
    assert 0 < end <= len(data), 'ICO directory points past EOF'
    payload = ('\n' + CRUMB_1 + '\n').encode('utf-8')
    ICO.write_bytes(data[:end] + payload)          # truncate to image end, then append: idempotent
    print(f'hop1 ok  favicon.ico  images end @{end}  +{len(payload)} B trailing')


def hop2():
    html = HTML.read_text(encoding='utf-8')
    b64 = base64.b64encode(f'{FLAG6}\n{CRUMB_2}'.encode('utf-8')).decode('ascii')
    decl = f'--last-node: "{b64}";'
    if re.search(r'--last-node:\s*"[^"]*";', html):
        html, n = re.subn(r'--last-node:\s*"[^"]*";', decl, html, count=1)
    else:
        assert len(re.findall(r'(?m)^\s*:root\s*\{', html)) == 1, 'hop2: expected exactly one :root{ block'
        html, n = re.subn(r'(?m)^(\s*:root\s*\{)', lambda mm: mm.group(1) + '\n    ' + decl, html, count=1)
    assert n == 1, 'hop2: could not anchor --last-node on :root{'
    HTML.write_text(html, encoding='utf-8')
    assert base64.b64decode(b64).decode('utf-8').split('\n')[0] == FLAG6
    print(f'hop2 ok  index.html  :root --last-node ({len(b64)} b64 chars)')


MP4_PATH = MP4
if __name__ == '__main__':
    for p in (MP4, ICO, HTML):
        if not p.exists():
            sys.exit(f'missing {p}')
    hop0(); hop1(); hop2()
