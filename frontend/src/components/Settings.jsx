import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * Global settings modal with two tabs:
 *   - Print: darkness, speed, X/Y offset
 *   - Display: screen DPI calibration
 *
 * All values persist to IndexedDB settings store immediately on change.
 */
export default function Settings({
  darkness,
  speed,
  xOffset,
  yOffset,
  screenDPI,
  onChangeDarkness,
  onChangeSpeed,
  onChangeXOffset,
  onChangeYOffset,
  onCalibrationDone,
  onClose,
}) {
  const [tab, setTab] = useState('print');

  // DPI calibration state (local until "Apply")
  const [calPixels, setCalPixels] = useState(Math.round(screenDPI ?? 96));

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick}>
      <div className="cal-panel settings-panel">
        <div className="cal-header">
          <h2>Settings</h2>
          <button type="button" className="cal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab ${tab === 'print' ? 'active' : ''}`}
            onClick={() => setTab('print')}
          >
            Print
          </button>
          <button
            type="button"
            className={`settings-tab ${tab === 'display' ? 'active' : ''}`}
            onClick={() => setTab('display')}
          >
            Display
          </button>
        </div>

        {tab === 'print' && (
          <div className="settings-body">
            <div className="settings-grid">
              <label className="settings-field">
                <span className="settings-label">Darkness</span>
                <span className="settings-hint">0 (lightest) to 15 (darkest)</span>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={darkness}
                  onChange={e => onChangeDarkness(Number(e.target.value))}
                />
                <span className="settings-value">{darkness}</span>
              </label>

              <label className="settings-field">
                <span className="settings-label">Speed</span>
                <span className="settings-hint">1 (slowest, best quality) to 4 (fastest)</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={speed}
                  onChange={e => onChangeSpeed(Number(e.target.value))}
                />
                <span className="settings-value">{speed}</span>
              </label>
            </div>

            <div className="settings-divider" />

            <p className="settings-section-hint">
              X/Y offset shifts the print position on the label. Adjust if
              prints aren't centered on the label stock.
            </p>

            <div className="settings-grid">
              <label className="settings-field">
                <span className="settings-label">X offset</span>
                <span className="settings-hint">{xOffset} dots ({xOffset / 8} bytes) from left edge</span>
                <input
                  type="number"
                  min={0}
                  max={832}
                  step={8}
                  value={xOffset}
                  onChange={e => {
                    const v = Math.max(0, Math.min(832, Math.round(Number(e.target.value) / 8) * 8));
                    onChangeXOffset(v);
                  }}
                />
              </label>

              <label className="settings-field">
                <span className="settings-label">Y offset</span>
                <span className="settings-hint">{yOffset} dots from top edge</span>
                <input
                  type="number"
                  min={0}
                  max={2400}
                  step={1}
                  value={yOffset}
                  onChange={e => {
                    const v = Math.max(0, Math.min(2400, Number(e.target.value) || 0));
                    onChangeYOffset(v);
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {tab === 'display' && (
          <div className="settings-body">
            <p className="settings-section-hint">
              Hold a ruler against your screen and drag the slider until the
              bar below measures exactly <strong>1 inch (25.4 mm)</strong>.
              This calibrates the true-size canvas display to your monitor.
            </p>

            <div className="cal-ruler-row">
              <div className="cal-marker" />
              <div className="cal-bar" style={{ width: `${calPixels}px` }} />
              <div className="cal-marker" />
            </div>
            <div className="cal-readout">{calPixels} px = 1 inch</div>

            <input
              type="range"
              className="cal-slider"
              min={50}
              max={400}
              step={1}
              value={calPixels}
              onChange={e => setCalPixels(Number(e.target.value))}
            />

            <div className="cal-actions">
              <button
                type="button"
                className="cal-btn primary"
                onClick={() => onCalibrationDone(calPixels)}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
