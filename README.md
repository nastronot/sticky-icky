# Sticky Zebra

Browser-based design tool for printing sticker art on a Zebra LP2844 thermal label printer over serial.

## What it does

A multi-layer canvas editor that flattens its output to a 1-bit bitmap at the printer's native 203 DPI and ships it directly to the LP2844 as an EPL2 GW (Direct Graphic Write) command. Designed for hobbyist sticker / label art on direct-thermal label stock — typed text fills the label edge to edge with proper kerning, imported images are dithered for the 1-bit output, and an XOR composite lets layers overlap to cut holes in each other.

## Features

### Layers and rendering
- **Big Text** layers — auto-fit to the entire label with binary-search font sizing.
- **Free Text** layers — user-controlled font size, position, rotation, flip.
- **Image** layers — drag-and-drop or paste import (PNG/JPG/GIF/WebP), dithering on import (Floyd-Steinberg, Atkinson, ordered Bayer 4×4 / 8×8, threshold-only), interactive crop with a green bounding-box overlay.
- **Solid Fill** layers — black rectangle for white-on-black backgrounds.
- **XOR compositing** between layers — overlapping black flips to white. Per-layer toggle to fall back to plain overwrite.
- **Per-layer dithering, invert, lock-aspect, rotate, flip H/V**.

### Typography
- 18+ Google Fonts plus the system stack (Inter, Bebas Neue, Comic Neue, Press Start 2P, VT323, Silkscreen, Bungee, Boldonse, Barriecito, Creepster, Great Vibes, Jacquarda Bastarda 9, Jersey 10, New Rocker, Atkinson, Impact, Arial Black, Courier New, Georgia).
- All Caps / Small Caps / Italic toggles, four horizontal alignments (left / center / right / justify) plus three vertical alignments for Big Text, letter-spacing slider.

### Editor UX
- Drag, 8 resize handles, rotation arm with 45° snap (shift), shift-to-invert aspect lock, double-click to focus the text input.
- Drag-and-drop image files or paste images from clipboard.
- Keyboard shortcuts: arrow nudge (1 px / 10 px with shift), Delete to remove the selected layer, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z for undo / redo, Ctrl/Cmd+D to duplicate, Escape to deselect.
- Viewport: rotate-view (portrait orientation for tall labels), true-size mode using a calibrated screen DPI.
- Drag-to-reorder layer list, per-layer visibility toggle, duplicate / delete buttons.

### File management
- Save / load designs to IndexedDB with a 3×3 paginated gallery, favorites, search-by-recency, and a storage usage readout.
- Export designs as full-resolution PNG or as raw JSON.
- Import previously-exported JSON files.
- Auto-save with restore-on-load prompt.

### Printing
- Single-click print with copies count, density warnings for high-coverage rows.
- Custom label-size presets (managed in-app, persisted to localStorage).

## Tech stack

- **Frontend**: React 19, Vite 8, lucide-react icons, hand-rolled HTML5 Canvas rendering and dithering. No Konva, no image-q, no canvas frameworks.
- **Backend**: FastAPI + pyserial, single `POST /print` endpoint. ~100 lines.
- **Storage**: IndexedDB for designs and autosave; localStorage for screen DPI calibration and label-size presets.
- **Protocol**: EPL2 over serial (38400 baud, 8N1, RTS/CTS) — `GW` Direct Graphic Write for the bitmap, plus the standard `N` / `q` / `Q` / `D` / `S` / `P` setup commands.

## Hardware requirements

