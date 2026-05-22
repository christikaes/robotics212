import { useSettings } from '../scene/SettingsContext'

export function SettingsPanel() {
  const { showOverlays, setShowOverlays } = useSettings()

  return (
    <div className="settings-panel">
      <div className="settings-row">
        <label className="settings-label" htmlFor="overlay-toggle">
          Show overlays
        </label>
        <button
          id="overlay-toggle"
          className={`toggle-btn${showOverlays ? ' is-on' : ''}`}
          onClick={() => setShowOverlays(!showOverlays)}
          aria-pressed={showOverlays}
        >
          {showOverlays ? 'ON' : 'OFF'}
        </button>
      </div>
      <p className="settings-hint">
        Overlays display link lengths and joint angles directly on the 3D view.
      </p>
    </div>
  )
}
