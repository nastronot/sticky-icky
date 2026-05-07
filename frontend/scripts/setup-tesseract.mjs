#!/usr/bin/env node
// Copy Tesseract.js runtime assets out of node_modules into public/tesseract/
// so they're served from the same origin (CSP keeps default-src 'self'). Also
// downloads the language data files once for every language we recognize at
// runtime. Idempotent — does nothing if every required file is already
// present. Runs as a postinstall hook so `npm install` in a fresh clone (and
// the Docker build) prepares the assets before Vite's build copies the
// public/ tree into dist/.

import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
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

// Languages bundled for the OCR feature. Postcrossing is global, so we
// cover the top-10 origin countries: English, Chinese (Simplified +
// Traditional), Japanese, and Russian. Using the `_fast` tessdata variant
// keeps each language to ~1.5–2 MB (total ~7 MB compressed) with a
// 1–2% accuracy hit on clean printed text vs the full models — fine for
// the kind of clean-print address cards Postcrossing exchanges.
const LANGS = ['eng', 'chi_sim', 'chi_tra', 'jpn', 'rus'];
const TESSDATA_VARIANT = 'fast';                      // bumps every language's redownload when changed
const TESSDATA_BASE = `https://tessdata.projectnaptha.com/4.0.0_${TESSDATA_VARIANT}`;
const VARIANT_FILE = join(PUBLIC_DIR, '.variant');    // sentinel — switching variants triggers a refresh

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

async function downloadOne(lang) {
  const file = `${lang}.traineddata.gz`;
  const path = join(PUBLIC_DIR, file);
  const url = `${TESSDATA_BASE}/${file}`;
  console.log(`[tesseract setup] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[tesseract setup] download failed: ${res.status} ${res.statusText} (${url})`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
}

async function ensureTrainedData() {
  // Clear stale-variant data so switching tessdata_fast↔best is reliable.
  const cur = existsSync(VARIANT_FILE) ? readFileSync(VARIANT_FILE, 'utf-8').trim() : null;
  if (cur && cur !== TESSDATA_VARIANT) {
    for (const lang of LANGS) {
      const path = join(PUBLIC_DIR, `${lang}.traineddata.gz`);
      if (existsSync(path)) unlinkSync(path);
    }
  }

  let downloaded = 0;
  for (const lang of LANGS) {
    const path = join(PUBLIC_DIR, `${lang}.traineddata.gz`);
    if (existsSync(path) && statSync(path).size > 200_000) continue;
    await downloadOne(lang);
    downloaded++;
  }

  if (cur !== TESSDATA_VARIANT) {
    writeFileSync(VARIANT_FILE, TESSDATA_VARIANT + '\n');
  }
  return downloaded;
}

async function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true });

  let copied = 0;
  for (const [src, dest] of COPY) {
    if (copyAsset(src, dest)) copied++;
  }
  const downloaded = await ensureTrainedData();

  if (copied === 0 && downloaded === 0) {
    // Quiet success — postinstall runs on every npm install.
    return;
  }
  console.log(`[tesseract setup] ready (${copied} files copied${downloaded > 0 ? `, ${downloaded} traineddata downloaded` : ''})`);
}

main().catch((err) => {
  console.error('[tesseract setup] error:', err);
  process.exit(1);
});
