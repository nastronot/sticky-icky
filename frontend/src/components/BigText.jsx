import { useRef, useEffect, useState, useCallback } from 'react';
import { encodeGW } from '../utils/epl2.js';
import './BigText.css';

const PRESETS = [
  { label: '4.00 × 2.00"', w: 832, h: 406 },
  { label: '4.00 × 3.00"', w: 832, h: 609 },
  { label: '2.25 × 2.00"', w: 457, h: 406 },
  { label: '2.25 × 1.25"', w: 457, h: 254 },
  { label: 'Custom', w: null, h: null },
];

const FONTS = ['Arial Black', 'Impact', 'Courier New', 'Georgia'];

const PAD = 20;

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function measureLine(ctx, text, letterSpacing) {
  if (!text) return 0;
  let width = 0;
  for (const ch of text) {
    width += ctx.measureText(ch).width + letterSpacing;
  }
  return width - letterSpacing; // no trailing spacing
}

function drawLine(ctx, text, x, y, letterSpacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + letterSpacing;
  }
}

function applyFont(ctx, size, font, bold) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "${font}"`;
}

/** Binary-search the largest font size where all lines fit within maxW × maxH. */
function fitLines(ctx, lines, font, bold, letterSpacing, maxW, maxH) {
  let lo = 4;
  let hi = 2000;
  let best = null;

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2);
    applyFont(ctx, size, font, bold);
    ctx.textBaseline = 'alphabetic';

    // Measure true painted height from actualBoundingBox metrics
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
    const maxLineW = Math.max(...lines.map(l => measureLine(ctx, l, letterSpacing)));

    if (maxLineW <= maxW && totalH <= maxH) {
      best = { size, lines, coverage: maxLineW * totalH, totalH, maxLineW, lineH, gap, maxAscent };
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
function fitText(ctx, text, canvasW, canvasH, font, bold, letterSpacing) {
  const maxW = canvasW - PAD * 2;
  const maxH = canvasH - PAD * 2;
  const words = text.trim().split(/\s+/);
  if (!words[0]) return null;

  let best = fitLines(ctx, [text.trim()], font, bold, letterSpacing, maxW, maxH);

  if (words.length > 1) {
    for (let n = 2; n <= words.length; n++) {
      const lines = splitWords(words, n);
      const result = fitLines(ctx, lines, font, bold, letterSpacing, maxW, maxH);
      if (result && (!best || result.coverage > best.coverage)) {
        best = result;
      }
    }
  }

  return best;
}

function renderCanvas(canvas, text, font, bold, hAlign, vAlign, letterSpacing) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);

  if (!text.trim()) return;

  const fit = fitText(ctx, text, W, H, font, bold, letterSpacing);
  if (!fit) return;

  console.log('renderCanvas:', {
    canvasW: W, canvasH: H,
    maxW: W - PAD * 2, maxH: H - PAD * 2,
    fitSize: fit.size, totalH: fit.totalH, maxLineW: fit.maxLineW,
    overflowW: fit.maxLineW > W - PAD * 2, overflowH: fit.totalH > H - PAD * 2,
  });

  applyFont(ctx, fit.size, font, bold);
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'alphabetic';

  let startY;
  if (vAlign === 'top') startY = PAD;
  else if (vAlign === 'bottom') startY = H - PAD - fit.totalH;
  else startY = (H - fit.totalH) / 2;

  for (let i = 0; i < fit.lines.length; i++) {
    const line = fit.lines[i];
    const lineW = measureLine(ctx, line, letterSpacing);
    let startX;
    if (hAlign === 'left') startX = PAD;
    else if (hAlign === 'right') startX = W - PAD - lineW;
    else startX = (W - lineW) / 2;

    // Position baseline: top of block + line offset + ascent
    const y = startY + i * (fit.lineH + fit.gap) + fit.maxAscent;
    drawLine(ctx, line, startX, y, letterSpacing);
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
  const [printStatus, setPrintStatus] = useState(null); // null | 'printing' | 'ok' | {error}

  const preset = PRESETS[presetIdx];
  const labelW = preset.w ?? Math.round(customW * 203);
  const labelH = preset.h ?? Math.round(customH * 203);

  console.log('displayScale:', displayScale);

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
    const fontSpec = `${bold ? 'bold ' : ''}40px "${font}"`;
    document.fonts.load(fontSpec).then(() => {
      if (cancelled) return;
      renderCanvas(canvas, text, font, bold, hAlign, vAlign, letterSpacing);
    });
    return () => { cancelled = true; };
  }, [text, font, bold, hAlign, vAlign, letterSpacing, labelW, labelH]);

  const handlePrint = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPrintStatus('printing');

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gwBytes = encodeGW(imageData.data, canvas.width, canvas.height);

    // Append P1\r\n to trigger print
    const p1 = new TextEncoder().encode('P1\r\n');
    const payload = new Uint8Array(gwBytes.length + p1.length);
    payload.set(gwBytes, 0);
    payload.set(p1, gwBytes.length);

    try {
      const res = await fetch('http://localhost:8765/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: payload,
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
  }, []);

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
          <span>Horizontal</span>
          <div className="btn-group">
            {['left', 'center', 'right'].map(a => (
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
