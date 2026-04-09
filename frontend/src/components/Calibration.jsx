import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * One-time screen DPI calibration modal. Renders a horizontal bar whose CSS
 * pixel width is controlled by a slider; the user holds a physical ruler up
 * to the screen and adjusts until the bar measures exactly 1 inch. The
 * resulting pixel-per-inch value becomes the screen DPI for the true-size
 * display mode.
 */
export default function Calibration({ initialDPI, onDone, onCancel }) {
  const [pixels, setPixels] = useState(Math.round(initialDPI ?? 96));

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick}>
      <div className="cal-panel">
        <div className="cal-header">
          <h2>Calibrate screen size</h2>
          <button type="button" className="cal-close" onClick={onCancel} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>

        <p className="cal-instructions">
          Hold a ruler against your screen and drag the slider until the bar
          below measures exactly <strong>1 inch (25.4 mm)</strong>. This
          calibrates the true-size canvas display to your monitor.
        </p>

        <div className="cal-ruler-row">
          <div className="cal-tick" />
          <div className="cal-bar" style={{ width: `${pixels}px` }} />
          <div className="cal-tick" />
        </div>
        <div className="cal-readout">{pixels} px = 1 inch</div>

        <input
          type="range"
          className="cal-slider"
          min={50}
          max={400}
          step={1}
          value={pixels}
          onChange={e => setPixels(Number(e.target.value))}
        />

        <div className="cal-actions">
          <button type="button" className="cal-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="cal-btn primary" onClick={() => onDone(pixels)}>Done</button>
        </div>
      </div>
    </div>
  );
}
