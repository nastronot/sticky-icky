# CLAUDE.md

## Project

Sticky Icky — browser-based design tool for the Zebra LP2844 thermal printer. Single repo, two parts:

- `frontend/` — React 19 + Vite 8 canvas editor. Layer types: Big Text, free Text, Address, Image, Shape (rectangle/ellipse/polygon/star/line). Per-layer dithering and invert, XOR compositing, save/load gallery in IndexedDB.
- `backend/` — Minimal FastAPI server. Single `POST /print` endpoint converts a base64 1bpp bitmap into an EPL2 GW payload and writes it to the printer over serial.

`README.md` is the user-facing feature description — keep it in sync when adding/removing features. `docs/spec.md` is the original v1 brief and is now mostly outdated.

---

## Repo

- **Remote**: `git@github-nastronot:nastronot/sticky-icky.git` (SSH alias — see `~/.ssh/config`)
- **Owner / author**: `nastronot <nastronot@proton.me>` (local git config, not global)

---

## Workflow

- **claude.ai (browser)** = planning, prompt crafting, high-level decisions.
- **Claude Code** = implementation only, directed by browser prompts. Flag ambiguity, don't assume architectural decisions.
- Commit per completed task or logical unit of work — not per file edit, not one giant commit per session.
- Every commit that changes application code must bump `frontend/package.json` semver:
  - **Patch** (`x.y.Z`) — bug fixes, small tweaks, refactors
  - **Minor** (`x.Y.0`) — new features, non-breaking additions
  - **Major** (`X.0.0`) — breaking changes
  - Ask if ambiguous. Documentation-only or CI-only commits don't bump.

---

## On Session Start

1. Read this file
2. Read `README.md` if you need a high-level overview for users
3. Do not read files speculatively

---

## Hardware

