# CLAUDE.md

## Project

Sticky Zebra — browser-based design tool for the Zebra LP2844 thermal printer. Single repo, two parts:

- `~/dev/thermal/frontend/` — React + Vite app. Multi-layer canvas editor (Big Text, free Text, Image, Solid Fill), per-layer dithering and invert, XOR compositing, save/load gallery backed by IndexedDB.
- `~/dev/thermal/backend/` — Minimal FastAPI server. Single `POST /print` endpoint that converts a base64 1bpp bitmap into an EPL2 GW payload and writes it to the printer over serial.

`spec.md` exists at the repo root but is the original v1 brief and is now mostly outdated. Use this file as the source of truth for current state.

---

## Workflow

- **claude.ai (browser)** = planning, prompt crafting, high-level decisions
- **Claude Code** = implementation only, directed by browser prompts
- Claude Code does not make architectural decisions. Flag ambiguity, don't assume.
- After each completed task or logical unit of work: commit with a descriptive message. Not after every file edit, not one giant commit per session.

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
  → POST /print  { bitmap, width, height, labelW, labelH, darkness, speed, copies }
  → backend XORs every byte 0xFF (GW expects 0=black, 1=white)
  → backend builds EPL2 GW payload and writes to /dev/ttyUSB0 via pyserial @ 38400 8N1, RTS/CTS
```

### EPL2 payload format

The backend assembles and sends this to the printer over serial:

```
\r\n                                       — wake / line sync
N\r\n                                      — clear image buffer
q{width}\r\n                               — label width in dots (= padded bitmap width)
Q{labelH},21\r\n                           — label height in dots + 21-dot inter-label gap
D{darkness}\r\n                            — print darkness (0–15)
S{speed}\r\n                               — print speed (1–4)
GW10,0,{width_bytes},{height}\r\n          — Direct Graphic Write at (10, 0)
{raw inverted bitmap bytes}                — width_bytes × height bytes, NO separator
P{copies}\r\n                              — print N copies
```

Notes:
- The `q` command receives the *padded* bitmap width, not the user-facing label width — the printer expects q to match the byte count GW will stream.
- `GW10,0` shifts the bitmap 10 bytes (= 80 dots) to the right of the print head's left edge so it lines up with the physical label. This is empirically calibrated for the current label stock + guides; if the stock changes, re-measure (print a long horizontal rule, see how many dots are missing, adjust the X offset).
- Frontend hard-codes `darkness: 15`, `speed: 1` and exposes a copies number input; the per-print sliders that used to live in the sidebar are gone.

### GW bit polarity

GW expects `0 = black, 1 = white`. The frontend packs `1 = black, 0 = white` so the backend XORs every byte with `0xFF` before sending. **Do not change frontend packing — invert in the backend.**

---

## Deployment

Both apps are containerized and deployed to a Synology NAS.

### Architecture

- **frontend** container: nginx:alpine serving the Vite build on port 80, proxying `/api/` → `http://backend:8765/` (the `/api` prefix is stripped). SPA fallback routes unmatched paths to `index.html`.
- **backend** container: python:3.12-slim running uvicorn on 8765 (exposed on the internal compose network only — nginx is the only ingress). `/dev/ttyUSB0` is passed in via compose `devices:` — the printer must be connected before starting the stack.
- **Images**: `ghcr.io/mattwillms/sticky-zebra-frontend:latest`, `ghcr.io/mattwillms/sticky-zebra-backend:latest`. Also tagged with `:sha-<commit>` per build.
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
- **CORS**: origin allowlist is read from `CORS_ORIGINS` env var at startup. Requests from unlisted origins are rejected by Starlette's CORS middleware.
- **Network layer**: the app assumes Cloudflare Access (or equivalent: VPN, LAN-only) in front. There is no built-in authentication. Do not expose the backend directly to the internet.

---

## Frontend feature surface (current)

- **Layer types**: Big Text (auto-fit to label), free Text (positioned, sized via fontSize), Image (import + dither + drag/scale/rotate/flip + crop), Fill (solid black rectangle).
- **Per-layer**: position (x, y), size (width, height), rotation, flip H/V, invert, XOR composite toggle (off → overwrite), dithering (none / Bayer 4×4 / Bayer 8×8 / Floyd-Steinberg / Atkinson) with amount slider.
- **Canvas interaction**: drag, 8 resize handles (corners + edges), rotation handle, shift inverts the layer's `lockAspect` for the drag, shift snaps rotation to 45°. Pointer math handles viewport rotation.
- **Compositing**: XOR (default) — overlapping black flips to white. Per-layer toggle for solid overwrite mode.
- **Image crop**: per-image crop mode with draggable green crop rectangle, Apply replaces the layer's `originalImage` with the cropped slice.
- **Save / load**: full design state to IndexedDB (`sticky_zebra` db, `designs` + `autosave` stores). Image layers serialize their `originalImage` as base64 PNG inside the JSON. Gallery shows a 3×3 paginated grid with PNG/JSON export, JSON import, favorites, storage usage readout.
- **Autosave**: 350 ms-debounced burst-coalesced snapshot to the `autosave` store on every layer mutation; mount-time prompt to restore if a snapshot exists.
- **Undo / redo**: 20-entry history with the same 350 ms burst coalescing. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y.
- **Keyboard shortcuts**: arrow nudge (1 px / 10 px with shift), Delete to remove layer, Escape to deselect, Ctrl+D to duplicate, Ctrl+V to paste image from clipboard.
- **Drag-and-drop image files** anywhere in the studio.
- **Viewport modes**: Rotate view (90° CSS rotation, pointer math inverted), True size (uses calibrated screen DPI to render at physical inches; one-time ruler-based calibration modal stored in localStorage).
- **Label-size presets**: stored in localStorage at `thermal_label_presets_v2`. User-managed list (add, delete, favorite). Custom sentinel always at the bottom of the dropdown lets the user specify W/H in inches directly.
- **Fonts**: Google Fonts collection (Inter, Bebas Neue, Comic Neue, Press Start 2P, VT323, Silkscreen, Bungee, Boldonse, Barriecito, Creepster, Great Vibes, Jacquarda Bastarda 9, Jersey 10, New Rocker, Atkinson, Impact, Arial Black, Courier New, Georgia).

