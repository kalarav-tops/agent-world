import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type MutableRefObject, type ReactElement } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { AdaptiveDpr, CameraControls } from '@react-three/drei';
import type { WorldSummary } from '../../shared/types';
import type { ReplayState } from '../../shared/replay';
import { Continent, type SceneSelection } from './Continent';
import type { Placement } from './layout';
import { isCanvasEvent } from './events';
import { LabelLayerContext } from './Label';
import { Sea, Sky, SKY_HORIZON, Sunlight } from './Environment';
import { staticScene } from './instancing';
import { StaticWorld } from './StaticWorld';

/** Where the camera should look; a new `key` triggers the move. */
export interface CameraFocus {
  key: string;
  x: number;
  z: number;
  distance: number;
}

/** A handle to the camera controls, filled while the scene is mounted, for on-screen view buttons. */
export type CameraHandle = MutableRefObject<ComponentRef<typeof CameraControls> | null>;

/** Props for the 3D world. */
interface WorldSceneProps {
  world: WorldSummary;
  cameraHandle: CameraHandle;
  placements: Placement[];
  selection: SceneSelection | null;
  replay: { sessionId: string; labId: string; states: Record<string, ReplayState> } | null;
  focus: CameraFocus;
  now: number;
  reducedMotion: boolean;
  onSelectLab: (sessionId: string, labId: string) => void;
  onSelectScientist: (sessionId: string, labId: string, scientistId: string) => void;
  onOpenChanges: (sessionId: string, labId: string) => void;
  onFocusContinent: (sessionId: string) => void;
  onClearSelection: () => void;
}

const MAX_LAB_LIGHTS = 6;

/**
 * The ocean world with one continent per live session, in bright daylight.
 * @param props - world data, selection, camera focus and handlers
 * @returns the canvas
 */
export function WorldScene(props: WorldSceneProps): ReactElement {
  const { world, placements } = props;
  const [layerElement, setLayerElement] = useState<HTMLDivElement | null>(null);
  const labelLayer = useMemo(() => (layerElement ? { current: layerElement } : null), [layerElement]);
  const [hoveredLab, setHoveredLab] = useState<string | null>(null);
  const layoutKey = world.sessions.map((session) => `${session.sessionId}:${session.labs.map((lab) => `${lab.id}=${lab.active ? 1 : 0}`).join(',')}`).join('|');
  const staticLayer = useMemo(() => staticScene(world, placements), [layoutKey, placements]);
  const lightBudget = useMemo(() => {
    const keys = world.sessions.flatMap((session) => session.labs.filter((lab) => lab.active).map((lab) => `${session.sessionId}/${lab.id}`));
    return new Set(keys.slice(0, MAX_LAB_LIGHTS));
  }, [world]);

  return (
    <div className="world">
      {labelLayer && (
        <LabelLayerContext.Provider value={labelLayer}>
          <Canvas
            className="world-canvas"
            camera={{ position: [0, 40, 48], fov: 42, near: 0.5, far: 4000 }}
            dpr={[1, 1.75]}
            performance={{ min: 0.6 }}
            shadows
            onPointerMissed={(event: MouseEvent) => {
              if (isCanvasEvent(event)) props.onClearSelection();
            }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={[SKY_HORIZON]} />
            <fog attach="fog" args={[SKY_HORIZON, 220, 900]} />
            <Sky />
            <Sunlight />
            <Sea animate={!props.reducedMotion} />
            <AdaptiveDpr pixelated />
            <Suspense fallback={null}>
              <StaticWorld scene={staticLayer} onSelectLab={props.onSelectLab} onHoverLab={setHoveredLab} />
            {world.sessions.map((session, index) => {
              const placement = placements[index];
              if (!placement) return null;
              return (
                <Continent
                  key={session.sessionId}
                  session={session}
                  placement={placement}
                  selection={props.selection}
                  replay={props.replay}
                  lightBudget={lightBudget}
                hoveredLab={hoveredLab}
                  now={props.now}
                  reducedMotion={props.reducedMotion}
                  onSelectLab={props.onSelectLab}
                  onSelectScientist={props.onSelectScientist}
                  onOpenChanges={props.onOpenChanges}
                  onFocus={props.onFocusContinent}
                />
              );
            })}
            </Suspense>
            <FocusControls focus={props.focus} reducedMotion={props.reducedMotion} handle={props.cameraHandle} />
          <DebugHandle />
          </Canvas>
        </LabelLayerContext.Provider>
      )}
      <div className="label-layer" ref={setLayerElement} />
    </div>
  );
}

/**
 * With `?debug` in the URL, exposes the three.js scene and renderer as `window.agentWorldDebug`
 * for inspection from the browser console or a test. Does nothing otherwise.
 * @returns nothing
 */
function DebugHandle(): null {
  const { scene, gl } = useThree();
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return undefined;
    (window as unknown as { agentWorldDebug?: unknown }).agentWorldDebug = { scene, gl };
    return () => {
      delete (window as unknown as { agentWorldDebug?: unknown }).agentWorldDebug;
    };
  }, [scene, gl]);
  return null;
}

/**
 * Orbit/zoom/pan controls that glide to a new focus whenever its key changes.
 * @param props - focus and motion preference
 * @returns the controls
 */
function FocusControls({ focus, reducedMotion, handle }: { focus: CameraFocus; reducedMotion: boolean; handle: CameraHandle }): ReactElement {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);

  useEffect(() => {
    handle.current = controls.current;
    return () => {
      handle.current = null;
    };
  }, [handle]);

  useEffect(() => {
    const { x, z, distance } = focus;
    void controls.current?.setLookAt(x, distance * 0.55, z + distance, x, 0.6, z, !reducedMotion);
  }, [focus, reducedMotion]);

  return <CameraControls ref={controls} makeDefault minDistance={6} maxDistance={600} maxPolarAngle={Math.PI * 0.46} smoothTime={0.35} />;
}
