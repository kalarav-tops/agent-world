import { useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import { Detailed } from '@react-three/drei';
import { DoubleSide, Vector3, type Mesh, type MeshBasicMaterial } from 'three';
import type { LabSummary } from '../../shared/types';
import type { ReplayState } from '../../shared/replay';
import { isWaiting, LAB_SIZE, scientistTargets, type LabType } from './layout';
import { LAB_STYLES } from './labStyles';
import { ScientistFigure } from './ScientistFigure';
import { Stations } from './Stations';
import { Label } from './Label';
import { agentCount, labClock, preview } from '../ui/format';

/** Props for one lab on a continent. */
export interface LabBuildingProps {
  sessionId: string;
  lab: LabSummary;
  position: [number, number, number];
  scale: number;
  labType: LabType;
  selected: boolean;
  hovered: boolean;
  withLight: boolean;
  replay: Record<string, ReplayState> | null;
  now: number;
  reducedMotion: boolean;
  onSelectLab: () => void;
  onSelectScientist: (scientistId: string) => void;
  onOpenChanges: () => void;
}

const HALF = LAB_SIZE / 2;
const WALL_HEIGHT = 1.5;
const WINDOW_LIT = '#ffcf7a';
/** Scientists are drawn within this distance of the camera. */
const SCIENTISTS_VISIBLE_DISTANCE = 45;
/** Small equipment and its effects are drawn within this distance. */
const EQUIPMENT_VISIBLE_DISTANCE = 30;

/**
 * One lab's live parts: its scientists and equipment, the glow while anyone works inside, the
 * selection ring, and a tag with the prompt and a clock (shown while lit, selected or hovered).
 * @param props - lab summary, placement and handlers
 * @returns the building
 */
export function LabBuilding(props: LabBuildingProps): ReactElement {
  const { lab, position, selected, hovered, onSelectLab, now, scale, labType } = props;
  const lit = props.replay ? Object.values(props.replay).some((state) => isBusy(state.status)) : lab.active;

  return (
    <group position={position}>
      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[HALF * scale * 1.5, HALF * scale * 1.58, 64]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      )}
      {lit && (
        <group scale={[scale, 1, scale]}>
          <ActiveGlow animate={!props.reducedMotion} />
        </group>
      )}
      <Interior {...props} lit={lit} />
      {(lit || selected || hovered) && (
        <Label position={[0, WALL_HEIGHT + 1.6, -HALF * scale]} center zIndexRange={[15, 5]}>
          <button type="button" className={`lab-tag${lit ? ' lab-tag--lit' : ''}`} onClick={onSelectLab}>
            <span className="lab-tag__head">
              <span className="lab-tag__index">Lab {lab.index}</span>
              <span className="lab-tag__type" style={{ background: LAB_STYLES[labType].trim }}>
                {LAB_STYLES[labType].name}
              </span>
              {lit && <span className="lab-tag__live">Working</span>}
              <span className="lab-clock" aria-label={lit ? 'Running for' : 'Took'}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 4.5V8l2.5 1.5" />
                </svg>
                {labClock(lab.startedAt, lit ? new Date(now).toISOString() : lab.updatedAt)}
              </span>
            </span>
            <span className="lab-tag__prompt">{preview(lab.prompt, 42) || 'No prompt text'}</span>
            <span className="lab-tag__count">{agentCount(lab.scientists)}</span>
          </button>
        </Label>
      )}
    </group>
  );
}

/**
 * The live inside of a lab: equipment up close, and its scientists. Walls, floor and furniture are
 * drawn by StaticWorld.
 * @param props - lab props plus whether it is lit
 * @returns interior
 */
