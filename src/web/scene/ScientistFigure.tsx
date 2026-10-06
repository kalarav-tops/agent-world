import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Color, Mesh as ThreeMesh, MeshStandardMaterial, TorusGeometry, type Group, type Material, type Mesh } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { effortLabel, modelLabel } from '../../shared/models';
import type { Station } from '../../shared/tools';
import type { ScientistStatus, ScientistSummary } from '../../shared/types';
import { buildFor, characterFor, CHARACTER_SCALE, EFFORT_COLORS, GLASSES_URL } from './assets';
import { STATUS_COLORS, pacePoint, roleColor, wanderSpot } from './layout';
import { isCanvasEvent } from './events';
import { Label } from './Label';
import { ThinkingDots, WorkEffect } from './WorkEffects';
import { preview, roleLabel, statusLabel } from '../ui/format';

/** Props for one scientist in a lab. */
interface ScientistFigureProps {
  scientist: ScientistSummary;
  scientistKey: string;
  status: ScientistStatus;
  summary: string | undefined;
  waiting: boolean;
  target: { station: Station; x: number; z: number; face: number };
  reducedMotion: boolean;
  labScale: number;
  restSeat: number | undefined;
  onSelect: (scientistId: string) => void;
}

const WALK_SPEED = 2.2;
const PACE_SPEED = 1.1;
const ARRIVED = 0.03;
const CHARACTER_HEIGHT = 0.78;
const FADE_SECONDS = 0.25;
const GLASSES_OFFSET: [number, number, number] = [0, 0.09, 0.085];



const tintedMaterials = new Map<string, Material>();
const scarfMaterials = new Map<string, Material>();
const SCARF_GEOMETRY = new TorusGeometry(0.19, 0.06, 6, 14);
const SCARF_HEIGHT = 0.015;

/**
 * A scientist: a rigged character whose build follows its model (Fable bulkiest, Haiku slimmest),
 * whose clothes follow its effort. Working scientists experiment at their station, thinking ones pace,
 * and finished or idle ones wander the lab tinkering with the equipment.
 * A status lamp floats above its head; hovering shows a summary, clicking opens its details.
 * @param props - scientist, its current state and target
 * @returns the figure
 */
