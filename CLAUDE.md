# CLAUDE.md

## Project

Browser-based sticker art design tool for the Zebra LP2844 thermal printer. Single repo, two parts:

- `~/dev/thermal/frontend/` — React app (canvas editor, dithering, EPL2 encoding)
- `~/dev/thermal/backend/` — Minimal Python/FastAPI server (single POST /print endpoint, writes to USB)

Spec lives at `~/dev/thermal/spec.md`.

---

## Workflow

- **claude.ai (browser)** = planning, prompt crafting, high-level decisions
- **Claude Code** = implementation only, directed by browser prompts
- Claude Code does not make architectural decisions. Flag ambiguity, don't assume.
- After each completed task or logical unit of work: commit with a descriptive message. Not after every file edit, not one giant commit per session.

---

## On Session Start

1. Read `CLAUDE.md` (this file)
2. Read `spec.md` only if you need broad project context
3. Do not read files speculatively

---

## Hardware

| Property         | Value                         |
| ---------------- | ----------------------------- |
| Printer          | Zebra LP2844                  |
| Serial device    | `/dev/ttyUSB0` @ 38400 8N1 (primary print path) |
| USB device       | `/dev/usb/lp0` (reference only — GW broken on this transport) |
| Firmware         | EPL2 only — V4.29. No ZPL.    |
| Resolution       | 203 DPI                       |
| Print width      | 832 dots (4.09")              |
| Image buffer     | 245K                          |
| Max label length | ~2400 dots (~11.8")           |
| Bitmap command   | `GW` (Direct Graphic Write) over serial |

**There is no ZPL support. Do not use `^GF`, `^XA`, or any ZPL syntax.**

---

## Print Pipeline

```
Canvas (HTML5 Canvas / OffscreenCanvas)
  → flatten to 1-bit bitmap (W × H pixels)
  → pack to 1bpp row-major bytes (1=black, 0=white), base64 encode
  → POST bitmap + dimensions as JSON to backend
  → backend inverts bytes (GW expects 0=black, 1=white)
  → backend builds EPL2 GW payload and writes to /dev/ttyUSB0 via pyserial @ 38400 8N1
```

### EPL2 payload format

The backend assembles and sends this to the printer over serial:

```
\r\n                                       — wake / line sync
N\r\n                                      — clear image buffer
q{labelW}\r\n                              — label width in dots
Q{labelH},21\r\n                           — label height in dots + 21-dot gap
D{darkness}\r\n                            — darkness (0–15, default 12 from frontend)
S{speed}\r\n                               — print speed (1–4, default 1 from frontend)
GW0,0,{width_bytes},{height}\r\n           — Direct Graphic Write at (0,0)
{raw inverted bitmap bytes}                — width_bytes * height bytes, NO separator
P1\r\n                                     — print 1 copy
```

**Why GW over serial?** `GW` (Direct Graphic Write) is non-functional over USB on our V4.29 UPS-branded firmware but works reliably over serial. `LO` (Line Draw) works over USB but explodes in command count for dense raster art and runs into payload size limits. Serial + GW is the primary print path. The binary bitmap data follows the `GW` command line immediately after its `\r\n` with no separator.

**GW bit polarity:** `GW` expects `0 = black, 1 = white`. The frontend packs the bitmap as `1 = black, 0 = white`, so the backend XORs every byte with `0xFF` before sending.

---

## Commands

### Backend

```bash
cd ~/dev/thermal/backend
uvicorn main:app --reload --port 8765

# or via Docker if containerized
docker-compose up -d
```

### Frontend

```bash
cd ~/dev/thermal/frontend
npm run dev
npm run build
```

### Manual print test

```bash
# Send a raw EPL2 file directly
cat test.epl > /dev/usb/lp0

# Printer status query
sudo bash -c 'cat /dev/usb/lp0 & echo -e "UQ\r\n" > /dev/usb/lp0; sleep 2; kill %1'
```

---

## Tech Stack

| Layer         | Choice                                |
| ------------- | ------------------------------------- |
| Frontend      | React                                 |
| Canvas        | HTML5 Canvas API + Konva.js           |
| Dithering     | `image-q` or custom JS                |
| EPL2 encoding | Backend — bitmap → `GW` payload (bytes inverted) |
| Backend       | FastAPI (Python) + pyserial           |
| Printer write | `serial.Serial('/dev/ttyUSB0', 38400, 8N1)` |

---

## Known Gotchas

- Serial baud rate is **38400** — the maximum reliable speed for this printer/firmware. 57600 and above are not supported (the printer drops bytes and prints garbled or partial labels). 9600 also works but is unnecessarily slow for full-page bitmaps.
- High darkness (D13+) combined with high speed (S2+) overdraws the print head on dense rows and causes prints to fail partway through. Default `D12 S1` is reliable for typical artwork; raise darkness only when paper/ribbon needs more energy and lower speed first if dense rows are present. The frontend density warning factors both into its row-pixel threshold.
- `GW` works over **serial** (`/dev/ttyUSB0` @ 38400 8N1) but NOT over USB (`/dev/usb/lp0`) on V4.29 UPS-branded firmware — over USB it produces blank labels. Serial + GW is the primary print path. `LO` is the fallback that works over USB but has density / payload limits and is no longer used by the backend.
- `GW` bit polarity is inverted from the frontend: GW expects `0 = black, 1 = white`. The frontend packs `1 = black, 0 = white`, so the backend XORs every byte with `0xFF` before sending. Do not change frontend packing — invert in the backend.
- The binary bitmap for `GW` follows the `GW` command line immediately after its `\r\n` with no separator. Any extra bytes between the command and the data will desync the printer.
- 245K image buffer is the hard ceiling for a single print — an 832×2400 1-bit image is ~249KB, right at the limit; test large prints early
- `/dev/ttyUSB0` requires write permission — add user to `dialout` (or `uucp`) group, e.g. `sudo usermod -aG dialout matt`. `/dev/usb/lp0` (legacy) requires the `lp` group.
- CUPS raw queue exists (`ZebraLP2844`) but the backend bypasses it entirely — direct serial write only
- Dithering must be applied before encoding — the printer has no grayscale capability whatsoever
- EPL2 `LO` draws lines but does not print — follow with `P1\r\n` to trigger print
- Canvas font rendering: always `await document.fonts.load(fontSpec)` before measuring or drawing — skipping this causes `measureText` to return stale metrics for the previous font, producing a mis-sized render that corrects itself one frame later
- Canvas display scale: compute `displayScale` synchronously via `getBoundingClientRect()` in the same effect that sets `canvas.width/height` — relying solely on `ResizeObserver` introduces a one-frame lag when label size changes because the observer fires after React has already painted the new canvas dimensions. Use `Math.min(availW / labelW, availH / labelH)` (fit both axes) rather than width-only. Guard: if `getBoundingClientRect()` returns zero width or height (layout not yet run on initial mount), skip the synchronous set and let `ResizeObserver` handle the first-paint scale instead. Initialize `displayScale` to `0` (not `1`) — the container is flex-sized independently of the canvas, so the observer fires on first paint with valid dimensions and the canvas is merely invisible (0×0 CSS) for one frame rather than flashing at full 832px width.
- Canvas text sizing and centering: use `textBaseline = 'alphabetic'` with `actualBoundingBoxAscent` / `actualBoundingBoxDescent` from `ctx.measureText()` to get the true painted glyph height — the `size * 1.15` heuristic underestimates heavy fonts like Arial Black. `lineH = maxAscent + maxDescent`, `totalH = lineH * lines.length + gap * (lines.length - 1)`. Position each line's baseline at `startY + i * (lineH + gap) + maxAscent`.
- Justify alignment: all lines (including last) are fully justified — per-line letter spacing = `(maxW - naturalW) / (charCount - 1)`. Single-character lines fall back to left-aligned (can't distribute spacing).
- Text style toggles (All Caps, Small Caps, Italic) are non-destructive — the textarea value is never modified. Display text is derived: `allCaps || smallCaps → text.toUpperCase()`. All Caps and Small Caps are mutually exclusive; Italic is independent and can combine with either. Small caps renders originally-lowercase characters as uppercase glyphs at 70% of the fitted font size — the original text is passed alongside the display text so `measureLine`/`drawLine` can check per-character case via `scInfo.origLine`.

---

## Open Questions

1. Konva.js vs. Fabric.js for canvas object model? Konva
2. Dither default — Floyd-Steinberg or Atkinson for art output? Both available. Floyd-Steinberg default.
3. Backend language confirmed as Python? Yes
4. Font sourcing — embed subset or rely on system fonts? System for now
