import { useRef, useEffect, useState, useCallback } from 'react';
import { encodePrintPayload } from '../utils/epl2.js';
import './BigText.css';

const PRESETS = [
  { label: '3.00 × 2.00"', w: 570, h: 406 },
  { label: '4.00 × 2.00"', w: 832, h: 406 },
  { label: '4.00 × 3.00"', w: 832, h: 609 },
  { label: '2.25 × 2.00"', w: 457, h: 406 },
  { label: '2.25 × 1.25"', w: 457, h: 254 },
  { label: 'Custom', w: null, h: null },
];

const FONTS = ['Arial Black', 'Impact', 'Courier New', 'Georgia'];

const PAD = 20;

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function measureLine(ctx, text, letterSpacing, scInfo) {
  if (!text) return 0;
  const chars = [...text];
  let width = 0;
  if (scInfo) {
    const origChars = [...scInfo.origLine];
    for (let i = 0; i < chars.length; i++) {
      const origCh = origChars[i] ?? chars[i];
      const isLower = origCh !== origCh.toUpperCase();
      applyFont(ctx, isLower ? scInfo.smallSize : scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
      width += ctx.measureText(chars[i]).width + letterSpacing;
    }
    applyFont(ctx, scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
  } else {
    for (const ch of chars) {
      width += ctx.measureText(ch).width + letterSpacing;
    }
  }
  return width - letterSpacing;
}

function drawLine(ctx, text, x, y, letterSpacing, scInfo) {
  const chars = [...text];
  let cx = x;
  if (scInfo) {
    const origChars = [...scInfo.origLine];
    for (let i = 0; i < chars.length; i++) {
      const origCh = origChars[i] ?? chars[i];
      const isLower = origCh !== origCh.toUpperCase();
      applyFont(ctx, isLower ? scInfo.smallSize : scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
      ctx.fillText(chars[i], cx, y);
      cx += ctx.measureText(chars[i]).width + letterSpacing;
    }
    applyFont(ctx, scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
  } else {
    for (const ch of chars) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + letterSpacing;
    }
  }
}

function applyFont(ctx, size, font, bold, italic) {
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${font}"`;
}

/** Binary-search the largest font size where all lines fit within maxW × maxH. */
function fitLines(ctx, lines, font, bold, italic, letterSpacing, maxW, maxH, smallCaps, origLines) {
  let lo = 4;
  let hi = 2000;
  let best = null;

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2);
    applyFont(ctx, size, font, bold, italic);
    ctx.textBaseline = 'alphabetic';

    // Measure true painted height from actualBoundingBox metrics (use full size — capitals set the line height)
    let maxAscent = 0;
    let maxDescent = 0;
    for (const line of lines) {
      const m = ctx.measureText(line || 'M');
      maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
      maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent);
    }
    const lineH = maxAscent + maxDescent;
    const gap = size * 0.15;
    const totalH = lineH * lines.length + gap * (lines.length - 1);

    const smallSize = Math.round(size * 0.7);
    const maxLineW = Math.max(...lines.map((l, i) => {
      const scInfo = smallCaps ? { origLine: origLines[i], fullSize: size, smallSize, font, bold, italic } : null;
      return measureLine(ctx, l, letterSpacing, scInfo);
    }));

    if (maxLineW <= maxW && totalH <= maxH) {
      best = { size, lines, origLines, coverage: maxLineW * totalH, totalH, maxLineW, lineH, gap, maxAscent };
      lo = size + 1;
    } else {
      hi = size - 1;
    }
  }

  return best;
}

/** Evenly distribute words across numLines. */
function splitWords(words, numLines) {
  const result = [];
  const perLine = Math.ceil(words.length / numLines);
  for (let i = 0; i < words.length; i += perLine) {
    result.push(words.slice(i, i + perLine).join(' '));
  }
  return result;
}

