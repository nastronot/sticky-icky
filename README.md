# Sticky Zebra

![Sticky Zebra](docs/hero.webp)

Browser-based sticker design tool for the Zebra LP2844 thermal label printer.

Design labels in your browser, hit print, and a sticker comes out. Text, images, layers, dithering — everything renders at the printer's native 203 DPI so what you see is what you get.

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

## Getting the hardware

### The printer

LP2844s are everywhere on eBay for $30-60. Search for "Zebra LP2844" and look for listings that include a power supply. UPS-branded, FedEx-branded, and retail Zebra units all work with this project.

This app speaks EPL2 only. Newer Zebra printers (ZD-series, etc.) that speak ZPL won't work without rewriting the backend.

### Labels

Buy direct-thermal labels — the kind that turn black when you scratch them with a fingernail. Don't buy thermal-transfer labels (the kind that need a ribbon) — they'll produce blank output. The print head is 832 dots (4.09") wide at 203 DPI. The default label size in the app is 3.00" x 2.00", but any size works.

### Serial cable

You need a USB-to-serial adapter connected to the LP2844's DB-9 serial port. Budget $10-15 for an FTDI-based adapter. **Don't use the printer's built-in USB port** — see [Firmware and transport notes](#firmware-and-transport-notes) below for why.

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

## Security

There is no built-in authentication. The app assumes a trusted network layer in front — Cloudflare Access, a VPN, or LAN-only access. Do not expose the backend directly to the public internet.

The backend enforces CORS origin checking, rate limiting (10 requests/minute on `/print`), a 1 MB request size limit, and input validation on all fields.

## License

Licensed under the GNU General Public License v3.0.

---

# Firmware and transport notes

This section exists for the next person who buys an LP2844 off eBay and spends a week wondering why their printer ignores them. None of it is required to use Sticky Zebra — it works out of the box with the serial cable. Read on if things aren't working, or if you're curious why this project took the shape it did.

## The short version

This project was developed and verified against an LP2844 running firmware **`UKQ1935HLU V4.29`**, printing via a USB-to-serial adapter to the printer's DB-9 port at 38400 baud, 8N1, with RTS/CTS hardware flow control. If your printer matches that configuration, everything should just work.

If you try updating your firmware to "fix" anything, it may stop working. Don't update unless you have a specific reason to.

## Why serial and not USB

The EPL2 `GW` (Direct Graphic Write) command — the one this project uses to send bitmaps to the printer — is quietly broken over USB on certain firmware versions, including the V4.29 this project runs on. The printer accepts the `GW` payload, reports no error, and produces a blank label. Every time.

What was tried before landing on serial:

- **CUPS raw queue** — works, but adds pointless indirection for raw EPL2 output
- **Direct USB with `GW`** — silently produces blank labels on V4.29
- **Direct USB with `LO` (Line Draw)** — works for sparse content, overwhelms the printer's command buffer on dense raster data
- **Serial with `GW`** — works reliably on the first try

Same `GW` command, different transport. Whatever is broken in the USB path is fine on serial. The serial path has also proven portable across every LP2844 variant it's been tested on, regardless of firmware branding, so that's where this project lives.

## LP2844 firmware variants

LP2844s come in two broad flavors: stock retail Zebra and carrier/VAR rebrands (UPS, FedEx, and others). The rebrands ship with modified firmware, and the rebranded firmware **silently refuses stock Zebra firmware updates** — the Z-Downloader tool reports success, the printer acknowledges the bytes, and then the bytes are discarded without being written to flash. The printer keeps running the old firmware with no error shown.

### Checking what you have

On many rebranded units the feed-button shortcut for printing a configuration label is disabled. The reliable way is to send an EPL2 `U` command directly:

```bash
echo -e "U\r\n" > /dev/ttyUSB0
```

The printer prints a configuration label with the firmware version on the first line. Common prefixes:

- `UKQ1935 Vx.xx` — stock retail Zebra firmware
- `UKQ1935 UPS Vx.xx` — UPS-branded
- `UKQ1935 FDX Vx.xx` — FedEx-branded
- `UKQ1935HLU Vx.xx` and other three-letter codes — other carrier/VAR rebrands

If your first line shows anything other than `UKQ1935 Vx.xx`, you have a branded variant and stock updates will fail silently.

### Updating (if you must)

Retail units (`UKQ1935 Vx.xx`) can usually be updated to V4.70.1A via Zebra's Z-Downloader, which in principle restores full `GW`-over-USB support and makes this project's serial workaround unnecessary.

Rebranded units require [DCHHV/patch2844](https://github.com/DCHHV/patch2844), a tool produced from [2019 DEF CON Hardware Hacking Village research](https://dchhv.org/project/2019/01/27/ups2844convert.html) that reverse-engineered the firmware format and figured out how to construct update files the rebranded firmware will accept. The process requires dumping both flash ICs in-circuit with an SPI programmer to get the printer's starting blobs. It's a project.

**Why this wasn't done:** the serial path works, it works on every LP2844 regardless of branding, there's no risk of bricking the printer mid-flash, and the current architecture doesn't benefit meaningfully from switching transports. Updating is optional, low-value, and non-trivial in the rebranded case.

**Why updating might break Sticky Zebra for you:** if you update your firmware and the new version handles EPL2 commands differently — different offsets, different buffer behavior, different `GW` semantics — the printed output may shift, truncate, or fail in new ways. The hard-coded bitmap offset in `backend/main.py` (`GW10,0`), the 245 KB image buffer limit, and the 38400 baud setting are all calibrated to the specific combination of firmware and hardware this project was built against. YMMV after an update.

## Troubleshooting

**Blank labels / nothing prints.** Make sure you're using the serial port, not USB. The LP2844's `GW` command doesn't work over USB on affected firmware. Confirm your firmware version as described above.

**"Permission denied" on `/dev/ttyUSB0`.** Run `sudo chmod 666 /dev/ttyUSB0` on the host, or add your user to the `dialout` group. This resets every time you unplug the adapter. A udev rule can make it persistent.

**Print cuts off partway through.** You're probably hitting the printer's 245 KB image buffer limit. Try a shorter label or less dense content.

**Label alignment is off.** The bitmap is offset 80 dots from the left edge of the print head to line up with standard label stock. If your labels are different, adjust the `GW10,0` offset in `backend/main.py`.

**High-darkness, high-speed prints fail partway through.** The LP2844 print head can't sustain D13+ darkness at S2+ speed on dense raster content — it overdraws and stalls. The shipped frontend hard-codes D15 S1, which is the empirically reliable combination for the dense art this app produces. If you change these, expect some experimentation.

**Firmware update won't take.** If you have a carrier-branded unit, stock Zebra firmware updates will be silently discarded. See [LP2844 firmware variants](#lp2844-firmware-variants).

**Feed button doesn't print a configuration label.** This is normal on many rebranded units. Use the EPL2 `U` command shown above instead.
