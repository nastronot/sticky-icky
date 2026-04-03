# Thermal Sticker Web App — Spec Sheet

## Overview

A browser-based design tool for composing and printing sticker art to a Zebra LP2844 thermal printer. Output is rasterized and sent as EPL2 `LO` (line draw) commands to the printer via USB (`/dev/usb/lp0`) through a local backend proxy.

**Confirmed hardware specs (via `UQ` status query):**

- Firmware: EPL2 only (V4.29) — no ZPL support
- Print width: 832 dots (4.09" @ 203 DPI)
- Image buffer: 245K
- Max label length: ~1218 dots (~6") at current settings; up to ~2400 dots (~11.8") with buffer

---

## Print Sizes

User selects a label size before designing. Canvas updates to match aspect ratio and pixel dimensions (203 DPI default for LP2844).

**Preset sizes (inches → pixels @ 203 DPI):**

| Label Size  | Pixels (W × H)      |
| ----------- | ------------------- |
| 2.25 × 1.25 | 457 × 254           |
| 2.25 × 2.00 | 457 × 406           |
| 4.00 × 2.00 | 832 × 406           |
| 4.00 × 3.00 | 832 × 609           |
| Custom      | User-defined inches |

Canvas preview scales to fit the viewport while preserving physical proportions.

---

## Mode 1 — Big Text

A single-purpose mode for maximum-size text output.

### Behavior

- User types text into an input field
- App calculates optimal font size, line breaks, and layout to fill the canvas as completely as possible
- Fitting algorithm tries multiple strategies:
    - Single line, scaled to width
    - Multi-line with word wrap, scaled to fill height
    - Character-level kerning adjustments if needed
- Result: text is as large as physically printable given the label dimensions

### Controls

- Text input field
- Font selector (limited to monospace/bold/display fonts suitable for thermal output)
- Horizontal / vertical alignment toggle
- Letter spacing adjustment (optional fine-tune)
- Toggle to switch to Text & Image mode (preserves text as a movable object)

### Output

- Canvas renders in black and white only (no dithering needed for pure text)

---

## Mode 2 — Text & Image

A layered canvas editor. Closer to a minimal Photoshop for thermal output.

### Canvas

- Black and white only
- All objects exist on a layer stack (images below, text above by default; reorderable)

### Image Objects

Each imported image is treated as an independent object.

| Feature          | Detail                                                          |
| ---------------- | --------------------------------------------------------------- |
| Import           | PNG, JPG, GIF, WebP                                             |
| Dither on import | Immediate — preview shows what the thermal print will look like |
| Dither algorithm | Selectable: Floyd-Steinberg (default), Atkinson, ordered/Bayer  |
| Scale            | Drag handles or numeric input                                   |
| Rotate           | Free rotation (drag) or fixed steps (90°)                       |
| Flip             | Horizontal / vertical                                           |
| Invert           | Toggle black↔white                                              |
| Move             | Drag on canvas                                                  |
| Multiple images  | Supported; each is independently controllable                   |

### Text Objects

Each text block is an independent movable object.

| Feature   | Detail                                                  |
| --------- | ------------------------------------------------------- |
| Add       | Click "Add Text" → places editable text block on canvas |
| Move      | Drag                                                    |
| Resize    | Scale handle or font size input                         |
| Rotate    | Free rotation                                           |
| Font      | Selector (thermal-appropriate fonts prioritized)        |
| Weight    | Bold / normal                                           |
| Alignment | Left / center / right within bounding box               |
| Invert    | White text on black fill                                |

### Layer Management

- Layer list panel (reorder, hide, delete)
- Selected object highlighted on canvas with handles

---

## Dithering

Critical for image quality on thermal.

- Applied on import (non-destructive — original stored internally)
- Live re-dither if threshold or algorithm changes
- Threshold slider for black/white cutoff before dithering
- Preview is always 1:1 with what will be sent to the printer

---

## Print Pipeline

```
Canvas (HTML5 Canvas / OffscreenCanvas)
  → flatten to 1-bit bitmap (W × H pixels)
  → pack to 1bpp row-major bytes, base64 encode
  → POST JSON { bitmap, width, height, labelW, labelH } to backend
  → backend scans bitmap, emits EPL2 LO commands per black pixel run
  → write to /dev/usb/lp0
```

### Backend (FastAPI / Python)

- Accepts POST `/print` with JSON body containing base64 bitmap + dimensions
- Decodes bitmap, scans rows for contiguous black runs, emits `LO{x},{y},{width},1` per run
- Wraps with EPL2 setup (`N`, `q`, `Q`, `D15`, `S2`) and print trigger (`P1`)
- Writes assembled EPL2 to `/dev/usb/lp0`
- Returns print status + LO command count

---

## Tech Stack (Proposed)

| Layer            | Choice                              | Notes                                 |
| ---------------- | ----------------------------------- | ------------------------------------- |
| Frontend         | React                               | Canvas manipulation, state management |
| Canvas rendering | HTML5 Canvas API + Konva.js         | Object model, transforms, export      |
| Dithering        | `image-q` or custom                 | JS dither library                     |
| EPL2 encoding    | Backend (Python)                    | Bitmap → `LO` line draw commands      |
| Backend          | FastAPI (Python) or Express (Node)  | Single endpoint: POST /print          |
| USB write        | Python `open('/dev/usb/lp0', 'wb')` | Direct device write                   |

---

## Out of Scope (v1)

- Color printing
- Multi-page / roll-spanning prints
- Cloud connectivity
- Driver-based printing (CUPS is bypassed)
- Mobile support