/** Find the best font size + layout for the given text. */
function fitText(ctx, displayText, originalText, canvasW, canvasH, font, bold, italic, letterSpacing, smallCaps) {
  const maxW = canvasW - PAD * 2;
  const maxH = canvasH - PAD * 2;
  const words = displayText.trim().split(/\s+/);
  const origWords = originalText.trim().split(/\s+/);
  if (!words[0]) return null;

  let best = fitLines(ctx, [displayText.trim()], font, bold, italic, letterSpacing, maxW, maxH, smallCaps, [originalText.trim()]);

  if (words.length > 1) {
    for (let n = 2; n <= words.length; n++) {
      const lines = splitWords(words, n);
      const oLines = splitWords(origWords, n);
      const result = fitLines(ctx, lines, font, bold, italic, letterSpacing, maxW, maxH, smallCaps, oLines);
      if (result && (!best || result.coverage > best.coverage)) {
        best = result;
      }
    }
  }

  return best;
}

// ── Dithering ─────────────────────────────────────────────────────────────────

const DITHER_ALGOS = [
  { id: 'none',     label: 'None' },
  { id: 'bayer4',   label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',   label: 'Ordered (Bayer 8×8)' },
  { id: 'floyd',    label: 'Floyd-Steinberg' },
  { id: 'atkinson', label: 'Atkinson' },
];

// Standard Bayer ordered-dither matrices, values 0..n²-1.
const BAYER_4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

const BAYER_8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

// Error-diffusion kernels: [dx, dy, weight] from the current pixel.
const FLOYD_KERNEL = [
  [ 1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [ 0, 1, 5 / 16],
  [ 1, 1, 1 / 16],
];

const ATKINSON_KERNEL = [
  [ 1, 0, 1 / 8],
  [ 2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [ 0, 1, 1 / 8],
  [ 1, 1, 1 / 8],
  [ 0, 2, 1 / 8],
];

/** Ordered Bayer dither, in-place. `amount` ∈ [0,1] scales the matrix threshold
 *  so that at 0 no black pixels flip and at 1 every black pixel flips. */
function applyBayerDither(data, width, height, matrix, size, amount) {
  if (amount <= 0) return;
  const denom = size * size;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] >= 128) continue; // only act on currently-black pixels
      const t = (matrix[(y % size) * size + (x % size)] + 0.5) / denom;
      if (t < amount) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
  }
}

/** Error-diffusion dither (Floyd-Steinberg / Atkinson), in-place.
 *
 *  The canvas is rendered as near-binary text, so a "true" error diffusion would
 *  do nothing on solid black. To make `amount` meaningful we lift solid-black
 *  pixels toward mid-gray by `amount`: at 0 they stay 0 (no dither), at 1 they
 *  become 128 (~50% halftone). White pixels are left at 255. */
function applyErrorDiffusion(data, width, height, kernel, amount) {
  if (amount <= 0) return;
  const liftedBlack = amount * 128;
  const buf = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    buf[i] = data[i * 4] < 128 ? liftedBlack : 255;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const newVal = old < 128 ? 0 : 255;
      buf[idx] = newVal;
      const err = old - newVal;
      for (const [dx, dy, w] of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        buf[ny * width + nx] += err * w;
      }
    }
  }
  for (let i = 0; i < width * height; i++) {
    const v = buf[i] < 128 ? 0 : 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
}

/** Dispatch to the chosen algorithm. `amount` is 0..100. */
function applyDither(data, width, height, algo, amount) {
  if (algo === 'none' || amount <= 0) return;
  const a = amount / 100;
  switch (algo) {
    case 'bayer4':   return applyBayerDither(data, width, height, BAYER_4, 4, a);
    case 'bayer8':   return applyBayerDither(data, width, height, BAYER_8, 8, a);
    case 'floyd':    return applyErrorDiffusion(data, width, height, FLOYD_KERNEL, a);
    case 'atkinson': return applyErrorDiffusion(data, width, height, ATKINSON_KERNEL, a);
    default: return;
  }
}

