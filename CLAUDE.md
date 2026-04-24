# CLAUDE.md

## Project

Sticky Icky — browser-based design tool for the Zebra LP2844 thermal printer. Single repo, two parts:

- `~/dev/thermal/frontend/` — React + Vite app. Multi-layer canvas editor (Big Text, free Text, Image, Solid Fill), per-layer dithering and invert, XOR compositing, save/load gallery backed by IndexedDB.
- `~/dev/thermal/backend/` — Minimal FastAPI server. Single `POST /print` endpoint that converts a base64 1bpp bitmap into an EPL2 GW payload and writes it to the printer over serial.

`docs/spec.md` is the original v1 brief and is now mostly outdated. Use this file as the source of truth for current state.

---

## Repo

- **Remote**: `git@github-nastronot:nastronot/sticky-icky.git` (SSH alias — see `~/.ssh/config` for host mapping)
- **Owner / author**: `nastronot <nastronot@proton.me>` (local git config, not global)

---

## Workflow

- **claude.ai (browser)** = planning, prompt crafting, high-level decisions
- **Claude Code** = implementation only, directed by browser prompts
- Claude Code does not make architectural decisions. Flag ambiguity, don't assume.
- After each completed task or logical unit of work: commit with a descriptive message. Not after every file edit, not one giant commit per session.
- Every commit that changes application code (frontend or backend) must also bump the version in `frontend/package.json` following semver (`major.minor.patch`):
  - **Patch** (`x.y.Z`): bug fixes, small tweaks, refactors
  - **Minor** (`x.Y.0`): new features, non-breaking additions
  - **Major** (`X.0.0`): breaking changes, major reworks
  - If the bump type is ambiguous, ask before committing. Documentation-only or CI-only commits don't require a bump.

---

## On Session Start

