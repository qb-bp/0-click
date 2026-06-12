#!/usr/bin/env node
// build-iso-qr.mjs — out-of-band hash-verification QR for 27001.iso.
//
// LESSON MECHANIC (awareness, /for-managers): the laptop downloads the ISO,
// the phone scans this QR and holds the expected SHA-256. Two channels,
// one match = trust. The QR payload is PLAIN TEXT — deliberately not a URL,
// so a phone can only display it, never "open" it. Comparing is the lesson.
//
// SELF-REFERENCE NOTE: a file cannot carry its own hash (it would change
// itself). The ISO's hash must arrive out-of-band — this QR is that band.
// Same trap as embedding index.html's hash inside index.html.
//
// Emits ../for-managers/iso-hash-qr.svg (same-origin static asset; CSP
// img-src 'self' covers it). ZDR: build-time only, nothing dynamic ships.
//
// The QR regenerates ONLY when 27001.iso changes. If the ISO is rebuilt:
//   node scripts/build-iso-qr.mjs   (then scripts/update-hashes.sh)
//
// Dependency: npm package "qrcode" — resolved from scratch/qr-onepager/
// node_modules (same install the QR one-pager pipeline uses; gitignored).
//
// Usage:  node scripts/build-iso-qr.mjs [--check]
//   --check  exit 1 if existing SVG is stale vs current ISO hash (no write)

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const ISO = join(REPO, '27001.iso');
const OUT = join(REPO, 'for-managers', 'iso-hash-qr.svg');

const require_ = createRequire(join(REPO, 'scratch', 'qr-onepager', 'x.js'));
let QRCode;
try { QRCode = require_('qrcode'); }
catch {
  console.error('qrcode package not found — run: cd scratch/qr-onepager && npm install qrcode');
  process.exit(1);
}

const iso = await readFile(ISO);
const hex = createHash('sha256').update(iso).digest('hex');

// Plain text, three lines: file, algorithm, hash. Not a URL — by design.
const payload = `27001.iso\nSHA-256\n${hex}`;

// EC level M: payload is static text compared by eye; M keeps module
// density low (easier scan at small render sizes) vs the H used for the
// injected-content one-pager QRs, which have cosmetic overlays to survive.
const svg = await QRCode.toString(payload, {
  errorCorrectionLevel: 'M',
  type: 'svg',
  margin: 2,
  width: 400,
  color: { dark: '#000000', light: '#ffffff' },
});

if (process.argv.includes('--check')) {
  const existing = await readFile(OUT, 'utf8').catch(() => '');
  const fresh = existing.includes(`data-iso-sha256="${hex}"`);
  console.log(fresh ? 'iso-hash-qr.svg: fresh' : 'iso-hash-qr.svg: STALE — rerun build-iso-qr.mjs');
  process.exit(fresh ? 0 : 1);
}

// Stamp the hash as a data attribute so --check (and curious view-sourcers)
// can verify which ISO this QR was built against without decoding it.
const stamped = svg.replace('<svg ', `<svg data-iso-sha256="${hex}" `);
await writeFile(OUT, stamped);
console.log('for-managers/iso-hash-qr.svg written');
console.log('payload:', payload.replace(/\n/g, ' · '));
