import { useEffect, useMemo, useRef } from 'react';
import { Bold } from 'lucide-react';
import PatternPicker from './PatternPicker.jsx';
import {
  ADDRESS_MAX_LINES,
  ADDRESS_MIN_SIZE_SCALE,
  splitAddressLines,
} from '../utils/renderAddress.js';

const FONTS = [
  'Arial Black',
  'Impact',
  'Inter',
  'Barriecito',
  'Bebas Neue',
  'Boldonse',
  'Bungee',
  'Comic Neue',
  'Courier New',
  'Creepster',
  'Georgia',
  'Great Vibes',
  'Jacquarda Bastarda 9',
  'Jersey 10',
  'New Rocker',
  'Press Start 2P',
  'Silkscreen',
  'VT323',
];

const DITHER_ALGOS = [
  { id: 'none',     label: 'None' },
  { id: 'bayer4',   label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',   label: 'Ordered (Bayer 8×8)' },
  { id: 'floyd',    label: 'Floyd-Steinberg' },
  { id: 'atkinson', label: 'Atkinson' },
];

/** Truncate pasted/typed text to the line cap. */
function capLines(text) {
  return splitAddressLines(text).join('\n');
}

export default function AddressControls({ layer, onChange, focusTextNonce }) {
  const set = patch => onChange(patch);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!focusTextNonce) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, [focusTextNonce]);

  const lineCount = useMemo(
    () => splitAddressLines(layer.text).length,
    [layer.text],
  );

  const onTextKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (lineCount < ADDRESS_MAX_LINES) return;
    // Allow replacing a selection that spans a newline (wouldn't add a line).
    const ta = e.currentTarget;
    const hasSelection = ta.selectionStart !== ta.selectionEnd;
    if (hasSelection) {
      const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (selected.includes('\n')) return;
    }
    e.preventDefault();
  };

  const onTextChange = (e) => {
    set({ text: capLines(e.target.value) });
  };

  const onTextPaste = (e) => {
    const pasted = e.clipboardData?.getData('text');
    if (!pasted) return;
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const merged = ta.value.slice(0, start) + pasted + ta.value.slice(end);
    const capped = capLines(merged);
    if (capped === merged && capped.split('\n').length <= ADDRESS_MAX_LINES) {
      // Normal paste would land within the cap — let the browser handle it.
      return;
    }
    e.preventDefault();
    set({ text: capped });
  };

  const sizeScale = layer.sizeScale ?? 1;
  const sizePercent = Math.round(sizeScale * 100);

  return (
    <>
      <label className="control-group">
        <span>Address <em>{lineCount} / {ADDRESS_MAX_LINES}</em></span>
        <textarea
          ref={textareaRef}
          value={layer.text}
          onChange={onTextChange}
          onKeyDown={onTextKeyDown}
          onPaste={onTextPaste}
          placeholder={'Name\nStreet\nCity, Region\nPostal code\nCountry'}
          rows={7}
        />
      </label>

      <label className="control-group">
        <span>Postcrossing ID</span>
        <input
          type="text"
          value={layer.postcrossingId ?? ''}
          onChange={e => set({ postcrossingId: e.target.value })}
          placeholder="Optional — e.g. US-1234567"
        />
      </label>

      <label className="control-group">
        <span>Font</span>
        <select value={layer.font} onChange={e => set({ font: e.target.value })}>
          {FONTS.map(f => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </label>

      <div className="control-group">
        <span>Weight</span>
        <div className="btn-group">
          <button
            className={layer.bold ? 'active' : ''}
            onClick={() => set({ bold: true })}
            title="Bold"
            aria-label="Bold"
          ><Bold size={16} /></button>
          <button
            className={!layer.bold ? 'active' : ''}
            onClick={() => set({ bold: false })}
            title="Regular"
            aria-label="Regular weight"
          >R</button>
        </div>
      </div>

      <label className="control-group">
        <span>Size <em>{sizePercent}%</em></span>
        <input
          type="range"
          min={Math.round(ADDRESS_MIN_SIZE_SCALE * 100)}
          max={100}
          step={1}
          value={sizePercent}
          onChange={e => set({ sizeScale: Number(e.target.value) / 100 })}
        />
      </label>

      <PatternPicker
        value={layer.fillPattern}
        onChange={v => set({ fillPattern: v })}
      />

      <div className="control-group">
        <span>Invert</span>
        <div className="btn-group">
          <button
            className={layer.invert ? 'active' : ''}
            onClick={() => set({ invert: !layer.invert })}
          >{layer.invert ? 'On' : 'Off'}</button>
        </div>
      </div>

      <div className="control-group">
        <span>XOR composite</span>
        <div className="btn-group">
          <button
            className={layer.xor !== false ? 'active' : ''}
            onClick={() => set({ xor: layer.xor === false })}
          >{layer.xor !== false ? 'On' : 'Off'}</button>
        </div>
      </div>

      <label className="control-group">
        <span>Dithering</span>
        <select value={layer.ditherAlgo} onChange={e => set({ ditherAlgo: e.target.value })}>
          {DITHER_ALGOS.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      {layer.ditherAlgo !== 'none' && (
        <label className="control-group">
          <span>Amount <em>{layer.ditherAmount}%</em></span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={layer.ditherAmount}
            onChange={e => set({ ditherAmount: Number(e.target.value) })}
          />
        </label>
      )}
    </>
  );
}