1. Read `CLAUDE.md` (this file)
2. Read `README.md` if you need a high-level overview of the project for users
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
| Image buffer     | 245 KB                                             |
| Max label length | ~2400 dots (~11.8")                                |
| Bitmap command   | `GW` (Direct Graphic Write)                        |

**There is no ZPL support. Do not use `^GF`, `^XA`, or any ZPL syntax.**

---

## Print Pipeline

```
Layer state in App (React)
  → CanvasPreview renders each layer to its own offscreen canvas
  → xorComposite flattens visible layers onto the print canvas
  → encodePrintPayload (frontend) packs 1bpp row-major MSB-first bytes (1=black, 0=white) and base64 encodes
  → POST /print  { bitmap, width, height, labelW, labelH, darkness, speed, copies, xOffset, yOffset }
  → backend XORs every byte 0xFF (GW expects 0=black, 1=white)
  → backend builds EPL2 GW payload and writes to /dev/ttyUSB0 via pyserial @ 38400 8N1, RTS/CTS
```

### EPL2 payload format

The backend assembles and sends this to the printer over serial:

```
\r\n                                       — wake / line sync
D{darkness}\r\n                            — print darkness (0–15)  ← config commands BEFORE N
S{speed}\r\n                               — print speed (1–4)     ← (EPL2 manual p. 120)
N\r\n                                      — clear image buffer
q{width}\r\n                               — label width in dots (= padded bitmap width)
Q{labelH},21\r\n                           — label height in dots + 21-dot inter-label gap
GW{xOffset},{yOffset},{width_bytes},{height}\r\n  — Direct Graphic Write
{raw inverted bitmap bytes}                — width_bytes × height bytes, NO separator
P{copies}\r\n                              — print N copies
```

Notes:
- **Command ordering**: D and S are "Stored" configuration commands (EPL2 manual p. 38) and must appear before N per manual p. 120: "All printer configuration commands should be issued prior to issuing the N command."
- The `q` command receives the *padded* bitmap width, not the user-facing label width — the printer expects q to match the byte count GW will stream.
- **GW p1 and p2 are both in dots** (confirmed empirically and per EPL2 Programming Guide p. 108). xOffset and yOffset are passed directly to GW without conversion. Default xOffset=10 dots, yOffset=0 dots. The old code incorrectly treated p1 as bytes and divided by 8 — this was fixed after empirical testing confirmed the manual is correct.
- Darkness and speed are **global settings** (not per-preset). Default D15 S1. Editable in the Settings modal (gear icon in the View button group).
- **yOffset caveat**: the current rendering pipeline always sizes the bitmap to exactly `labelH` dots tall, so yOffset has no visible effect unless the pipeline changes to produce shorter bitmaps.

### GW bit polarity

GW expects `0 = black, 1 = white`. The frontend packs `1 = black, 0 = white` so the backend XORs every byte with `0xFF` before sending. **Do not change frontend packing — invert in the backend.**

---

## Deployment

Both apps are containerized and deployed to a Synology NAS.

### Architecture

- **frontend** container: nginx:alpine serving the Vite build on port 80, proxying `/api/` → `http://backend:8765/` (the `/api` prefix is stripped). SPA fallback routes unmatched paths to `index.html`.
- **backend** container: python:3.12-slim running uvicorn on 8765 (exposed on the internal compose network only — nginx is the only ingress). `/dev/ttyUSB0` is passed in via compose `devices:` — the printer must be connected before starting the stack.
- **Images**: `ghcr.io/nastronot/sticky-icky-frontend:latest`, `ghcr.io/nastronot/sticky-icky-backend:latest`. Also tagged with `:sha-<commit>` per build.
- **CI**: `.github/workflows/build-and-push.yml` builds and pushes both images on every push to `main` using a matrix over frontend / backend.

### Env vars

| Var | Service | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | frontend (build-time) | `http://localhost:8765` (dev) / `/api` (prod, via `.env.production`) | Base URL for fetch calls; the production build expects nginx to proxy `/api/` to the backend. |
| `CORS_ORIGINS` | backend | `http://localhost:5173,http://localhost:4173,http://localhost:3000` | Comma-separated list of allowed origins. Set to the public domain (e.g. `https://sticky.example.com`) in prod. |
| `SERIAL_PORT` | backend | `/dev/ttyUSB0` | Path to the printer's serial device inside the container; the host device is mapped in via compose `devices:`. |

### Compose files

- `docker-compose.yml` — local testing. Builds both images from source. Frontend on `localhost:3000`.
- `docker-compose.prod.yml` — Synology. Pulls prebuilt GHCR images, reads `CORS_ORIGINS` from a `.env` file (copy `.env.example` → `.env` and set the real domain), passes `/dev/ttyUSB0` into the backend.

### Security

- **Non-root container**: the backend runs as a `printer` user (UID 1000, GID 20 / dialout) — not root. The dialout group provides access to `/dev/ttyUSB0`.
- **Request body limit**: nginx enforces a 1 MB `client_max_body_size`; the Pydantic model caps `bitmap` at 1 MB of base64. An 832×2400 1-bit bitmap is ~62 KB base64 — the 1 MB ceiling is generous but well below memory-exhaustion territory.
- **Rate limiting**: `/print` is limited to 10 requests/minute per IP via slowapi. The `/health` endpoint is not rate-limited.
- **Input validation**: all `/print` fields are bounded by Pydantic (`width` 8–4096, `height` 1–4096, `darkness` 0–15, `speed` 1–4, `copies` 1–99). Width must be a multiple of 8. Bitmap size must match width×height exactly.
- **Serial port validation**: `SERIAL_PORT` is regex-validated to `/dev/tty[A-Za-z0-9_]+` at startup — no path traversal, no arbitrary file writes.
- **CORS**: origin allowlist is read from `CORS_ORIGINS` env var at startup. Requests from unlisted origins are rejected by Starlette's CORS middleware. Never set to `*`.
- **FastAPI introspection disabled**: the app is constructed with `docs_url=None, redoc_url=None, openapi_url=None` so `/docs`, `/redoc`, and `/openapi.json` all 404. The backend exposes only `/print` and `/health`.
- **No-indexing posture**: `frontend/public/robots.txt` is `User-agent: * / Disallow: /`, and `index.html` sets `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`. No sitemap is generated or served. This app is a private tool — search engines should not index any path.
- **HTTP response headers (nginx)**: the frontend container sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()`, and a strict CSP (`default-src 'self'` plus Google Fonts for `style-src`/`font-src`, `data:`/`blob:` for `img-src`, `frame-ancestors 'none'`). The inline theme-bootstrap script in `index.html` is pinned in CSP via its SHA-256 hash — if the script body changes, the hash in `nginx.conf` must be recomputed or the page will fail to load. `style-src` keeps `'unsafe-inline'` because React emits runtime inline `style="…"` attributes and we render no user-supplied HTML.
- **HSTS lives at the edge**, not in this container. The Synology reverse proxy / Let's Encrypt layer terminates HTTPS and is the right place to set `Strict-Transport-Security`. Do not add HSTS via `add_header` in `frontend/nginx.conf`.
- **Dependency pin policy**: both `frontend/package.json` and `backend/requirements.txt` pin every dependency to an exact version (no `^`, `~`, `>=`). Upgrades are deliberate — run `npm audit` / `pip-audit` as part of the upgrade, not at build time. `package-lock.json` is committed. `@types/*` packages are not installed because the frontend is pure JSX.
- **Network layer**: the app assumes Cloudflare Access (or equivalent: VPN, LAN-only) in front. There is no built-in authentication. Do not expose the backend directly to the internet.

---

## Frontend feature surface (current)

- **Layer types**: Big Text (auto-fit to label), free Text (positioned, sized via fontSize), Address (multi-line auto-fit to layer bounds — see below), Image (import + pipeline + drag/scale/rotate/flip + crop), Shape (five kinds: rectangle, ellipse, polygon, star, line — see below). The legacy standalone Fill layer has been folded into `shape/rectangle`; saved designs with `type:"fill"` are promoted to `type:"shape", shapeKind:"rectangle"` in `deserializeLayer` (load-time shim — stored records are rewritten naturally on next save).
- **Address layer** (`type:"address"`, renderer `utils/renderAddress.js`): purpose-built for mailing-label blocks (e.g. Postcrossing), including long Chinese addresses that don't fit a fixed-field template. Single multiline text field hard-capped at 7 lines — Enter is blocked on the 7th line and extras are stripped on paste. The renderer binary-searches the largest font size that fits the layer's bounding box (widest line ≤ `width`, block height ≤ `height`) and multiplies by `sizeScale` (0.25..1, default 1 = auto-fit max). Each line is drawn left-aligned within a block whose width equals the widest line; the block is centered horizontally and vertically in the layer bounds. Auto-fit recomputes on every text/font/bold/italic/bounds change. The layer is bbox-interactable (drag, 8 resize handles, rotation handle) and participates in fillPattern / invert / XOR / dithering like every other layer. Font list is the shared set used by Text / Big Text. The `+ Address` button in the Add Layer panel sits directly below `+ Image`, above the shape icon row.
  - **Postcrossing ID**: optional single-line field (`postcrossingId`) in the editor, rendered directly below the address textarea. When non-empty, the renderer appends `\n\n<id>` to the address — one blank separator line plus the ID line — so the combined block is address + blank + ID. The blank separator and the ID line **do count** toward auto-fit and the size slider's ceiling (they're part of the same rendered block), but **do not count** against the 7-line address cap — that cap still applies only to the textarea itself. Left-justification and block-centering (widest-line reference) apply to the full combined block. When the field is empty, rendering is identical to the address alone. Implemented via `buildAddressRenderLines(layer)` in `utils/renderAddress.js`, shared by `renderAddressLayer` and `measureAddressFit` so both see the same line list.
- **Image processing pipeline**: image layers run a fixed-order chain before being composited. Each step is a pure `ImageData → ImageData` transform. Order: **upscale → threshold OR dither**. The chain lives in `utils/renderImage.js#processImage`:
  - **EPX upscale** (`utils/upscale.js`) — classic 2× pixel-art rule (Eric's Pixel Expansion / Scale2x). `layer.upscaleEnabled` boolean; only 2× is wired in the render path, though `epxUpscale` still accepts a factor argument should 4× ever come back. Comparisons are 32-bit RGBA equality so colour and alpha both have to match to trigger a corner replacement.
  - **Threshold** (`utils/threshold.js`) — `layer.thresholdMode` is `"off" | "auto" | "manual"`. Auto picks the cutoff via Otsu's method; manual uses `layer.thresholdValue` (0–255). **When the mode is not `"off"` the downstream dither step is skipped and the Brightness / Dithering / Amount controls in the Image sidebar are hidden entirely** (not dimmed) — if a control isn't doing work, it isn't shown. `layer.threshold` (the existing brightness cutoff used by dither) is kept separate from `layer.thresholdValue` so the two features don't fight.
  - Sobel edge detection was briefly wired in (v1.8.0) and then removed — any saved design with `edgeEnabled` / `edgeStrength` / `upscaleFactor:4` fields loads cleanly; the render path just ignores them.
- **Processed-image cache** (`utils/renderImage.js`) — keyed by layer id with a signature that captures every pipeline knob (originalImage ref, upscaleEnabled, threshold*, ditherAlgo, ditherAmount, threshold). The processed ImageData + an offscreen `source` canvas are cached so subsequent moves/rotations don't rerun the chain. All cache entries for absent layer ids are pruned after each render.
- **Shape layer**: single `type:"shape"` record with a `shapeKind` discriminator. Rectangle/ellipse/polygon/star share the bounding-box frame (`x`, `y`, `width`, `height`, `rotation`) and use the same selection chrome + resize handles as Image/Text layers. Polygon adds `sides` (3–12, default 6); star adds `points` (3–12, default 5) and `innerRadiusRatio` (0.2–0.8, default 0.4). Line is special: geometry is two endpoints (`x1`/`y1`, `x2`/`y2`) plus `thickness` (1–5 integer, default 2) — no bounding box, no rotation. Both endpoints are draggable handles on canvas; body-drag translates the whole line. All shapes support fillPattern, invert, XOR, visibility, dithering like every other layer. Polygon/star vertices use the bbox as an ellipse (`radiusX = width/2`, `radiusY = height/2`) so stretched bboxes produce squished shapes — not a per-axis radius field but deliberate for consistency with the bbox resize handles.
- **Per-layer**: position (x, y), size (width, height), rotation, flip H/V, fill pattern (Text/BigText/Shape only), invert, XOR composite toggle (off → overwrite), dithering (none / Bayer 4×4 / Bayer 8×8 / Floyd-Steinberg / Atkinson) with amount slider. Rotation slider is -180..+180 centered at 0 (stored values outside that range normalize to it on load via `normalizeRotation`).
- **Fill patterns**: all patterns are 32×32 1-bit tileable bitmaps stored in IndexedDB (`patterns` store). On first run, 12 built-in patterns seed with stable ids `default-solid`, `default-gray-fine`, `default-gray-mid`, `default-gray-coarse`, `default-horizontal-lines`, `default-vertical-lines`, `default-diagonal-lines`, `default-grid`, `default-cross`, `default-brick`, `default-waves`, `default-diamonds`. A `patterns_seeded_v1` flag in the settings store guards against re-seeding defaults the user has explicitly deleted. Users can create, edit, delete, and favourite patterns — defaults and custom are unified (both records live in the `patterns` store, `isDefault: true` on the seeded ones). Pattern picker is a dropdown (swatch + label per entry) with "Create new pattern" and "Manage patterns…" actions at the bottom; created-from-picker patterns auto-select onto the current layer. Deletion from the manage modal scans saved designs for usage and warns with a count; layers referencing a deleted pattern silently fall back to `default-solid` at load via `getPattern`'s fallback. Restore Defaults re-seeds only the missing default-* ids. Pattern bitmaps live in a module-level registry in `patterns.js` kept in sync by `setPatternsRegistry`; canvas pattern cache is invalidated on every registry change.
- **Legacy pattern-id shim**: designs saved before v1.6 reference patterns by short names (`"solid"`, `"waves"`, etc.). `deserializeLayer` maps those ids to the new `default-*` namespace on load. Unknown ids (custom patterns the user deleted) collapse to `default-solid` via `getPattern`'s fallback — no prompts, no errors. This is a load-time shim, not a rewrite of saved records.
- **Canvas interaction**: drag, 8 resize handles (corners + edges), rotation handle, shift inverts the layer's `lockAspect` for the drag, shift snaps rotation to 45°. Pointer math handles viewport rotation.
- **Compositing**: XOR (default) — overlapping black flips to white. Per-layer toggle for solid overwrite mode.
- **Image crop**: per-image crop mode with draggable green crop rectangle, Apply replaces the layer's `originalImage` with the cropped slice.
- **Save / load**: full design state to IndexedDB (`sticky_icky` db, `designs` store). Image layers serialize their `originalImage` as base64 PNG inside the JSON. Gallery shows a 3×3 paginated grid with PNG/JSON export, JSON import, favorites, storage usage readout. Designs reference their label stock by `presetId` (stable across reorder/delete); legacy designs that stored `presetIdx` are migrated on load.
- **Save dialog** (`SaveDialog.jsx`): modal with Name + Demo Safe checkbox. Re-saving a design that was loaded pre-populates both fields. The dialog distinguishes Save from Save As by comparing the submitted name to the loaded design's name (case-insensitive, trimmed):
  - **Save (same name)**: updates the loaded record in place, preserving its id, gallery slot, and favorite flag. Skips the overwrite prompt.
  - **Save As (different name)**: generates a new id and inserts a new record, leaving the original design untouched in the gallery. The newly created record then becomes the active `loadedDesign` so subsequent Saves re-use its id.
  - **Overwrite collision**: a case-insensitive name collision against a *different* existing design (not the one currently loaded) triggers an Overwrite / Cancel confirmation. Overwrite writes into the target's id (inheriting its gallery slot and favorite flag). Cancel returns to the form with the name still populated.
  After any successful save the current design's identity is stamped as the new `loadedDesign`.
- **Design schema** includes `demoSafe: boolean` (default false). Legacy records missing the field are backfilled on first `loadDesigns` and persisted back to IndexedDB — silent one-time migration per record.
- **Demo mode**: hidden, session-only toggle (React state, not persisted). The "v" glyph in the version badge at bottom-left is the toggle — inactive it renders in the normal badge colour; active it glows `#FED00A`. When on, the gallery filters to designs with `demoSafe === true`, and pagination / page-count recalculate from the filtered set. Everything else in the UI is unchanged.
- **Undo / redo**: 20-entry history with the same 350 ms burst coalescing. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y.
- **Keyboard shortcuts**: arrow nudge (1 px / 10 px with shift), Delete to remove layer, Escape to deselect, Ctrl+D to duplicate, Ctrl+V to paste image from clipboard.
- **Drag-and-drop image files** anywhere in the studio.
- **Viewport modes**: Rotate view (90° CSS rotation, pointer math inverted), True size (uses calibrated screen DPI to render at physical inches; calibration via Settings modal).
- **Label-size presets**: stored in IndexedDB (`sticky_icky.presets`). Shape: `{ id, label, w, h, favorite }`. User-managed list (add, delete, favorite). Custom sentinel always at the bottom of the dropdown lets the user specify W/H in inches directly.
- **Global settings**: darkness, speed, xOffset, yOffset, screenDPI, theme, accent — stored in IndexedDB `settings` store. Edited via the Settings modal (gear icon in the View button group). These are global, not per-preset.
- **Settings modal**: tabbed (Print / Display / Appearance). Print tab: darkness slider, speed slider, X/Y offset inputs in dots. Display tab: screen DPI calibration with ruler drag UI. Appearance tab: theme segmented control (Light / Dark / OLED) and accent swatch grid (9 accents).
- **Theme system** (`utils/theme.js` + `components/studio.css`):
  - Three themes: `light`, `dark`, `oled`. Nine accents in swatch order: `zebra-yellow` (default), `hot-magenta`, `cyber-cyan`, `acid-lime`, `blaze-orange`, `riot-purple`, `siren-red`, `royal-blue`, `graphite`. Graphite (`#8A8A8A`) is the deliberately low-saturation neutral option. Stored as `theme` and `accent` keys in the IndexedDB `settings` store — no DB version bump because the store is key-value.
  - Applied by adding `theme-<name>` + `accent-<id>` classes to `<html>`. The selectors use an `html.` prefix (specificity 0,1,1) so they beat the `:root` default block (0,1,0) regardless of source order. Theme class sets surfaces + text tokens; accent class sets `--accent` and `--accent-fg`. `--accent-hover` is derived via `color-mix(in srgb, var(--accent), white 15%)` so it adapts to whichever accent is active.
  - CSS tokens: `--bg-app` (page), `--bg-panel` (sidebars + modals), `--bg-studio` (canvas area — OLED uses `#101010` to give pure-black stickers visible edges against the otherwise `#000000` chrome), `--bg-elevated` (inputs, cards, dropdowns), `--bg-hover`, `--border`, `--border-subtle`, `--text-primary`/`-secondary`/`-muted`, `--accent`, `--accent-hover`, `--accent-fg`, `--accent-glow` (color-mixed), `--favorite-bg` (color-mixed), `--danger` (`#D00B14`, fixed across all themes, never remapped to accent).
  - Siren Red is an accent, `--danger` is the brand red — they're distinct hexes (`#FF1744` vs `#D00B14`). Delete/error UI always uses `--danger`.
  - Flash-of-unthemed-content avoidance: `index.html` has a tiny pre-paint script that adds the default classes (`theme-oled accent-zebra-yellow`) to `<html>` synchronously. `:root` in `studio.css` also defines the default token values directly, so even before the script runs the first paint is correct. App.jsx then loads the persisted choice from IndexedDB and swaps classes if needed.
  - Canvas-drawn chrome (selection handles, crop rect in `CanvasPreview.jsx`) reads `--accent` off the canvas element via `getComputedStyle` at draw time so it tracks the live theme without a prop.
  - To add a new accent: append an entry to `ACCENTS` in `utils/theme.js` with `id`, `name`, `value`, `fg`, and add a matching `.accent-<id> { --accent: …; --accent-fg: …; }` rule in `studio.css`. To add a new theme: append the id to `THEMES` in `utils/theme.js` and an icon lookup in `Settings.jsx`, plus a `.theme-<id> { … }` block with the full token set.
- **Fonts**: Google Fonts collection (Inter, Bebas Neue, Comic Neue, Press Start 2P, VT323, Silkscreen, Bungee, Boldonse, Barriecito, Creepster, Great Vibes, Jacquarda Bastarda 9, Jersey 10, New Rocker, Atkinson, Impact, Arial Black, Courier New, Georgia).

---

## Tech Stack

| Layer         | Choice                                              |
| ------------- | --------------------------------------------------- |
| Frontend      | React 19, Vite 8                                    |
| Canvas        | HTML5 Canvas API (no Konva — that's spec leftovers) |
| Icons         | lucide-react                                        |
| Dithering     | Hand-rolled in `src/utils/dither.js`                |
| Storage       | IndexedDB (`sticky_icky` db v3) — designs, presets, settings (theme/accent/screenDPI/print settings), patterns |
| Backend       | FastAPI + pyserial                                  |
| Printer write | `serial.Serial('/dev/ttyUSB0', 38400, 8N1, rtscts=True)` |

---

## Commands

### Backend

```bash
cd ~/dev/thermal/backend
. venv/bin/activate
uvicorn main:app --reload --port 8765
```

### Frontend

```bash
cd ~/dev/thermal/frontend
npm run dev      # vite dev server on http://localhost:5173
npm run build    # production build → dist/
npm run lint     # eslint
npm run test     # vitest
```

### Docker

```bash
# Local: build + run both containers
docker-compose up --build

# Production (on the Synology NAS): pull prebuilt images from GHCR
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### Manual print test (raw EPL2 over serial)

```bash
# Send a raw EPL2 file directly to the printer
cat test.epl > /dev/ttyUSB0

# Printer status query (UQ command)
sudo bash -c 'cat /dev/ttyUSB0 & echo -e "UQ\r\n" > /dev/ttyUSB0; sleep 2; kill %1'
```

---

## Known Gotchas

- **Serial vs USB transport**: `GW` is non-functional over `/dev/usb/lp0` on V4.29 UPS-branded firmware (it produces blank labels). Serial is the *only* working transport for raster output. The repo no longer contains any USB / `/dev/usb/lp0` code; the LO-command fallback is gone.
- **Baud rate is 38400** — the maximum reliable speed for this printer. 57600+ produces dropped bytes and partial labels. 9600 also works but is unnecessarily slow for full-page bitmaps.
- **GW p1 is in dots, not bytes**: empirically confirmed via test prints at `GW10,0` vs `GW80,0`. The 2007 EPL2 Programming Guide p. 108 is correct: p1 is "Horizontal start position (X) in dots." The backend passes `req.xOffset` directly to GW without conversion. Default xOffset=10 dots, yOffset=0. No multiple-of-8 constraint on xOffset.
- **GW offset history**: the original hardcoded `GW10,0` was 10 *dots* (not 10 bytes as previously assumed). Phase 1 introduced a `// 8` conversion that was wrong — it was dividing dots by 8, turning 80 into 10 and accidentally producing the right result. The conversion has been removed. Existing users' stored xOffset values > 40 are migrated by dividing by 8 (one-time, keyed on `xOffset_v2_migrated` flag in settings).
- **`q` matches the bitmap width**, not `labelW`. The bitmap width is padded to the next multiple of 8 by the frontend; the `q` command must match what `GW` actually streams.
- **Darkness × speed**: high darkness (D13+) at high speed (S2+) overdraws the head on dense rows and causes prints to fail partway through. Default global settings are `D15 S1` which is reliable for the dense raster art this app produces. Editable in the Settings modal.
- **yOffset is inert given current pipeline**: the bitmap is always sized to exactly `labelH` dots, so yOffset has no effect. The field exists for future calibration features that may produce shorter bitmaps.
- **Per-stock settings were reverted**: Phase 1 added per-preset D/S/offset fields. These were removed — print settings are global. On load, any obsolete per-stock fields (`darkness`, `speed`, `xOffset`, `yOffset`, `calibrated`, `calibratedAt`) are silently stripped from presets in IndexedDB.
- **245 KB image buffer** is the hard ceiling for a single print. An 832×2400 1-bit bitmap is ~249 KB and will fail. Test large prints early.
- **`/dev/ttyUSB0` permissions**: the user needs to be in the `dialout` (or `uucp`) group, e.g. `sudo usermod -aG dialout matt`. **The permission resets every time the USB-to-serial adapter is reconnected**, so an `udev` rule or `chmod 666 /dev/ttyUSB0` is the easy workaround for dev.
- **GW data follows immediately**: the binary bitmap follows the `GW` command line right after its `\r\n` with no separator. Any extra bytes between the command and the data desync the printer.
- **Bit polarity is inverted**: GW expects `0=black, 1=white`. The frontend packs `1=black, 0=white`. The backend XORs every byte with `0xFF` before sending. Don't move that inversion to the frontend — the rest of the canvas/composite pipeline assumes 1=black.
- **CUPS raw queue** (`ZebraLP2844`) exists if `lpstat` is run, but the backend bypasses CUPS entirely and writes directly to the serial device.
- **Dithering must be applied before encoding** — the printer has no grayscale capability whatsoever.
- **IndexedDB v1→v2 migration**: on first load after the v2 upgrade, presets migrate from `localStorage:thermal_label_presets_v2` and screen DPI from `localStorage:thermal_screen_dpi` into IndexedDB stores (`presets` and `settings`). The localStorage keys are deleted after successful migration. If migration fails, the app seeds fresh defaults.
- **presetIdx→presetId migration**: saved designs created before v2 store `presetIdx` (an index). On load, `deserializeDesign` resolves the index to a stable `presetId` using the current dropdown list. If the index is out of range (presets were deleted/reordered), the design falls back to the Custom preset with its stored `customW`/`customH`/`labelW`/`labelH` so it still renders at the right size.

### Frontend rendering quirks

- **imageSmoothingEnabled must be false on all offscreen contexts**: canvas 2D contexts default to `imageSmoothingEnabled = true`. When 1-bit pattern tiles are drawn via `ctx.createPattern()`, smoothing anti-aliases pattern pixels at sub-pixel positions (caused by fractional `translate` values). The XOR compositor discards pixels with `R >= 128`, so anti-aliased pattern pixels lighter than 50% gray become invisible — producing position-dependent pattern dropout. Every render function (renderFillLayer, renderTextLayer, renderBigText drawText) must set `ctx.imageSmoothingEnabled = false` before drawing. The preview canvas also has CSS `image-rendering: pixelated` for crisp zoom.
- **Canvas font rendering**: always `await document.fonts.load(fontSpec)` before measuring or drawing. Skipping this causes `measureText` to return stale metrics for the previous font, producing a mis-sized render that corrects itself one frame later.
- **Canvas display scale**: compute `displayScale` synchronously via `getBoundingClientRect()` in the same effect that sets `canvas.width/height` — relying solely on `ResizeObserver` introduces a one-frame lag when label size changes. Use `Math.min(availW / labelW, availH / labelH)` to fit both axes. Guard: if the rect is zero (layout not yet run on first mount), skip the synchronous set and let `ResizeObserver` handle the first paint. Initialize `displayScale` to `0` so the canvas is invisible for one frame on first mount instead of flashing at full 832 px width.
- **Canvas text height**: use `textBaseline = 'alphabetic'` with `actualBoundingBoxAscent` / `actualBoundingBoxDescent` from `ctx.measureText()`. The `size * 1.15` heuristic underestimates heavy fonts like Arial Black.
- **Justify alignment** in Big Text: all lines (including the last) are fully justified — per-line letter spacing is `(maxW - naturalW) / (charCount - 1)`. Single-character lines fall back to left-aligned.
- **Text style toggles** (All Caps, Small Caps, Italic) are non-destructive — the textarea value is never modified. Display text is derived: `(allCaps || smallCaps) → text.toUpperCase()`. All Caps and Small Caps are mutually exclusive; Italic is independent. Small Caps renders originally-lowercase characters at 70% of the fitted size — the original text is passed alongside the display text so `measureLine`/`drawLine` can check per-character case via `scInfo.origLine`.
- **Pointer interaction in rotated viewport**: when `viewportRotation === 90`, the inverse-rotation is `(canvasX, canvasY) = (sy, labelH - sx)` — applied once at the `screenToCanvas` boundary, so all downstream interactions (move, resize, rotate, hit testing) work in canvas space without any further branching.
- **Refs mirrored from props/state**: long-lived event handlers (keydown, pointer) are bound once and read fresh values from refs. The ref assignments live inside a `useEffect` so React's "no refs during render" rule isn't violated.
