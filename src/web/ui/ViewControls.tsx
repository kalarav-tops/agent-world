import { useEffect, type ReactElement } from 'react';
import type { CameraHandle } from '../scene/WorldScene';
import { Icon, type IconName } from './icons';

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

  const button = (action: keyof typeof KEYS, label: string, icon: IconName): ReactElement => (
    <button type="button" className="view-controls__button" onClick={actions[action]} aria-label={`${label} (${KEYS[action]})`} title={`${label} (${KEYS[action]})`}>
      <Icon name={icon} />
    </button>
  );

  return (
    <div className="view-controls" role="toolbar" aria-label="Camera">
      <div className="view-controls__group" role="group" aria-label="Zoom">
        {button('zoomIn', 'Zoom in', 'zoomIn')}
        {button('zoomOut', 'Zoom out', 'zoomOut')}
      </div>
      <div className="view-controls__group" role="group" aria-label="Turn and tilt">
        {button('turnLeft', 'Turn left', 'turnLeft')}
        {button('turnRight', 'Turn right', 'turnRight')}
        {button('tiltUp', 'Tilt up', 'tiltUp')}
        {button('tiltDown', 'Tilt down', 'tiltDown')}
      </div>
      <div className="view-controls__group" role="group" aria-label="Reset">
        {button('reset', 'Face north', 'north')}
      </div>
    </div>
  );
}