function renderCanvas(canvas, displayText, originalText, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);

  if (!displayText.trim()) return;

  const fit = fitText(ctx, displayText, originalText, W, H, font, bold, italic, letterSpacing, smallCaps);
  if (!fit) return;

  applyFont(ctx, fit.size, font, bold, italic);
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'alphabetic';

  const maxW = W - PAD * 2;
  const smallSize = Math.round(fit.size * 0.7);

  let startY;
  if (vAlign === 'top') startY = PAD;
  else if (vAlign === 'bottom') startY = H - PAD - fit.totalH;
  else startY = (H - fit.totalH) / 2;

  for (let i = 0; i < fit.lines.length; i++) {
    const line = fit.lines[i];
    const origLine = fit.origLines[i];
    const scInfo = smallCaps ? { origLine, fullSize: fit.size, smallSize, font, bold, italic } : null;
    const lineW = measureLine(ctx, line, letterSpacing, scInfo);
    let startX;
    let lineLetterSpacing = letterSpacing;
    let lineScInfo = scInfo;

    if (hAlign === 'justify' && [...line].length > 1) {
      const naturalW = measureLine(ctx, line, 0, scInfo);
      lineLetterSpacing = (maxW - naturalW) / ([...line].length - 1);
      startX = PAD;
    } else if (hAlign === 'justify' || hAlign === 'left') {
      startX = PAD;
    } else if (hAlign === 'right') {
      startX = W - PAD - lineW;
    } else {
      startX = (W - lineW) / 2;
    }

    const y = startY + i * (fit.lineH + fit.gap) + fit.maxAscent;
    drawLine(ctx, line, startX, y, lineLetterSpacing, lineScInfo);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BigText() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [text, setText] = useState('');
  const [font, setFont] = useState('Impact');
  const [bold, setBold] = useState(true);
  const [hAlign, setHAlign] = useState('center');
  const [vAlign, setVAlign] = useState('middle');
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [presetIdx, setPresetIdx] = useState(0);
  const [customW, setCustomW] = useState(4.0);
  const [customH, setCustomH] = useState(2.0);
  const [displayScale, setDisplayScale] = useState(0);
  const [allCaps, setAllCaps] = useState(false);
  const [smallCaps, setSmallCaps] = useState(false);
  const [italic, setItalic] = useState(false);
  const [printStatus, setPrintStatus] = useState(null); // null | 'printing' | 'ok' | {error}
  const [ditherAlgo, setDitherAlgo] = useState('none');
  const [ditherAmount, setDitherAmount] = useState(50); // 0..100 %
  const [darkness, setDarkness] = useState(12); // EPL2 D, 0–15
  const [speed, setSpeed] = useState(1);        // EPL2 S, 1–4

  const preset = PRESETS[presetIdx];
  const labelW = preset.w ?? Math.round(customW * 203);
  const labelH = preset.h ?? Math.round(customH * 203);

  const displayText = (allCaps || smallCaps) ? text.toUpperCase() : text;

  // Handle window/container resize — uses contentRect which excludes padding
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDisplayScale(Math.min(width / labelW, height / labelH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [labelW, labelH]);

  // Re-render canvas on any drawing input change
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = labelW;
    canvas.height = labelH;

    // Compute display scale synchronously so it matches the new label size
    // immediately — getBoundingClientRect() is border-box, subtract 48px (24px padding × 2).
    // Guard: if layout hasn't run yet, rect is zero — skip and let ResizeObserver handle it.
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const availW = Math.max(rect.width - 48, 1);
      const availH = Math.max(rect.height - 48, 1);
      setDisplayScale(Math.min(availW / labelW, availH / labelH));
    }

    // Await font load before measuring/drawing to avoid stale glyph metrics
    let cancelled = false;
    const fontSpec = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}40px "${font}"`;
    document.fonts.load(fontSpec).then(() => {
      if (cancelled) return;
      renderCanvas(canvas, displayText, text, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing);

      // Post-render: optional dithering pass.
      if (ditherAlgo !== 'none' && ditherAmount > 0) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyDither(imageData.data, canvas.width, canvas.height, ditherAlgo, ditherAmount);
        ctx.putImageData(imageData, 0, 0);
      }
    });
    return () => { cancelled = true; };
  }, [displayText, text, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing, labelW, labelH, ditherAlgo, ditherAmount]);

  const handlePrint = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPrintStatus('printing');

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const body = encodePrintPayload(imageData.data, canvas.width, canvas.height, labelW, labelH, darkness, speed);

    try {
      const res = await fetch('http://localhost:8765/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setPrintStatus('ok');
      } else {
        setPrintStatus({ error: json.detail ?? 'Unknown error' });
      }
    } catch (err) {
      setPrintStatus({ error: err.message });
    }
  }, [labelW, labelH, darkness, speed]);

  const handlePresetChange = (e) => {
    setPresetIdx(Number(e.target.value));
    setPrintStatus(null);
  };

  return (
    <div className="bigtext-layout">
      <aside className="bigtext-controls">
        <label className="control-group">
          <span>Text</span>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type something..."
            rows={3}
          />
        </label>

        <label className="control-group">
          <span>Font</span>
          <select value={font} onChange={e => setFont(e.target.value)}>
            {FONTS.map(f => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </select>
        </label>

        <div className="control-group">
          <span>Weight</span>
          <div className="btn-group">
            <button className={bold ? 'active' : ''} onClick={() => setBold(true)}>Bold</button>
            <button className={!bold ? 'active' : ''} onClick={() => setBold(false)}>Regular</button>
          </div>
        </div>

        <div className="control-group">
          <span>Style</span>
          <div className="btn-group">
            <button className={allCaps ? 'active' : ''} onClick={() => { setAllCaps(!allCaps); setSmallCaps(false); }}>All Caps</button>
            <button className={smallCaps ? 'active' : ''} onClick={() => { setSmallCaps(!smallCaps); setAllCaps(false); }}>Small Caps</button>
            <button className={italic ? 'active' : ''} onClick={() => setItalic(!italic)}>Italic</button>
          </div>
        </div>

        <div className="control-group">
          <span>Horizontal</span>
          <div className="btn-group">
            {['left', 'center', 'right', 'justify'].map(a => (
              <button
                key={a}
                className={hAlign === a ? 'active' : ''}
                onClick={() => setHAlign(a)}
              >
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span>Vertical</span>
          <div className="btn-group">
            {['top', 'middle', 'bottom'].map(a => (
              <button
                key={a}
                className={vAlign === a ? 'active' : ''}
                onClick={() => setVAlign(a)}
              >
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <label className="control-group">
          <span>Letter spacing <em>{letterSpacing}px</em></span>
          <input
            type="range"
            min={-2}
            max={20}
            step={0.5}
            value={letterSpacing}
            onChange={e => setLetterSpacing(Number(e.target.value))}
          />
        </label>

        <label className="control-group">
          <span>Label size</span>
          <select value={presetIdx} onChange={handlePresetChange}>
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </select>
        </label>

        {preset.w === null && (
          <div className="control-group custom-size">
            <label>
              <span>W (in)</span>
              <input
                type="number"
                min={0.5}
                max={4.09}
                step={0.01}
                value={customW}
                onChange={e => setCustomW(Number(e.target.value))}
              />
            </label>
            <label>
              <span>H (in)</span>
              <input
                type="number"
                min={0.5}
                max={11.8}
                step={0.01}
                value={customH}
                onChange={e => setCustomH(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        <label className="control-group">
          <span>Darkness <em>{darkness}</em></span>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={darkness}
            onChange={e => setDarkness(Number(e.target.value))}
          />
        </label>

        <label className="control-group">
          <span>Speed <em>{speed}</em></span>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
          />
        </label>

        <label className="control-group">
          <span>Dithering</span>
          <select value={ditherAlgo} onChange={e => setDitherAlgo(e.target.value)}>
            {DITHER_ALGOS.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>

        {ditherAlgo !== 'none' && (
          <label className="control-group">
            <span>Amount <em>{ditherAmount}%</em></span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={ditherAmount}
              onChange={e => setDitherAmount(Number(e.target.value))}
            />
          </label>
        )}

        <button className="print-btn" onClick={handlePrint} disabled={printStatus === 'printing'}>
          {printStatus === 'printing' ? 'Printing…' : 'Print'}
        </button>

        {printStatus === 'ok' && (
          <p className="status ok">Sent to printer.</p>
        )}
        {printStatus && typeof printStatus === 'object' && (
          <p className="status error">Error: {printStatus.error}</p>
        )}
      </aside>

      <div className="bigtext-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          width={labelW}
          height={labelH}
          style={{
            width: labelW * displayScale,
            height: labelH * displayScale,
          }}
        />
      </div>
    </div>
  );
}