---

## Tech Stack

| Layer         | Choice                                              |
| ------------- | --------------------------------------------------- |
| Frontend      | React 19, Vite 8                                    |
| Canvas        | HTML5 Canvas API (no Konva — that's spec leftovers) |
| Icons         | lucide-react                                        |
| Dithering     | Hand-rolled in `src/utils/dither.js`                |
| Storage       | IndexedDB (`sticky_zebra` db) + localStorage for calibration / presets / DPI |
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
- **`GW10,0` offset**: the GW command's X offset (10 bytes = 80 dots) is empirically calibrated for the current label stock + guides. If you change label width or mechanical guides, re-measure.
- **`q` matches the bitmap width**, not `labelW`. The bitmap width is padded to the next multiple of 8 by the frontend; the `q` command must match what `GW` actually streams.
- **Darkness × speed**: high darkness (D13+) at high speed (S2+) overdraws the head on dense rows and causes prints to fail partway through. The shipped frontend hard-codes `D15 S1` which is reliable for the dense raster art this app produces.
- **245 KB image buffer** is the hard ceiling for a single print. An 832×2400 1-bit bitmap is ~249 KB and will fail. Test large prints early.
- **`/dev/ttyUSB0` permissions**: the user needs to be in the `dialout` (or `uucp`) group, e.g. `sudo usermod -aG dialout matt`. **The permission resets every time the USB-to-serial adapter is reconnected**, so an `udev` rule or `chmod 666 /dev/ttyUSB0` is the easy workaround for dev.
- **GW data follows immediately**: the binary bitmap follows the `GW` command line right after its `\r\n` with no separator. Any extra bytes between the command and the data desync the printer.
- **Bit polarity is inverted**: GW expects `0=black, 1=white`. The frontend packs `1=black, 0=white`. The backend XORs every byte with `0xFF` before sending. Don't move that inversion to the frontend — the rest of the canvas/composite pipeline assumes 1=black.
- **CUPS raw queue** (`ZebraLP2844`) exists if `lpstat` is run, but the backend bypasses CUPS entirely and writes directly to the serial device.
- **Dithering must be applied before encoding** — the printer has no grayscale capability whatsoever.

### Frontend rendering quirks

- **Canvas font rendering**: always `await document.fonts.load(fontSpec)` before measuring or drawing. Skipping this causes `measureText` to return stale metrics for the previous font, producing a mis-sized render that corrects itself one frame later.
- **Canvas display scale**: compute `displayScale` synchronously via `getBoundingClientRect()` in the same effect that sets `canvas.width/height` — relying solely on `ResizeObserver` introduces a one-frame lag when label size changes. Use `Math.min(availW / labelW, availH / labelH)` to fit both axes. Guard: if the rect is zero (layout not yet run on first mount), skip the synchronous set and let `ResizeObserver` handle the first paint. Initialize `displayScale` to `0` so the canvas is invisible for one frame on first mount instead of flashing at full 832 px width.
- **Canvas text height**: use `textBaseline = 'alphabetic'` with `actualBoundingBoxAscent` / `actualBoundingBoxDescent` from `ctx.measureText()`. The `size * 1.15` heuristic underestimates heavy fonts like Arial Black.
- **Justify alignment** in Big Text: all lines (including the last) are fully justified — per-line letter spacing is `(maxW - naturalW) / (charCount - 1)`. Single-character lines fall back to left-aligned.
- **Text style toggles** (All Caps, Small Caps, Italic) are non-destructive — the textarea value is never modified. Display text is derived: `(allCaps || smallCaps) → text.toUpperCase()`. All Caps and Small Caps are mutually exclusive; Italic is independent. Small Caps renders originally-lowercase characters at 70% of the fitted size — the original text is passed alongside the display text so `measureLine`/`drawLine` can check per-character case via `scInfo.origLine`.
- **Pointer interaction in rotated viewport**: when `viewportRotation === 90`, the inverse-rotation is `(canvasX, canvasY) = (sy, labelH - sx)` — applied once at the `screenToCanvas` boundary, so all downstream interactions (move, resize, rotate, hit testing) work in canvas space without any further branching.
- **Refs mirrored from props/state**: long-lived event handlers (keydown, pointer) are bound once and read fresh values from refs. The ref assignments live inside a `useEffect` so React's "no refs during render" rule isn't violated.