function Interior(props: LabBuildingProps & { lit: boolean }): ReactElement {
  const { lab, lit, replay, now, reducedMotion, onSelectScientist, onOpenChanges, withLight, sessionId, scale, labType } = props;
  const scientists = useMemo(() => (replay ? lab.scientists.filter((scientist) => replay[scientist.id]) : lab.scientists), [lab.scientists, replay]);
  const targets = useMemo(() => {
    const local = scientistTargets(scientists, (scientist) => {
      const state = replay?.[scientist.id];
      return state ? { status: state.status, tool: state.tool } : { status: scientist.status, tool: scientist.current?.tool };
    });
    return Object.fromEntries(Object.entries(local).map(([id, target]) => [id, { ...target, x: target.x * scale, z: target.z * scale }]));
  }, [scientists, replay, scale]);
  const seats = useMemo(() => {
    const resting = scientists.filter((scientist) => isResting(replay?.[scientist.id]?.status ?? scientist.status));
    return new Map(resting.map((scientist, index) => [scientist.id, index]));
  }, [scientists, replay]);

  return (
    <group>
      {lit && withLight && <pointLight position={[0, 2.4, 0]} color={WINDOW_LIT} intensity={9} distance={10} decay={1.6} />}
      <Detailed distances={[0, EQUIPMENT_VISIBLE_DISTANCE]}>
        <Stations lit={lit} animate={!reducedMotion} scale={scale} type={labType} changeCount={lab.changeCount} showBadge={props.selected} onOpenChanges={onOpenChanges} />
        <group />
      </Detailed>
      <Detailed distances={[0, SCIENTISTS_VISIBLE_DISTANCE]}>
        <group>
          {scientists.map((scientist) => {
        const state = replay?.[scientist.id];
        const target = targets[scientist.id];
        if (!target) return null;
        return (
          <ScientistFigure
            key={scientist.id}
            scientist={scientist}
            scientistKey={`${sessionId}/${scientist.id}`}
            status={state?.status ?? scientist.status}
            summary={state ? state.summary : scientist.current?.summary}
            waiting={!state && isWaiting(scientist, now)}
            target={target}
            reducedMotion={reducedMotion}
            labScale={scale}
            restSeat={seats.get(scientist.id)}
            onSelect={onSelectScientist}
          />
        );
          })}
        </group>
        <group />
      </Detailed>
    </group>
  );
}

/**
 * Whether a status means someone is at work.
 * @param status - scientist status
 * @returns true when busy
 */
function isBusy(status: string): boolean {
  return status === 'thinking' || status === 'working' || status === 'asking';
}

/**
 * Marks a lab where work is going on: a pulsing amber ring around the lab and a soft beam of light
 * rising from it, so busy labs stand out from the world overview. Up close the beam is hidden, since the
 * lit room, ring and badge already say it is busy.
 * @param props - whether to animate the pulse
 * @returns the glow
 */
function ActiveGlow({ animate }: { animate: boolean }): ReactElement {
  const ring = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const beamPosition = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    if (beam.current) {
      beam.current.getWorldPosition(beamPosition);
      beam.current.visible = state.camera.position.distanceTo(beamPosition) > BEAM_HIDE_DISTANCE;
    }
    if (!animate) return;
    const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 2.4) * 0.5;
    if (ring.current) {
      (ring.current.material as MeshBasicMaterial).opacity = 0.45 + pulse * 0.5;
      ring.current.scale.setScalar(1 + pulse * 0.04);
    }
    if (beam.current) (beam.current.material as MeshBasicMaterial).opacity = 0.1 + pulse * 0.08;
  });
  return (
    <group>
      <mesh ref={ring} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <ringGeometry args={[HALF * 1.22, HALF * 1.46, 64]} />
        <meshBasicMaterial color={ACTIVE_GLOW} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={beam} position={[0, BEAM_BASE + BEAM_HEIGHT / 2, 0]} raycast={ignoreRaycast}>
        <cylinderGeometry args={[HALF * 0.35, HALF * 0.75, BEAM_HEIGHT, 24, 1, true]} />
        <meshBasicMaterial color={ACTIVE_GLOW} transparent opacity={0.14} toneMapped={false} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

const ACTIVE_GLOW = '#ff9f1c';
const BEAM_HEIGHT = 24;
/** Closer than this, the beam is hidden. */
const BEAM_HIDE_DISTANCE = 45;
/** The beam starts above the walls so it never hazes the room itself. */
const BEAM_BASE = WALL_HEIGHT + 1.2;

/**
 * A raycast that never hits, for decorative meshes that must not catch clicks or hovers.
 * @returns nothing
 */
function ignoreRaycast(): void {
  return undefined;
}

/**
 * Whether a status means the scientist has finished and is resting.
 * @param status - scientist status
 * @returns true when resting
 */
function isResting(status: string): boolean {
  return status === 'done' || status === 'idle';
}