| Property         | Value                                              |
| ---------------- | -------------------------------------------------- |
| Printer          | Zebra LP2844                                       |
| Transport        | Serial via `/dev/ttyUSB0` @ 38400 baud, 8N1, RTS/CTS |
| Firmware         | EPL2 only — V4.29 UPS-branded. **No ZPL.**         |
| Resolution       | 203 DPI                                            |
| Print width      | 832 dots (4.09")                                   |
| Image buffer     | 245 KB (hard ceiling per print)                    |
| Max label length | ~2400 dots (~11.8")                                |
| Bitmap command   | `GW` (Direct Graphic Write)                        |

**There is no ZPL support. Do not use `^GF`, `^XA`, or any ZPL syntax.**

---

## Print Pipeline

```
Layer state in App (React)
  → CanvasPreview renders each layer to its own offscreen canvas
  → xorComposite flattens visible layers onto the print canvas
  → encodePrintPayload packs 1bpp row-major MSB-first bytes (1=black, 0=white) and base64 encodes
  → POST /print  { bitmap, width, height, labelW, labelH, darkness, speed, copies, xOffset, yOffset }
  → backend XORs every byte 0xFF (GW expects 0=black, 1=white)
  → backend builds EPL2 GW payload and writes to /dev/ttyUSB0
```

### EPL2 payload format

```
\r\n                                       — wake / line sync
D{darkness}\r\n                            — print darkness (0–15)
S{speed}\r\n                               — print speed (1–4)
N\r\n                                      — clear image buffer
q{width}\r\n                               — label width in dots (= padded bitmap width)
Q{labelH},21\r\n                           — label height in dots + 21-dot inter-label gap
GW{xOffset},{yOffset},{width_bytes},{height}\r\n  — Direct Graphic Write
{raw inverted bitmap bytes}                — width_bytes × height bytes, NO separator
P{copies}\r\n                              — print N copies
```

- **Command ordering**: D and S are "Stored" configuration commands and must appear before N (EPL2 manual p. 120: "All printer configuration commands should be issued prior to issuing the N command.").
- The `q` command receives the *padded* bitmap width, not the user-facing label width — q must match the byte count GW will stream.
- **GW p1 and p2 are both in dots** (EPL2 Programming Guide p. 108). `xOffset` and `yOffset` are passed directly to GW without conversion. Default xOffset=10 dots, yOffset=0.
- **yOffset is currently inert**: the pipeline always sizes the bitmap to exactly `labelH` dots, so yOffset has no visible effect unless that changes.
- **GW data follows immediately**: the binary bitmap follows the `GW` line right after its `\r\n` with no separator. Extra bytes desync the printer.
- **Bit polarity is inverted**: GW expects `0=black, 1=white`; the frontend packs `1=black, 0=white`; the backend XORs every byte with `0xFF`. **Don't move the inversion to the frontend** — the canvas/composite pipeline assumes 1=black.
- Darkness, speed, xOffset, yOffset, gammaCorrect are **global settings** in the IndexedDB `settings` store (Settings modal → Print tab), not per-preset.

---

## Deployment

### Architecture

- **frontend** container: nginx:alpine serving the Vite build on port 80, proxying `/api/` → `http://backend:8765/` (the `/api` prefix is stripped). SPA fallback to `index.html`.
- **backend** container: python:3.12-slim running uvicorn on 8765 (internal compose network only — nginx is the only ingress). `/dev/ttyUSB0` is mapped in via compose `devices:` — the printer must be connected before starting the stack.
- **Images**: `ghcr.io/nastronot/sticky-icky-{frontend,backend}:latest`, also `:sha-<commit>` per build.
- **CI**: `.github/workflows/build-and-push.yml` matrix-builds both on every push to `main`.

### Env vars

| Var | Service | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | frontend (build-time) | `http://localhost:8765` dev / `/api` prod | Base URL for fetch. Prod build expects nginx to proxy `/api/`. |
| `CORS_ORIGINS` | backend | `localhost:5173,4173,3000` | Comma-separated allowlist. Set to public domain in prod. Never `*`. |
| `SERIAL_PORT` | backend | `/dev/ttyUSB0` | Serial device path inside the container. |

### Compose files

- `docker-compose.yml` — local testing, builds from source, frontend on `localhost:3000`.
- `docker-compose.prod.yml` — Synology NAS, pulls GHCR images, reads `.env` for `CORS_ORIGINS`, passes `/dev/ttyUSB0` into the backend.

### Security

- **Non-root container**: backend runs as `printer` (UID 1000, GID 20 / dialout).
- **Body limits**: nginx `client_max_body_size 1m`; Pydantic caps `bitmap` at 1 MB base64. An 832×2400 1-bit bitmap is ~62 KB base64.
- **Rate limiting**: `/print` is 10 req/min/IP via slowapi. `/health` is unlimited.
- **Input validation**: Pydantic bounds — `width` 8–4096 (multiple of 8), `height` 1–4096, `darkness` 0–15, `speed` 1–4, `copies` 1–99. Bitmap size must match width×height.
- **Serial path**: `SERIAL_PORT` is regex-validated to `/dev/tty[A-Za-z0-9_]+` at startup.
- **CORS**: origin allowlist from env. **Never `*`**.
- **FastAPI introspection disabled**: `docs_url=None, redoc_url=None, openapi_url=None`. Only `/print` and `/health` are exposed.
- **No-indexing**: `robots.txt` disallows everything, `<meta name="robots">` in `index.html` reinforces.
- **nginx headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()`, plus a CSP. CSP allows `'unsafe-inline'` on `script-src` and `style-src` because React emits inline `style="…"` and Cloudflare Access injects inline `<script>` blocks (Email Obfuscation, Rocket Loader, etc.) — hash-pinning is unmaintainable. CSP also includes `'wasm-unsafe-eval'` for Tesseract.js and `worker-src 'self' blob:` for its worker.
- **HSTS lives at the edge** (Synology reverse proxy / Let's Encrypt). Do not add `Strict-Transport-Security` in `frontend/nginx.conf`.
- **Dependency pin policy**: every dep in `frontend/package.json` and `backend/requirements.txt` is pinned to an exact version (no `^`, `~`, `>=`). `package-lock.json` is committed. No `@types/*` — the frontend is pure JSX.
- **Network layer**: app assumes Cloudflare Access / VPN / LAN-only in front. No built-in auth. Do not expose the backend directly to the internet.

---

## Frontend internals worth knowing

### Schema migrations and load-time shims

These run silently on load and let old saved designs keep working. **If you touch the deserializer, preserve them.** Source of truth: `frontend/src/utils/storage.js` (`deserializeLayer` / `deserializeDesign`) and `frontend/src/components/App.jsx` (one-time migration block).

- `type:"fill"` layers → promoted to `type:"shape", shapeKind:"rectangle"`.
- Legacy short pattern ids (`"solid"`, `"waves"`…) → mapped to `default-*` via `mapLegacyPatternId`. Unknown ids fall back to `default-solid` in `getPattern`.
- Address layers' stored `x`/`y`/`width`/`height`/`rotation` are ignored at render time — Address occupies the full label.
- Image layers' obsolete `edgeEnabled` / `edgeStrength` / `upscaleFactor:4` fields (Sobel edge detection, removed) are accepted but ignored.
- `presetIdx` (numeric index) → resolved to stable `presetId` against the current dropdown. Out-of-range falls back to Custom with stored `customW`/`customH`/`labelW`/`labelH`.
- `demoSafe` field is backfilled to `false` on first load and persisted back (silent one-time per record).
- `xOffset_v2_migrated` flag (settings store): one-time divide-by-8 fix for stored xOffset values > 40 (pre-bugfix when offset was wrongly bytes).
- `patterns_seeded_v1` flag (settings store): guards against re-seeding default patterns the user deleted. Restore Defaults re-seeds only the missing default-* ids.
- IndexedDB v1→v2 migration (one-time) pulls presets from `localStorage:thermal_label_presets_v2` and screen DPI from `localStorage:thermal_screen_dpi`, then deletes the localStorage keys.

### Image processing pipeline

`utils/renderImage.js#processImage`: **upscale → (threshold XOR dither)**. Threshold modes are `"off" | "auto" | "manual"`; when not `"off"`, the dither step is skipped and the Brightness / Dithering / Amount controls hide entirely (hidden, not dimmed — if a control isn't doing work, it isn't shown). Cache keyed by layer id; signature includes every pipeline knob plus the global `gammaCorrect` flag so toggling busts every image-layer cache entry.

### Gamma correction

- Canvas `ImageData` is sRGB; a byte of 128 is ≈22% linear luminance, not 50%, so threshold/dither maths against 128 in sRGB skew midtones bright.
- Global `gammaCorrect` flag (Settings → Print) routes sRGB bytes through `SRGB_TO_LINEAR_LUT` before luma is computed, and maps the threshold cutoff through the same LUT before comparison.
- **Default off** — pre-existing designs render byte-identical to before; users opt in.
- **Scope**: image-layer pipeline only (`ditherImage`, `applyThreshold`, `otsuThreshold`). The sidebar dither (`applyDither`) reads near-binary text rasters where gamma is a no-op, so it isn't threaded through.

### Dither algorithm ids

`utils/dither.js#applyDither` (sidebar) and `#ditherImage` (image layers) accept the same ids: `none`, `bayer4`, `bayer8`, `floydSteinberg` / `floyd` (synonyms — both ids are accepted because the pipelines historically diverged), `atkinson`, `riemersma`. Don't break the `floyd`/`floydSteinberg` synonym — saved designs use both.

### Postcrossing flag registry

`utils/flags.js` maps ISO 3166-1 alpha-2 codes (parsed from the ID prefix `XX-…`) to SVG assets in `src/assets/flags/<code>.svg`. To add a country: drop a **black-on-white** SVG and register the code in `FLAG_URLS`. The renderer inverts at draw time with canvas `filter: 'invert(1)'`, so a single on-disk asset serves the white-on-black banner. Unknown codes fall back to "no flag, ID only".

### Tesseract.js OCR

- Client-side, all assets same-origin from `/tesseract/`. `scripts/setup-tesseract.mjs` (npm postinstall) copies the worker + WASM cores out of `node_modules/tesseract.js{,-core}/` and downloads the `tessdata_fast` language packs. `public/tesseract/` is gitignored and regenerated each `npm install`. A `public/tesseract/.variant` sentinel triggers re-download when `TESSDATA_VARIANT` changes.
- Bundled languages: `eng + deu + chi_sim + chi_tra + jpn + rus` (≈10 MB compressed total). Loaded together by every worker. German is required so addresses with `ß`/`ä`/`ö`/`ü` aren't misread — e.g. "Bogenstraße" came out "Bogenstralle" under English-only.
- Tesseract.js is dynamically `import()`-ed so its code only downloads when the user clicks the OCR button.
- `/tesseract/` has its own `try_files $uri =404` in nginx so feature-detect probe misses return clean 404 instead of falling through to `index.html` and tripping importScripts MIME checks.
- `utils/ocrModalState.js` is a module-level open flag the modal toggles. `App.jsx`'s document-level paste-image handler bails when it's set so a clipboard image meant for OCR doesn't also become an Image layer.

---

## Commands

```bash
# Backend dev
cd backend && . venv/bin/activate && uvicorn main:app --reload --port 8765

# Frontend dev
cd frontend && npm run dev    # vite on http://localhost:5173
                # npm run build / lint / test

# Local docker
docker-compose up --build

# Prod docker (Synology NAS)
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Manual print test (raw EPL2)
cat test.epl > /dev/ttyUSB0

# Printer status query (UQ command)
sudo bash -c 'cat /dev/ttyUSB0 & echo -e "UQ\r\n" > /dev/ttyUSB0; sleep 2; kill %1'
```

---

## Known Gotchas

- **Serial vs USB transport**: `GW` is non-functional over `/dev/usb/lp0` on V4.29 UPS-branded firmware (silently produces blank labels). Serial is the only working transport for raster output. The repo no longer contains any USB / `/dev/usb/lp0` code. **Do not re-add it.** Full rationale, the alternatives that were tried, and how to identify a rebranded-firmware unit: `README.md` § *Firmware and transport notes* — that is the authoritative account, not this line.
- **Baud rate is 38400** — the maximum reliable speed. 57600+ drops bytes and produces partial labels. 9600 works but is slow for full-page bitmaps.
- **245 KB image buffer is a hard ceiling**: an 832×2400 1-bit bitmap is ~249 KB and will fail. Test large prints early.
- **Darkness × speed**: D13+ at S2+ overdraws the head on dense rows and stalls partway through. Defaults D15 S1 are reliable for this app's dense art.
- **`/dev/ttyUSB0` permissions**: user needs `dialout` (or `uucp`) group. Permission resets every time the adapter is reconnected — udev rule or `chmod 666 /dev/ttyUSB0` is the dev workaround.
- **CUPS raw queue** (`ZebraLP2844`) may exist on the dev box, but the backend bypasses CUPS entirely and writes the serial device directly.
- **Dithering must be applied before encoding** — the printer has no grayscale capability.

### Frontend rendering quirks

- **`imageSmoothingEnabled = false` on every offscreen context**, and CSS `image-rendering: pixelated` on the preview. Non-negotiable for 1-bit output; the mechanism and why the dropout is position-dependent are in the vault (`canvas-image-smoothing-destroys-1-bit-output`).
- **Fonts before measure**: `await document.fonts.load(fontSpec)` before `measureText` or draw, using the same string you assign to `ctx.font`. Also in the vault (`measure-text-only-after-fonts-load`), together with the `actualBoundingBox*` height rule below.
- **Canvas display scale**: compute `displayScale` synchronously via `getBoundingClientRect()` in the same effect that sets `canvas.width/height` — `ResizeObserver` alone adds a one-frame lag on label-size changes. Initialize to `0` so the canvas is invisible for one frame instead of flashing at full 832 px. Guard zero-rect on first mount and let `ResizeObserver` handle that paint.
- **Canvas text height**: use `textBaseline = 'alphabetic'` with `actualBoundingBoxAscent` / `actualBoundingBoxDescent`. The `size * 1.15` heuristic underestimates heavy fonts like Arial Black.
- **Big Text justify**: all lines (including the last) are fully justified — per-line letter spacing is `(maxW - naturalW) / (charCount - 1)`. Single-character lines fall back to left-aligned.
- **Non-destructive text-style toggles**: All Caps / Small Caps / Italic never modify the textarea. Display text is derived. All Caps and Small Caps are mutually exclusive; Italic is independent. Small Caps renders originally-lowercase chars at 70% of fitted size via a parallel `origLine`.
- **Rotated viewport pointer math**: when `viewportRotation === 90`, the inverse is `(canvasX, canvasY) = (sy, labelH - sx)` — applied once at the `screenToCanvas` boundary so all downstream interactions stay branch-free.
- **Refs mirrored from props/state**: long-lived event handlers (keydown, pointer) bind once and read fresh values from refs. Assign refs inside a `useEffect` to respect React's no-refs-during-render rule.
