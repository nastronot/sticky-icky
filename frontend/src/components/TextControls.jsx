import { useEffect, useRef } from 'react';
import {
  Bold, Italic,
  AlignLeft, AlignCenter, AlignRight,
  FlipHorizontal2, FlipVertical2,
  CaseUpper, AArrowDown,
} from 'lucide-react';

const FONTS = ['Arial Black', 'Impact', 'Courier New', 'Georgia'];

const H_ALIGN_ICONS = {
  left:   AlignLeft,
  center: AlignCenter,
  right:  AlignRight,
};

const DITHER_ALGOS = [
  { id: 'none',           label: 'None' },
  { id: 'bayer4',         label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',         label: 'Ordered (Bayer 8×8)' },
  { id: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { id: 'atkinson',       label: 'Atkinson' },
];

/** Per-free-text-layer controls. `onChange(patch)` patches the layer in App.
 *  Bounding-box width/height auto-correct from CanvasPreview after the next
 *  render-pass measures the text — they aren't edited from here. */
export default function TextControls({ layer, onChange, focusTextNonce }) {
  const set = patch => onChange(patch);
  const textareaRef = useRef(null);

  // Focus + select the textarea when the parent bumps focusTextNonce
  // (e.g. from a canvas double-click). Skip the initial 0.
  useEffect(() => {
    if (!focusTextNonce) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, [focusTextNonce]);

  return (
    <>
      <label className="control-group">
        <span>Text</span>
        <textarea
          ref={textareaRef}
          value={layer.text}
          onChange={e => set({ text: e.target.value })}
          placeholder="Type something..."
          rows={3}
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
          >Regular</button>
        </div>
      </div>

      <div className="control-group">
        <span>Style</span>
        <div className="btn-group">
          <button
            className={layer.allCaps ? 'active' : ''}
            onClick={() => set({ allCaps: !layer.allCaps, smallCaps: false })}
            title="All caps"
            aria-label="All caps"
          ><CaseUpper size={16} /></button>
          <button
            className={layer.smallCaps ? 'active' : ''}
            onClick={() => set({ smallCaps: !layer.smallCaps, allCaps: false })}
            title="Small caps"
            aria-label="Small caps"
          ><AArrowDown size={16} /></button>
          <button
            className={layer.italic ? 'active' : ''}
            onClick={() => set({ italic: !layer.italic })}
            title="Italic"
            aria-label="Italic"
          ><Italic size={16} /></button>
        </div>
      </div>

      <div className="control-group">
        <span>Horizontal</span>
        <div className="btn-group">
          {['left', 'center', 'right'].map(a => {
            const Icon = H_ALIGN_ICONS[a];
            return (
              <button
                key={a}
                className={(layer.hAlign ?? 'left') === a ? 'active' : ''}
                onClick={() => set({ hAlign: a })}
                title={`Align ${a}`}
                aria-label={`Align ${a}`}
              ><Icon size={16} /></button>
            );
          })}
        </div>
      </div>

      <label className="control-group">
        <span>Letter spacing <em>{layer.letterSpacing ?? 0}px</em></span>
        <input
          type="range"
          min={-2}
          max={20}
          step={0.5}
          value={layer.letterSpacing ?? 0}
          onChange={e => set({ letterSpacing: Number(e.target.value) })}
        />
      </label>

      <label className="control-group">
        <span>Font size <em>{Math.round(layer.fontSize)}px</em></span>
        <input
          type="number"
          min={4}
          max={1000}
          step={1}
          value={Math.round(layer.fontSize)}
          onChange={e => set({ fontSize: Number(e.target.value) })}
        />
      </label>

      <div className="control-group custom-size">
        <label>
          <span>X</span>
          <input
            type="number"
            value={Math.round(layer.x)}
            onChange={e => set({ x: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>Y</span>
          <input
            type="number"
            value={Math.round(layer.y)}
            onChange={e => set({ y: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="control-group">
        <span>Rotation <em>{Math.round(layer.rotation)}°</em></span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={layer.rotation}
          onChange={e => set({ rotation: Number(e.target.value) })}
        />
      </label>

      <div className="control-group">
        <span>Flip</span>
        <div className="btn-group">
          <button
            className={layer.flipH ? 'active' : ''}
            onClick={() => set({ flipH: !layer.flipH })}
            title="Flip horizontal"
            aria-label="Flip horizontal"
          ><FlipHorizontal2 size={16} /></button>
          <button
            className={layer.flipV ? 'active' : ''}
            onClick={() => set({ flipV: !layer.flipV })}
            title="Flip vertical"
            aria-label="Flip vertical"
          ><FlipVertical2 size={16} /></button>
        </div>
      </div>

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
