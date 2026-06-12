#!/usr/bin/env node
// build-ctf7-blob.mjs — CTF #7 KDF closure: build-time encryptor.
//
// The six canonical CTF flags, concatenated in order, ARE the AES-GCM key
// material. This is a CLOSURE mechanism, not secrecy — the flags are a public
// manifesto; PBKDF2 is the ritual cost, not brute-force defense. The GCM auth
// tag self-verifies (wrong/reordered/incomplete flags fail silently).
//
// Emits ../ctf7.blob.js (repo root) → loaded in index.html as window.__CTF7_BLOB,
// covered by CSP script-src 'self'. ZDR: runs offline; only the encrypted blob
// ships. Re-run scripts/update-hashes.sh after (ctf7.blob.js is in FILES).
//
// PAYLOAD: defaults to the scratch placeholder. Before deploy, point this at
// your real (private) ritual payload:  node build-ctf7-blob.mjs <payload.txt>
//
// Usage:  node scripts/build-ctf7-blob.mjs [payloadPath] [--selftest]

import { webcrypto as wc } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const subtle = wc.subtle;

// Canonical flag order — MUST match docs/CTF-FLAGS.md exactly.
export const CANONICAL_FLAGS = [
  'FLAG{ATTENTION_IS_THE_FIRST_DEFENSE}',
  'FLAG{THE_CONSOLE_IS_AN_HONEST_PLACE}',
  'FLAG{HEADERS_ARE_WHISPERS_BENEATH_PAGES}',
  'FLAG{ROUTES_ARE_LOCAL_BUT_LOUD}',
  'FLAG{EVEN_A_VIDEO_CAN_KEEP_A_SECRET}',
  'FLAG{YOU_ARRIVED_AT_THE_LAST_REACHABLE_NODE}',
];

// Canonical join: full FLAG{} tokens, trimmed, newline-separated, in order.
// MUST stay byte-identical to window.synapse.seventh() in index.html.
export const joinFlags = (flags) => flags.map((f) => f.trim()).join('\n');

const PBKDF2_ITER = 200000;
const PBKDF2_HASH = 'SHA-256';
const KEY_BITS = 256;

const enc = new TextEncoder();
const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

export async function deriveKey(flags, saltBytes) {
  const baseKey = await subtle.importKey(
    'raw', enc.encode(joinFlags(flags)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITER, hash: PBKDF2_HASH },
    baseKey, { name: 'AES-GCM', length: KEY_BITS }, false, ['encrypt', 'decrypt']);
}

export async function encryptPayload(plaintext, flags = CANONICAL_FLAGS) {
  const salt = wc.getRandomValues(new Uint8Array(16));
  const iv = wc.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(flags, salt);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return {
    alg: 'AES-256-GCM', kdf: 'PBKDF2', hash: PBKDF2_HASH, iterations: PBKDF2_ITER,
    salt: b64(salt), iv: b64(iv), ct: b64(ct),
    note: 'Key material = six canonical FLAG{} tokens, newline-joined, in order. Closure, not secrecy.',
  };
}

export async function decryptBlob(blob, flags) {
  const key = await deriveKey(flags, unb64(blob.salt));
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return new TextDecoder().decode(pt);
}

const DEFAULT_PAYLOAD = join(REPO, 'scratch/visitor-journey/ctf7-kdf/ritual-payload.PLACEHOLDER.txt');

async function main() {
  const args = process.argv.slice(2);
  const selftest = args.includes('--selftest');
  const payloadPath = resolve(args.find((a) => !a.startsWith('--')) || DEFAULT_PAYLOAD);
  const payload = await readFile(payloadPath, 'utf8');
  const isPlaceholder = payload.includes('[USER-AUTHORED');

  const blob = await encryptPayload(payload);
  await writeFile(join(REPO, 'ctf7.blob.js'),
    'window.__CTF7_BLOB = ' + JSON.stringify(blob, null, 2) + ';\n');
  console.log('ctf7.blob.js written from ' + payloadPath);
  if (isPlaceholder) console.log('⚠  PLACEHOLDER payload — author the real ritual before deploy.');

  if (!selftest) return;
  const back = await decryptBlob(blob, CANONICAL_FLAGS);
  console.log('selftest: correct ->', back === payload ? 'DECRYPT OK' : 'MISMATCH');
  const rev = [...CANONICAL_FLAGS].reverse();
  try { await decryptBlob(blob, rev); console.log('selftest: reversed -> UNEXPECTED (BUG)'); }
  catch { console.log('selftest: reversed -> rejected (correct)'); }
}

// Guard: run only when executed directly — importing the exported helpers
// (deriveKey/encryptPayload/decryptBlob) must NOT rewrite ctf7.blob.js.
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
