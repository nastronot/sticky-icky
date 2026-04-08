import { useRef, useEffect, useState, useCallback } from 'react';
import { encodePrintPayload } from '../utils/epl2.js';
import { PAD, applyFont, drawLine, measureLine, fitLines } from '../utils/textFitting.js';
import { applyDither } from '../utils/dither.js';
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

// ── Layout helpers ────────────────────────────────────────────────────────────

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

const DITHER_ALGOS = [
  { id: 'none',     label: 'None' },
  { id: 'bayer4',   label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',   label: 'Ordered (Bayer 8×8)' },
  { id: 'floyd',    label: 'Floyd-Steinberg' },
  { id: 'atkinson', label: 'Atkinson' },
];

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
