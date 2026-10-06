import { useEffect, type ReactElement } from 'react';
import type { CameraHandle } from '../scene/WorldScene';

/** Props for the view controls. */
interface ViewControlsProps {
  camera: CameraHandle;
  reducedMotion: boolean;
}

const ZOOM_STEP = 6;
const TURN_STEP = Math.PI / 6;
const TILT_STEP = Math.PI / 14;
const DEFAULT_TILT = Math.PI * 0.32;

/** Keyboard shortcuts for the view, shown in each button's label. */
const KEYS = { zoomIn: '+', zoomOut: '-', turnLeft: 'q', turnRight: 'e', tiltUp: 'w', tiltDown: 's', reset: 'r' } as const;

/**
 * On-screen camera controls: zoom in and out, turn left and right, tilt up and down, and reset to
 * face north at the default tilt. The same actions are on the keyboard (+ - q e w s r), ignored
 * while typing in a field.
 * @param props - the camera handle and the motion preference
 * @returns the control cluster
 */
export function ViewControls({ camera, reducedMotion }: ViewControlsProps): ReactElement {
  const smooth = !reducedMotion;
  const actions = {
    zoomIn: () => void camera.current?.dolly(ZOOM_STEP, smooth),
    zoomOut: () => void camera.current?.dolly(-ZOOM_STEP, smooth),
    turnLeft: () => void camera.current?.rotate(TURN_STEP, 0, smooth),
    turnRight: () => void camera.current?.rotate(-TURN_STEP, 0, smooth),
    tiltUp: () => void camera.current?.rotate(0, -TILT_STEP, smooth),
    tiltDown: () => void camera.current?.rotate(0, TILT_STEP, smooth),
    reset: () => void camera.current?.rotateTo(0, DEFAULT_TILT, smooth),
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, [contenteditable]')) return;
      const key = event.key === '=' ? '+' : event.key.toLowerCase();
      const action = (Object.keys(KEYS) as Array<keyof typeof KEYS>).find((name) => KEYS[name] === key);
      if (action) actions[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="view-controls" role="toolbar" aria-label="Camera">
      <button type="button" className="view-controls__button" onClick={actions.zoomIn} aria-label={`Zoom in (${KEYS.zoomIn})`} title={`Zoom in (${KEYS.zoomIn})`}>
        <Icon path="M12 5v14M5 12h14" />
      </button>
      <button type="button" className="view-controls__button" onClick={actions.zoomOut} aria-label={`Zoom out (${KEYS.zoomOut})`} title={`Zoom out (${KEYS.zoomOut})`}>
        <Icon path="M5 12h14" />
      </button>
      <span className="view-controls__gap" aria-hidden="true" />
      <button type="button" className="view-controls__button" onClick={actions.turnLeft} aria-label={`Turn left (${KEYS.turnLeft})`} title={`Turn left (${KEYS.turnLeft})`}>
        <Icon path="M9 7H5V3M5 7a8 8 0 1 1-1 7" />
      </button>
      <button type="button" className="view-controls__button" onClick={actions.turnRight} aria-label={`Turn right (${KEYS.turnRight})`} title={`Turn right (${KEYS.turnRight})`}>
        <Icon path="M15 7h4V3M19 7a8 8 0 1 0 1 7" />
      </button>
      <button type="button" className="view-controls__button" onClick={actions.tiltUp} aria-label={`Tilt up (${KEYS.tiltUp})`} title={`Tilt up (${KEYS.tiltUp})`}>
        <Icon path="M6 15l6-6 6 6" />
      </button>
      <button type="button" className="view-controls__button" onClick={actions.tiltDown} aria-label={`Tilt down (${KEYS.tiltDown})`} title={`Tilt down (${KEYS.tiltDown})`}>
        <Icon path="M6 9l6 6 6-6" />
      </button>
      <span className="view-controls__gap" aria-hidden="true" />
      <button type="button" className="view-controls__button" onClick={actions.reset} aria-label={`Face north (${KEYS.reset})`} title={`Face north (${KEYS.reset})`}>
        <Icon path="M12 3l4 9h-8zM12 21v-9" />
      </button>
    </div>
  );
}

/**
 * A stroked 24-pixel icon.
 * @param props - SVG path data
 * @returns the icon
 */
function Icon({ path }: { path: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
