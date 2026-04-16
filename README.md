# Sticky Zebra

Browser-based sticker design tool for the Zebra LP2844 thermal label printer.

Design labels in your browser, hit print, and a sticker comes out. Text, images, layers, dithering — everything renders at the printer's native 203 DPI so what you see is what you get.

## Why this exists

The Zebra LP2844 is a solid 203 DPI direct thermal label printer. Certain firmware versions, including V4.29 on the unit this was developed against, have a quietly broken `GW` (Direct Graphic Write) command over USB — payloads are accepted without error but produce blank labels.

Sticky Zebra is the result of working around that.

The project started as a browser-based sticker design tool — multi-layer canvas editing, dithering, XOR compositing, typography — targeting the printer's native 832-dot print width. Getting pixels to the printer required working through the transport problem:

- **CUPS raw queue** works but adds pointless indirection for raw EPL2 output.
- **Direct USB with `GW`** silently produces blank labels on V4.29.
- **Direct USB with `LO` (Line Draw)** works for sparse content but can't handle dense raster data without overwhelming the command buffer.
- **Serial with `GW`** works reliably. Same command, different transport.

The current architecture writes EPL2 over a USB-to-serial adapter to the printer's DB-9 port at 38400 baud. The frontend renders at native printer resolution; the backend is a thin FastAPI wrapper that packages the bitmap into an EPL2 `GW` payload and writes it to `/dev/ttyUSB0`.

## About the LP2844

### Buying one

LP2844s are everywhere on eBay for $30-60. Search for "Zebra LP2844" and look for listings that include a power supply. UPS-branded, FedEx-branded, and retail Zebra units all work with this project. Budget an extra $10-15 for a USB-to-serial adapter (FTDI-based recommended) if the listing doesn't include a serial cable.

This app speaks **EPL2 only**. Newer Zebra printers (ZD-series, etc.) that speak ZPL won't work without rewriting the backend.

### Labels

