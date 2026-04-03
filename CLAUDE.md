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
| USB device       | `/dev/usb/lp0`                |
| Firmware         | EPL2 only — V4.29. No ZPL.    |
| Resolution       | 203 DPI                       |
| Print width      | 832 dots (4.09")              |
| Image buffer     | 245K                          |
| Max label length | ~2400 dots (~11.8")           |
| Bitmap command   | `GW` (graphics write, binary) |

**There is no ZPL support. Do not use `^GF`, `^XA`, or any ZPL syntax.**

---

## Print Pipeline

```
Canvas (HTML5 Canvas / OffscreenCanvas)
  → flatten to 1-bit bitmap (W × H pixels)
  → pack to 1bpp row-major bytes
  → prepend EPL2 setup commands (label size, darkness, speed)
  → build EPL2 GW command
  → append P1 print trigger
  → POST to backend → write to /dev/usb/lp0
```

### EPL2 payload format

The full payload sent to the printer:

```
N\r\n                                      — clear image buffer
q{labelW}\r\n                              — label width in dots
Q{labelH},25\r\n                           — label height in dots + 25-dot gap
D15\r\n                                    — max darkness (0–15)
S2\r\n                                     — medium speed (1–4)
GW{x},{y},{width_bytes},{height}\r\n       — graphics write header
{binary bitmap data}                       — 1bpp row-major, MSB first
P1\r\n                                     — print 1 copy
```

### EPL2 GW command format

```
GW{x},{y},{width_bytes},{height}\r\n{binary bitmap data}
```

- `x`, `y`: origin in dots (usually 0,0)
- `width_bytes`: pixel width / 8 (must be integer — pad width to multiple of 8)
- `height`: pixel height in dots
- Binary data: row-major, MSB first, 1=black 0=white

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
| EPL2 encoding | Custom utility — bitmap → `GW` binary |
| Backend       | FastAPI (Python)                      |
| USB write     | `open('/dev/usb/lp0', 'wb')`          |

---

## Known Gotchas

- Width must be padded to a multiple of 8 bits before packing — `GW` width_bytes must be an integer
- 245K image buffer is the hard ceiling for a single print — an 832×2400 1-bit image is ~249KB, right at the limit; test large prints early
- `/dev/usb/lp0` requires write permission — either run backend as root or add user to `lp` group (`sudo usermod -aG lp matt`)
- CUPS raw queue exists (`ZebraLP2844`) but the backend bypasses it entirely — direct device write only
- Dithering must be applied before encoding — the printer has no grayscale capability whatsoever
- EPL2 `GW` writes to the image buffer but does not print — follow with `P1\r\n` to trigger print
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
