import { useState } from 'react';
import { X, Sun, Moon, Circle } from 'lucide-react';
import { ACCENTS, THEMES } from '../utils/theme.js';

const THEME_META = {
  light: { label: 'Light', icon: Sun },
  dark:  { label: 'Dark',  icon: Moon },
  oled:  { label: 'OLED',  icon: Circle },
};

/**
 * Global settings modal. Tabs: Print, Display, Appearance.
 * Values persist to IndexedDB on change via the callbacks wired in App.
 */
export default function Settings({
  darkness,
  speed,
  xOffset,
  yOffset,
  screenDPI,
  theme,
  accent,
  onChangeDarkness,
  onChangeSpeed,
  onChangeXOffset,
  onChangeYOffset,
  onCalibrationDone,
  onChangeTheme,
  onChangeAccent,
  onClose,
}) {
  const [tab, setTab] = useState('print');

  // DPI calibration state (local until "Apply")
  const [calPixels, setCalPixels] = useState(Math.round(screenDPI ?? 96));

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const selectedAccent = ACCENTS.find(a => a.id === accent) ?? ACCENTS[0];

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
          <button
            type="button"
            className={`settings-tab ${tab === 'appearance' ? 'active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            Appearance
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
                <span className="settings-hint">{xOffset} dots from left edge</span>
                <input
                  type="number"
                  min={0}
                  max={832}
                  step={1}
                  value={xOffset}
                  onChange={e => {
                    const v = Math.max(0, Math.min(832, Number(e.target.value) || 0));
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

        {tab === 'appearance' && (
          <div className="settings-body">
            <div className="appearance-section">
              <span className="settings-label">Theme</span>
              <div className="theme-segmented" role="radiogroup" aria-label="Theme">
                {THEMES.map(t => {
                  const meta = THEME_META[t];
                  const Icon = meta.icon;
                  const active = theme === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`theme-option ${active ? 'active' : ''}`}
                      onClick={() => onChangeTheme(t)}
                    >
                      <Icon size={14} />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settings-divider" />

            <div className="appearance-section">
              <span className="settings-label">Accent</span>
              <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
                {ACCENTS.map(a => {
                  const active = accent === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={a.name}
                      className={`accent-swatch ${active ? 'active' : ''}`}
                      style={{ '--swatch-color': a.value }}
                      onClick={() => onChangeAccent(a.id)}
                    />
                  );
                })}
              </div>
              <span className="accent-name">{selectedAccent.name}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