Buy **direct-thermal** labels — the kind that turn black when you scratch them with a fingernail. The print head is 832 dots (4.09") wide at 203 DPI. The default label size in the app is 3.00" x 2.00" but you can configure any size. Don't buy thermal-transfer labels (the kind that need a ribbon) — they'll produce blank output.

### Serial connection

You need a **USB-to-serial adapter** connected to the LP2844's DB-9 serial port. Don't use the printer's built-in USB port — the `GW` bitmap command is broken over USB on affected firmware versions. The adapter shows up as `/dev/ttyUSB0` on Linux.

### Checking your firmware version

On many units (especially branded/rebranded firmware), the feed-button shortcut for printing a configuration label is disabled. The reliable way is to send an EPL2 `U` command directly:

```bash
echo -e "U\r\n" > /dev/ttyUSB0
```

The printer will print a configuration label with the firmware version on the first line. Common prefixes:

- `UKQ1935 Vx.xx` — stock retail Zebra firmware
- `UKQ1935 UPS Vx.xx` — UPS-branded
- `UKQ1935 FDX Vx.xx` — FedEx-branded
- `UKQ1935HLU Vx.xx` and other three-letter codes — other carrier or VAR rebrands

If your first line contains anything other than `UKQ1935 Vx.xx`, you have a branded variant. Stock Zebra firmware updates will silently fail on these — the update is accepted and acknowledged, then discarded without writing to flash. The unit this project targets is a `UKQ1935HLU` variant; the specific rebrander is unidentified, but the behavior matches the branded-firmware pattern.

None of this matters for Sticky Zebra. The serial `GW` path works reliably regardless of firmware variant.

### Firmware updates

LP2844 units come in two broad flavors: retail Zebra-branded and carrier-branded (UPS, FedEx, etc.). The carrier units ship with modified firmware that's deliberately locked down for the carrier's shipping software, and Zebra's firmware updater silently refuses to flash stock firmware onto them — the update is accepted, acknowledged, and then discarded. Projects like [DCHHV/patch2844](https://github.com/DCHHV/patch2844) exist to work around this, but the process involves dumping both flash ICs in-circuit and reconstructing a patched update file.

Retail Zebra units can usually be updated to the latest stock firmware (V4.70.1A) via Zebra's Z-Downloader tool, which in principle would fix the `GW`-over-USB issue and make this project's serial workaround unnecessary on those units.

The unit this project targets is a retail Zebra running V4.29. An update to V4.70.1A is plausibly possible and might restore USB functionality. It wasn't attempted. The serial path works, it works the same on any LP2844 regardless of firmware version or carrier branding, and there's no failure mode where a mid-flash interruption bricks the printer. That tradeoff — portability and reliability over a potentially cleaner architecture — is why this project lives on serial and stays there.

## Features

### Layers
- **Big Text** — type something, it auto-sizes to fill the entire label
- **Free Text** — positioned text with manual font size, rotation, flip
- **Image** — import PNG/JPG/GIF/WebP via drag-and-drop, paste from clipboard, or file picker. Crop, rotate, scale, flip.
- **Solid Fill** — black rectangle for white-on-black backgrounds

### Dithering
Photos and grayscale images need to be converted to pure black and white for the thermal printer. The app includes five dithering algorithms (Floyd-Steinberg, Atkinson, Bayer 4x4, Bayer 8x8, and simple threshold) with an adjustable amount slider. Each layer has its own dithering settings.

### Compositing
Layers composite with XOR by default — where two black regions overlap, they flip to white. This lets you cut shapes out of other shapes. You can switch any layer to plain overwrite mode instead.

### Typography
18 fonts: Arial Black, Barriecito, Bebas Neue, Boldonse, Bungee, Comic Neue, Courier New, Creepster, Georgia, Great Vibes, Impact, Inter, Jacquarda Bastarda 9, Jersey 10, New Rocker, Press Start 2P, Silkscreen, VT323.

Text layers support All Caps, Small Caps, Italic, four horizontal alignments (left/center/right/justify), and letter-spacing adjustment. Big Text also has vertical alignment (top/center/bottom).

### Editor
- Drag to move, 8 resize handles, rotation arm (hold Shift for 45-degree snap)
- Hold Shift while resizing to toggle aspect-ratio lock
- Double-click a text layer to focus its text input
- Arrow keys nudge 1px (10px with Shift)
- Delete removes the selected layer
- Ctrl+Z / Ctrl+Shift+Z for undo/redo (20 steps)
- Ctrl+D to duplicate a layer
- Ctrl+V to paste an image from clipboard
- Escape to deselect

### Viewport
- Rotate view 90 degrees for designing tall/narrow labels in landscape orientation
- True-size mode shows the label at its real physical dimensions (requires a one-time screen calibration)

### Saving and exporting
- Save/load designs to your browser's local storage (IndexedDB)
- Gallery with favorites, pagination, and storage usage readout
- Export as PNG or JSON, import from JSON
- Auto-save on every change with restore-on-load prompt

### Printing
- One-click print with configurable copy count
- Custom label-size presets (add, delete, favorite — saved to localStorage)

## Deployment

Images are built automatically by GitHub Actions on every push to `main` and pushed to GHCR. You need any Docker host with a USB port for the serial adapter.

```bash
# Copy docker-compose.prod.yml and .env.example to your server
cp .env.example .env
# Edit .env — set CORS_ORIGINS to your domain (e.g. https://stickers.example.com)

docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

The printer's USB-to-serial adapter must be plugged in before starting — Docker maps `/dev/ttyUSB0` into the backend container.

Images: `ghcr.io/mattwillms/sticky-zebra-frontend:latest` and `ghcr.io/mattwillms/sticky-zebra-backend:latest`.

The frontend (nginx) serves the app on port 3000 and proxies `/api/` requests to the backend. The backend talks to the printer over serial.

### Environment variables

- `CORS_ORIGINS` — comma-separated allowed origins (set in `.env` next to the compose file)
- `SERIAL_PORT` — override the default `/dev/ttyUSB0` if your printer is at a different path

### Local dev

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend (separate terminal)
cd backend && python -m venv venv && . venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8765

# Open http://localhost:5173
```

## Architecture

```
Browser (React + Canvas)
  → renders each layer at 203 DPI
  → XOR composites visible layers
  → packs 1-bit bitmap, base64 encodes
  → POST /print

FastAPI backend
  → validates request
  → inverts bit polarity (GW expects 0=black)
  → wraps in EPL2 commands
  → writes to /dev/ttyUSB0 at 38400 baud
```

The frontend does all the rendering. The backend is ~120 lines — it just validates, inverts the bits, wraps the bitmap in EPL2 framing, and writes it to the serial port.

## Tech stack

- **Frontend**: React 19, Vite 8, HTML5 Canvas (no frameworks), lucide-react icons
- **Backend**: FastAPI, pyserial, slowapi (rate limiting)
- **Storage**: IndexedDB for designs, localStorage for settings
- **Protocol**: EPL2 over serial — 38400 baud, 8N1, RTS/CTS hardware flow control

## Troubleshooting

**Blank labels / nothing prints**: Make sure you're using the serial port, not USB. The LP2844's `GW` command doesn't work over USB on affected firmware. See [Checking your firmware version](#checking-your-firmware-version).

**"Permission denied" on /dev/ttyUSB0**: Run `sudo chmod 666 /dev/ttyUSB0` on the host, or add your user to the `dialout` group. This resets every time you unplug the adapter.

**Print cuts off partway through**: You're probably hitting the printer's 245 KB image buffer limit. Try a shorter label or less dense content.

**Label alignment is off**: The bitmap is offset 80 dots from the left edge of the print head to line up with standard label stock. If your labels are different, adjust the `GW10,0` offset in `backend/main.py`.

**Firmware update won't take**: If you have a carrier-branded unit, stock Zebra firmware updates will be silently discarded. See [Firmware updates](#firmware-updates).

## Security

There is no built-in authentication. The app assumes a trusted network layer in front — Cloudflare Access, a VPN, or LAN-only access. Do not expose the backend directly to the public internet.

The backend enforces CORS origin checking, rate limiting (10 requests/minute on `/print`), a 1 MB request size limit, and input validation on all fields.

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
