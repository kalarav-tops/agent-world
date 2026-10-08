import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { LabelLayerContext } from '../scene/Label';
import { warpPhase, type Place } from '../state/place';
import { Bridge } from './Bridge';
import { WarpTunnel } from './WarpTunnel';

/** Props for the ship scene. */
interface ShipSceneProps {
  place: Place;
  now: number;
  reducedMotion: boolean;
  waiting: boolean;
  onLeave: () => void;
  onShowWaiting: () => void;
  screens: ReactNode;
}

/**
 * The ship: the warp tunnel while travelling, then the bridge. It has its own canvas, so the world
 * is not drawn while you are on board. If the graphics context is lost mid-warp, it skips the
 * tunnel and shows the bridge.
 * @param props - place, clock, motion preference, waiting flag, leave and waiting handlers, console screens
 * @returns the scene
 */
export function ShipScene({ place, now, reducedMotion, waiting, onLeave, onShowWaiting, screens }: ShipSceneProps): ReactElement {
  const [contextLost, setContextLost] = useState(false);
  const [layerElement, setLayerElement] = useState<HTMLDivElement | null>(null);
  const labelLayer = useMemo(() => (layerElement ? { current: layerElement } : null), [layerElement]);
  const phase = warpPhase(place, now, reducedMotion);
  const tunnel = !contextLost && (phase?.phase === 'tunnel' || phase?.phase === 'rise');
  const speed = phase?.phase === 'tunnel' ? Math.sin(phase.progress * Math.PI) : phase?.phase === 'rise' ? phase.progress * 0.3 : 0;
  return (
    <div className="world ship">
      {labelLayer && (
        <LabelLayerContext.Provider value={labelLayer}>
          <Canvas
            className="world-canvas"
            camera={{ position: [0, 0.9, 3.4], fov: 55 }}
            dpr={[1, 1.5]}
            onCreated={({ gl, camera }) => {
              gl.setClearColor('#05080d');
              camera.lookAt(0, 0.3, -2);
              gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true), { once: true });
            }}
          >
            {tunnel ? <WarpTunnel speed={speed} /> : <Bridge waiting={waiting} reducedMotion={reducedMotion} onLeave={onLeave} onShowWaiting={onShowWaiting} screens={screens} />}
          </Canvas>
        </LabelLayerContext.Provider>
      )}
      <div className="label-layer" ref={setLayerElement} />
    </div>
  );
}
