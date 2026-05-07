#!/usr/bin/env node
// Copy Tesseract.js runtime assets out of node_modules into public/tesseract/
// so they're served from the same origin (CSP keeps default-src 'self'). Also
// downloads the English language data file once. Idempotent — does nothing
// if every required file is already present. Runs as a postinstall hook so
// `npm install` in a fresh clone (and the Docker build) prepares the assets
// before Vite's prebuild copies the public/ tree into dist/.

import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public', 'tesseract');

// All of tesseract.js-core's runtime variants, plus the worker. Tesseract
// feature-detects which engine the browser supports (plain / simd /
// relaxedsimd, with or without LSTM) by attempting to load each in turn
// and falling back on 404 — so we ship every variant. They're small (a
// few MB total uncompressed) and the browser only fetches the one(s) it
// actually picks.
const COPY = [
  ['tesseract.js/dist/worker.min.js',                          'worker.min.js'],
  ['tesseract.js-core/tesseract-core.wasm',                    'tesseract-core.wasm'],
  ['tesseract.js-core/tesseract-core.wasm.js',                 'tesseract-core.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd.wasm',               'tesseract-core-simd.wasm'],
  ['tesseract.js-core/tesseract-core-simd.wasm.js',            'tesseract-core-simd.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm',               'tesseract-core-lstm.wasm'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js',            'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm',          'tesseract-core-simd-lstm.wasm'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js',       'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd.wasm',        'tesseract-core-relaxedsimd.wasm'],
  ['tesseract.js-core/tesseract-core-relaxedsimd.wasm.js',     'tesseract-core-relaxedsimd.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm',   'tesseract-core-relaxedsimd-lstm.wasm'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js'],
];

// Pinned to the version tesseract.js@7 expects (its CDN default). Fetched
// once and cached on disk; the file is ~10 MB compressed.
const TRAINEDDATA_URL = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz';
const TRAINEDDATA_PATH = join(PUBLIC_DIR, 'eng.traineddata.gz');

function copyAsset(srcRel, destName) {
  const src = join(ROOT, 'node_modules', srcRel);
  const dest = join(PUBLIC_DIR, destName);
  if (!existsSync(src)) {
    console.error(`[tesseract setup] missing source: ${srcRel}`);
    process.exit(1);
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
    return false; // already present, same size — skip
  }
  copyFileSync(src, dest);
  return true;
}

async function ensureTrainedData() {
  if (existsSync(TRAINEDDATA_PATH) && statSync(TRAINEDDATA_PATH).size > 1_000_000) {
    return false;
  }
  console.log(`[tesseract setup] downloading ${TRAINEDDATA_URL}`);
  const res = await fetch(TRAINEDDATA_URL);
  if (!res.ok) {
    console.error(`[tesseract setup] download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(TRAINEDDATA_PATH, buf);
  return true;
}

async function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true });

  let copied = 0;
  for (const [src, dest] of COPY) {
    if (copyAsset(src, dest)) copied++;
  }
  const downloaded = await ensureTrainedData();

  if (copied === 0 && !downloaded) {
    // Quiet success — postinstall runs on every npm install.
    return;
  }
  console.log(`[tesseract setup] ready (${copied} files copied${downloaded ? ', traineddata downloaded' : ''})`);
}

main().catch((err) => {
  console.error('[tesseract setup] error:', err);
  process.exit(1);
});