export function ScientistFigure(props: ScientistFigureProps): ReactElement {
  const { scientist, status, target, reducedMotion, onSelect, scientistKey, labScale, restSeat } = props;
  const url = characterFor(scientistKey);
  const gltf = useGLTF(url);
  const effortColor = EFFORT_COLORS[scientist.effort];
  const coatColor = roleColor(scientist.role);
  const glasses = useGLTF(GLASSES_URL);
  const body = useMemo(
    () => dressCharacter(cloneSkinned(gltf.scene) as Group, url, coatColor, effortColor, glasses.scene),
    [gltf.scene, url, coatColor, effortColor, glasses.scene],
  );
  const rig = useRef<Group>(null);
  const mover = useRef<Group>(null);
  const lamp = useRef<Mesh>(null);
  const spotlight = useRef<Mesh>(null);
  const clipRef = useRef('idle');
  const arrivedRef = useRef(false);
  const [clip, setClip] = useState('idle');
  const [arrived, setArrived] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { actions } = useAnimations(gltf.animations, rig);
  const [width, height, depth] = buildFor(scientist.model);
  const mode = modeFor(status);
  const start = useMemo(() => (mode === 'wander' ? scaled(wanderSpot(scientistKey, Date.now(), restSeat), labScale) : target), [mode, scientistKey, target, labScale, restSeat]);

  useEffect(() => {
    const action = actions[clip] ?? actions.idle;
    action?.reset().fadeIn(FADE_SECONDS).play();
    return () => {
      action?.fadeOut(FADE_SECONDS);
    };
  }, [actions, clip]);

  useEffect(() => {
    if (!hovered) return undefined;
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  useFrame((state, delta) => {
    const node = mover.current;
    if (!node) return;
    const goal = goalFor(mode, target, scientistKey, reducedMotion ? 0 : Date.now(), labScale, restSeat);
    const dx = goal.x - node.position.x;
    const dz = goal.z - node.position.z;
    const distance = Math.hypot(dx, dz);
    const walking = !reducedMotion && distance > ARRIVED;
    if (walking) {
      const step = Math.min(distance, (mode === 'pace' ? PACE_SPEED : WALK_SPEED) * delta);
      node.position.x += (dx / distance) * step;
      node.position.z += (dz / distance) * step;
      node.rotation.y = Math.atan2(dx, dz);
    } else {
      node.position.set(goal.x, 0, goal.z);
      node.rotation.y = goal.face;
    }
    const nextClip = walking ? 'walk' : goal.clip;
    if (nextClip !== clipRef.current) {
      clipRef.current = nextClip;
      setClip(nextClip);
    }
    if (!walking !== arrivedRef.current) {
      arrivedRef.current = !walking;
      setArrived(!walking);
    }
    if (lamp.current) {
      const pulse = status === 'asking' && !reducedMotion ? 1 + Math.sin(state.clock.elapsedTime * 4) * 0.3 : 1;
      lamp.current.scale.setScalar(pulse);
      lamp.current.rotation.y += delta;
    }
    if (spotlight.current && !reducedMotion) {
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.08;
      spotlight.current.scale.set(breathe, breathe, 1);
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    if (isCanvasEvent(event.nativeEvent)) onSelect(scientist.id);
  };

  const lampColor = props.waiting ? '#c9a46a' : STATUS_COLORS[status];
  const headTop = CHARACTER_HEIGHT * CHARACTER_SCALE * height;
  const animateEffects = !reducedMotion;

  return (
    <group
      ref={mover}
      position={[start.x, 0, start.z]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      {isWorking(status) && (
        <mesh ref={spotlight} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
          <ringGeometry args={[0.32 * width, 0.5 * width, 32]} />
          <meshBasicMaterial color={lampColor} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[0.36 * width, 20]} />
        <meshBasicMaterial color="#1b2a1f" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group ref={rig} scale={[CHARACTER_SCALE * width, CHARACTER_SCALE * height, CHARACTER_SCALE * depth]}>
        <primitive object={body} />
      </group>
      <mesh ref={lamp} position={[0, headTop + 0.3, 0]}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial color={lampColor} toneMapped={false} />
      </mesh>
      {animateEffects && mode === 'work' && status === 'working' && arrived && <WorkEffect station={target.station} height={headTop} />}
      {animateEffects && mode === 'pace' && <ThinkingDots height={headTop} />}
      {status === 'asking' && (
        <Label position={[0, headTop + 0.75, 0]} center zIndexRange={[25, 15]}>
          <div className="ask-bubble" aria-label="Asking you a question">
            ?
          </div>
        </Label>
      )}
      {hovered && (
        <Label position={[0, headTop + 0.8, 0]} center zIndexRange={[30, 20]}>
          <div className="tooltip" role="status">
            <p className="tooltip__who">
              {roleLabel(scientist.role)}
              {scientist.description && <span className="tooltip__task"> {preview(scientist.description, 48)}</span>}
            </p>
            {(scientist.model || scientist.effort) && (
              <p className="tooltip__build">
                {modelLabel(scientist.model) || 'Model not reported'}
                {scientist.effort ? `, ${effortLabel(scientist.effort).toLowerCase()} effort` : ''}
              </p>
            )}
            <p className="tooltip__what">
              <span className="dot" style={{ background: lampColor }} />
              {statusLabel(status, props.waiting)}
              {props.summary ? `: ${preview(props.summary, 56)}` : ''}
            </p>
          </div>
        </Label>
      )}
    </group>
  );
}

/**
 * Prepare a cloned character: glasses on its head, frustum culling off (an animated skinned mesh
 * keeps a stale bounding volume and would otherwise vanish while visible), no cast shadow (a cheap
 * blob disc stands in), its clothing in its role colour, and a scarf in its effort colour.
 * @param character - cloned character scene
 * @param url - model URL, part of the material cache key
 * @param coatColor - clothing colour for the agent's role
 * @param effortColor - scarf colour for its effort, or undefined for no scarf
 * @param glasses - glasses model to put on
 * @returns the same object
 */
function dressCharacter(character: Group, url: string, coatColor: string, effortColor: string | undefined, glasses: Group): Group {
  const head = character.getObjectByName('head');
  if (head) {
    const pair = glasses.clone();
    pair.position.set(...GLASSES_OFFSET);
    head.add(pair);
    if (effortColor) head.add(effortScarf(effortColor));
  }
  character.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    if (mesh.name.startsWith('body')) mesh.material = clothingMaterial(mesh.material as MeshStandardMaterial, url, coatColor);
  });
  return character;
}

/**
 * A chunky scarf in the effort colour, worn just under the head. Chibi heads hide most of the body
 * from above, so the scarf keeps the effort readable from any camera angle.
 * @param color - effort colour
 * @returns the scarf, positioned in head-bone space
 */
function effortScarf(color: string): Mesh {
  const scarf = new ThreeMesh(SCARF_GEOMETRY, scarfMaterial(color));
  scarf.position.set(0, SCARF_HEIGHT, 0.01);
  scarf.rotation.x = Math.PI / 2;
  scarf.scale.set(1, 0.78, 1);
  return scarf;
}

/**
 * A shared material per scarf colour.
 * @param color - effort colour
 * @returns material
 */
function scarfMaterial(color: string): Material {
  const cached = scarfMaterials.get(color);
  if (cached) return cached;
  const material = new MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  scarfMaterials.set(color, material);
  return material;
}

/**
 * A copy of the character material whose clothing swatches (the saturated middle row of the
 * shared colour atlas) are recoloured to a light tone of the role colour, keeping their shading.
 * Skin, hair and dark swatches are left as they are. Materials are cached per model and colour.
 * @param source - the character's material
 * @param url - model URL
 * @param color - role colour
 * @returns the recoloured material
 */
function clothingMaterial(source: MeshStandardMaterial, url: string, color: string): Material {
  const key = `${url}|${color}`;
  const cached = tintedMaterials.get(key);
  if (cached) return cached;
  const material = source.clone();
  const tint = new Color(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clothingColor = { value: tint };
    shader.fragmentShader = `uniform vec3 clothingColor;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
#ifdef USE_MAP
if (vMapUv.x > 0.125 && vMapUv.y > 0.5 && vMapUv.y < 0.75) {
  float shade = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = clothingColor * (0.78 + 0.42 * shade);
}
#endif`,
    );
  };
  material.customProgramCacheKey = () => 'role-clothing';
  tintedMaterials.set(key, material);
  return material;
}

/**
 * Whether a status means the scientist is actively working (thinking, running a tool, or asking).
 * @param status - scientist status
 * @returns true when working
 */
function isWorking(status: ScientistStatus): boolean {
  return status === 'thinking' || status === 'working' || status === 'asking';
}

/**
 * A raycast that never hits, for decorative meshes that must not catch clicks or hovers.
 * @returns nothing
 */
function ignoreRaycast(): void {
  return undefined;
}

/** How a scientist behaves for its status. */
type Mode = 'work' | 'pace' | 'wander' | 'rest';

/** Two work motions per station, alternated so working looks busy rather than looped. */
const WORK_CLIPS: Record<Station, [string, string]> = {
  bench: ['interact-right', 'holding-both'],
  microscope: ['holding-both', 'interact-left'],
  terminal: ['interact-left', 'interact-right'],
  library: ['pick-up', 'holding-right'],
  portal: ['emote-yes', 'interact-right'],
  helpdesk: ['emote-no', 'emote-yes'],
  whiteboard: ['idle', 'interact-left'],
  lounge: ['sit', 'sit'],
  exit: ['sit', 'sit'],
};
const WORK_SWITCH_MS = 4500;

/**
 * The behaviour for a status: working and asking scientists work at their station, thinking ones
 * pace, finished and idle ones wander, interrupted ones rest.
 * @param status - scientist status
 * @returns the mode
 */
function modeFor(status: ScientistStatus): Mode {
  if (status === 'done' || status === 'idle') return 'wander';
  if (status === 'interrupted') return 'rest';
  if (status === 'thinking') return 'pace';
  return 'work';
}

/**
 * Where a scientist should be right now, which way it faces there, and what it does on arrival.
 * @param mode - its behaviour
 * @param target - its station spot
 * @param key - its stable key
 * @param timeMs - current time, milliseconds (0 freezes movement for reduced motion)
 * @param labScale - how much bigger than the base size the lab is
 * @param restSeat - the agent's seat among the lab's resting agents, so resting agents never overlap
 * @returns goal position, facing and animation
 */
function goalFor(mode: Mode, target: { station: Station; x: number; z: number; face: number }, key: string, timeMs: number, labScale: number, restSeat?: number): { x: number; z: number; face: number; clip: string } {
  if (mode === 'wander') {
    const spot = scaled(wanderSpot(key, timeMs, restSeat), labScale);
    return { x: spot.x, z: spot.z, face: spot.face, clip: spot.clip };
  }
  if (mode === 'pace') {
    const point = timeMs ? pacePoint(target, key, timeMs) : target;
    return { ...point, face: target.face, clip: 'idle' };
  }
  if (mode === 'rest') return { x: target.x, z: target.z, face: 0, clip: 'sit' };
  const pair = WORK_CLIPS[target.station];
  const which = Math.floor((timeMs + key.length * 977) / WORK_SWITCH_MS) % 2;
  return { x: target.x, z: target.z, face: target.face, clip: pair[which] ?? pair[0] };
}

/**
 * A lab-local spot spread out to a bigger lab.
 * @param spot - spot in base-size lab coordinates
 * @param labScale - the lab's size multiple
 * @returns the spot in this lab
 */
function scaled<T extends { x: number; z: number }>(spot: T, labScale: number): T {
  return { ...spot, x: spot.x * labScale, z: spot.z * labScale };
}
