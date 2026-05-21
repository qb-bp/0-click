#!/usr/bin/env python3
# scripts/build-vcard-photo.py
#
# Inject a contact photo into cooperation/contact.vcf as an inline
# base64-encoded PHOTO field. ZDR-clean — the .vcf carries the image
# bytes; no external fetch when the contact is imported.
#
# ─── Three-layer photo injection (sister-surface flag mechanic) ────
#
#   Layer 1 — Visual (humans)
#     Compose contact-photo.{jpg,png,gif} as you want it to appear
#     in a recipient's phone Contacts. Headshot, abstract image, etc.
#
#   Layer 2 — AI vision watermark (AI summarizers)
#     If you want AI vision models that parse the .vcf to relay
#     specific framing, bake the text into the photo itself
#     (overlay text in your editor of choice). Humans see it as a
#     small caption; AI vision transcribes it.
#
#   Layer 3 — EXIF metadata flag (cybersec audience)
#     BEFORE running this script, optionally inject EXIF metadata:
#       exiftool -overwrite_original \
#         -ImageDescription='FLAG{YOUR_TRUTH_HERE}' \
#         -UserComment='FLAG{YOUR_TRUTH_HERE}' \
#         -Comment='FLAG{YOUR_TRUTH_HERE}' \
#         cooperation/contact-photo.jpg
#     The flag travels with the photo bytes — recipient who runs
#     `exiftool extracted-photo.jpg` discovers it.
#
# ─── Usage ─────────────────────────────────────────────────────────
#
#   cd ~/Documents/0-click.com
#   # 1. Drop your photo at cooperation/contact-photo.jpg  (or .png/.gif)
#   # 2. (Optional) Inject EXIF flag via exiftool, see above
#   # 3. Run this:
#   python3 scripts/build-vcard-photo.py
#   # 4. Commit + deploy
#
# Idempotent — re-running re-encodes from the source file, replaces
# the PHOTO line in .vcf without touching other fields.
#
# Pure stdlib. No pip dependencies. Tested with Python 3.8+.

import base64
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SRC_CANDIDATES = [
    REPO / 'cooperation' / 'contact-photo.jpg',
    REPO / 'cooperation' / 'contact-photo.jpeg',
    REPO / 'cooperation' / 'contact-photo.png',
    REPO / 'cooperation' / 'contact-photo.gif',
]

VCF = REPO / 'cooperation' / 'contact.vcf'

# vCard 3.0 RFC 2426 — PHOTO type per file extension
EXT_TO_TYPE = {
    '.jpg':  'JPEG',
    '.jpeg': 'JPEG',
    '.png':  'PNG',
    '.gif':  'GIF',
}

# vCard line folding: max 75 octets per line, continuation lines start
# with a single space. Base64 ASCII is 1 byte per char, so 74 chars per
# fold leaves room for the leading space.
FOLD_WIDTH = 74


def find_source():
    for path in SRC_CANDIDATES:
        if path.exists():
            return path
    return None


def fold_base64(b64_str: str) -> str:
    """vCard 3.0 line folding for inline base64."""
    lines = [b64_str[i:i + FOLD_WIDTH] for i in range(0, len(b64_str), FOLD_WIDTH)]
    # First chunk on same line as `PHOTO;...:`, subsequent lines prepended ` `
    return '\n '.join(lines)


def update_vcard(vcf_path: Path, photo_line: str) -> int:
    """Remove existing PHOTO field (including continuation lines) and
    insert the new one before END:VCARD. Returns count of removed
    PHOTO blocks (for sanity)."""
    raw = vcf_path.read_text(encoding='utf-8')
    lines = raw.splitlines()
    out = []
    skip_continuation = False
    removed = 0
    for line in lines:
        # Begin skipping when a PHOTO line starts
        if line.startswith('PHOTO'):
            skip_continuation = True
            removed += 1
            continue
        # Continuation lines for a PHOTO field start with a space or tab
        if skip_continuation and (line.startswith(' ') or line.startswith('\t')):
            continue
        skip_continuation = False
        # Insert new PHOTO immediately before END:VCARD
        if line.startswith('END:VCARD'):
            out.append(photo_line)
        out.append(line)
    vcf_path.write_text('\n'.join(out) + '\n', encoding='utf-8')
    return removed


def main():
    src = find_source()
    if not src:
        print('ERROR: no source photo found. Drop one of:', file=sys.stderr)
        for p in SRC_CANDIDATES:
            print(f'  {p.relative_to(REPO)}', file=sys.stderr)
        sys.exit(1)

    if not VCF.exists():
        print(f'ERROR: vCard not found at {VCF.relative_to(REPO)}', file=sys.stderr)
        sys.exit(1)

    photo_type = EXT_TO_TYPE[src.suffix.lower()]
    src_bytes = src.read_bytes()
    src_size = len(src_bytes)

    print(f'[build-vcard-photo] source: {src.relative_to(REPO)}  ({src_size:,} B, {photo_type})')

    # Phone Contacts apps typically downscale display to ~256-512px.
    # Source > 200 KB usually means inefficient encoding; warn but continue.
    if src_size > 200 * 1024:
        print(f'[build-vcard-photo] WARNING: source is {src_size // 1024} KB —')
        print(f'                    phone Contacts will downscale anyway, consider')
        print(f'                    resizing source to ~512px wide for smaller .vcf.')

    b64 = base64.b64encode(src_bytes).decode('ascii')
    folded = fold_base64(b64)
    photo_line = f'PHOTO;ENCODING=b;TYPE={photo_type}:{folded}'

    removed = update_vcard(VCF, photo_line)
    print(f'[build-vcard-photo] removed {removed} existing PHOTO block(s) from {VCF.name}')
    print(f'[build-vcard-photo] inserted new PHOTO ({len(b64):,} base64 chars)')
    print()
    print(f'[build-vcard-photo] {VCF.name} updated. New .vcf size: {VCF.stat().st_size:,} B')

    # EXIF reminder block — only printed if exiftool is on PATH
    import shutil
    if shutil.which('exiftool'):
        print()
        print('To inject EXIF metadata flag (cybersec layer) BEFORE re-running:')
        print(f'  exiftool -overwrite_original \\')
        print(f'    -ImageDescription="FLAG{{...your truth...}}" \\')
        print(f'    -UserComment="FLAG{{...your truth...}}" \\')
        print(f'    {src.relative_to(REPO)}')


if __name__ == '__main__':
    main()