- **Zebra LP2844** thermal label printer (or any other EPL2-only Zebra with the same `GW` quirks). Tested on the V4.29 UPS-branded firmware. ZPL printers will not work without rewriting the backend.
- **USB-to-serial adapter** wired to the LP2844's serial port. The printer's USB port also works as `/dev/usb/lp0` but the `GW` command is broken on that transport for V4.29 — serial is the only working path.
- **Direct-thermal labels** — anything that fits the print head (832 dots / 4.09" wide max). Default preset is 3.00 × 2.00".
- A Linux machine with `/dev/ttyUSB0` (or set `SERIAL_PORT` in `backend/main.py` for other paths).

## Setup

```bash
# 1. Clone
git clone https://github.com/mattwillms/sticky-zebra
cd sticky-zebra

# 2. Frontend
cd frontend
npm install

# 3. Backend
cd ../backend
python -m venv venv
. venv/bin/activate
pip install -r requirements.txt

# 4. Serial port permissions (one-time per reboot — see "Known limitations")
sudo chmod 666 /dev/ttyUSB0
# or persistently:
sudo usermod -aG dialout $USER   # log out / back in for the group to take effect

# 5. Start the backend
cd backend
. venv/bin/activate
uvicorn main:app --reload --port 8765

# 6. Start the frontend (in another terminal)
cd frontend
npm run dev

# 7. Open http://localhost:5173
```

## Docker deployment

Both apps ship as Docker images. The frontend is an nginx-served Vite build that proxies `/api/` to the backend; the backend is a uvicorn container that needs the host's serial device passed in.

### Local

```bash
docker-compose up --build
# frontend: http://localhost:3000  →  backend via /api/
```

### Production (Synology NAS or any Docker host)

Images are built by GitHub Actions and pushed to GHCR as `ghcr.io/mattwillms/sticky-zebra-frontend:latest` and `:sticky-zebra-backend:latest`. On the host:

```bash
# Copy docker-compose.prod.yml and .env.example to the host, then:
cp .env.example .env
# Edit .env and set CORS_ORIGINS to your real domain

docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

Notes:

- `/dev/ttyUSB0` must exist on the host — the USB-to-serial adapter must be plugged in before starting the stack. The backend container maps it straight through via compose `devices:`.
- `CORS_ORIGINS` is read from `.env` next to the compose file. Copy `.env.example` to `.env` and set it to the public origin serving the frontend. It's a comma-separated list; localhost dev origins are the default when unset.
- `SERIAL_PORT` overrides `/dev/ttyUSB0` inside the backend container if the host exposes the printer at a different path.
- The frontend build bakes in `VITE_API_URL=/api` (from `frontend/.env.production`), so nginx must proxy `/api/` to the backend — the included `nginx.conf` already does this.

## Architecture

```
   ┌─────────────── Browser ────────────────┐
   │                                         │
   │  React app                              │
   │  ├─ Layer state (App.jsx)               │
   │  ├─ Per-layer offscreen canvases        │
   │  │     (renderBigText / renderText /    │
   │  │      renderImage / renderFill)       │
   │  ├─ XOR composite → visible canvas      │
   │  └─ encodePrintPayload                  │
   │       1-bit row-major MSB-first packing │
   │       base64 encode                     │
   │                                         │
   └────────────────┬───────────────────────┘
                    │
                    │  POST /print
                    │  { bitmap, width, height,
                    │    labelW, labelH,
                    │    darkness, speed, copies }
                    ▼
   ┌─────────────── FastAPI ────────────────┐
   │                                         │
   │  validate request                       │
   │  base64-decode, XOR every byte 0xFF     │
   │  build EPL2 GW payload:                 │
   │    \r\n N\r\n q.. Q.. D.. S..           │
   │    GW10,0,wbytes,h\r\n                  │
   │    <raw inverted bitmap>                │
   │    P{copies}\r\n                        │
   │  pyserial.write(payload)                │
   │  drain UART                             │
   │                                         │
   └────────────────┬───────────────────────┘
                    │
                    │  /dev/ttyUSB0
                    │  38400 baud, 8N1, RTS/CTS
                    ▼
              Zebra LP2844
```

The frontend renders at the printer's native 203 DPI from the start — no resampling on the backend. The backend's only jobs are validating the JSON envelope, inverting the bit polarity (`GW` wants `0=black`, the frontend ships `1=black`), wrapping the bitmap in EPL2 setup/footer commands, and writing the result to `/dev/ttyUSB0`.

## Known limitations

- **LP2844 V4.29 firmware quirks**: this is a UPS-branded variant with a non-functional `GW` command over USB. The repo contains no USB code — serial is the only supported transport. The earlier `LO` (Line Draw) fallback over USB also exists but is gone from this codebase because it can't handle the bitmap density this app produces.
- **Serial permission resets on reconnect**: every time the USB-to-serial adapter is unplugged and replugged, `/dev/ttyUSB0` comes back at root-only permissions. The persistent fix is the `dialout` group + a relog; the quick fix is `sudo chmod 666 /dev/ttyUSB0`.
- **245 KB image buffer**: an 832 × 2400 1-bit bitmap is right at the printer's hard limit (~249 KB). Test long labels early — the printer silently truncates beyond the buffer.
- **High darkness × high speed = failed prints**: D13+ at S2+ overdraws the print head on dense rows and the print stops mid-label. The shipped frontend hard-codes D15 S1, which is the empirically reliable combination for the dense raster art this app generates.
- **Hardcoded `GW10,0` X offset**: the bitmap is shifted 80 dots right of the head's left edge to line up with the physical label. This is calibrated for the current label stock and mechanical guides. If you change label stock, you may need to re-measure and adjust the offset in `backend/main.py`.
- **No ZPL support**. EPL2 only. Don't try `^GF`, `^XA`, etc.
- **Serial port path** defaults to `/dev/ttyUSB0`. Override with the `SERIAL_PORT` env var (must match `/dev/tty*`).
- **No built-in auth**. The app assumes a trusted network layer in front — Cloudflare Access, a VPN, or LAN-only access. Do not expose the backend directly to the public internet. CORS, rate limiting (10 req/min on `/print`), and request size limits (1 MB) are enforced, but there is no user authentication.

## License

Licensed under the [GNU General Public License v3.0](LICENSE). See the `LICENSE` file at the repo root for the full text.
