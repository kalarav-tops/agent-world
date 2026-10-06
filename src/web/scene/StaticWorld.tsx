import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BoxGeometry, Matrix4, Object3D, Quaternion, Vector3, type BufferGeometry, type InstancedMesh, type Material, type Mesh } from 'three';
import { isCanvasEvent } from './events';
import type { KitPlacement, LabSlot, StaticScene } from './instancing';
import { LAB_SIZE, LAB_TYPES } from './layout';
import { LAB_STYLES } from './labStyles';

/** Props for the static world. */
interface StaticWorldProps {
  scene: StaticScene;
  onSelectLab: (sessionId: string, labId: string) => void;
  onHoverLab: (key: string | null) => void;
}

/** One drawable part of a kit model: its geometry, material and offset inside the model. */
interface KitPart {
  geometry: BufferGeometry;
  material: Material | Material[];
  matrix: Matrix4;
}

const HALF = LAB_SIZE / 2;
const WALL_HEIGHT = 1.5;
const WALL = 0.14;
const DOOR_HALF = 0.75;
const CREAM = '#fffaf0';
const GLASS_DARK = '#4a6470';
const WINDOW_LIT = '#ffcf7a';
const FLOOR_GLOW = '#ff9f1c';
const SEGMENT = HALF - DOOR_HALF;

/** Wall and trim boxes of a lab, lab-local: size and centre. */
const WALL_PIECES: ReadonlyArray<{ size: [number, number, number]; at: [number, number, number] }> = [
  { size: [LAB_SIZE, WALL_HEIGHT, WALL], at: [0, WALL_HEIGHT / 2, -HALF] },
  { size: [WALL, WALL_HEIGHT, LAB_SIZE], at: [-HALF, WALL_HEIGHT / 2, 0] },
  { size: [LAB_SIZE, 0.5, WALL], at: [0, 0.25, HALF] },
  { size: [WALL, WALL_HEIGHT, SEGMENT], at: [HALF, WALL_HEIGHT / 2, -(DOOR_HALF + SEGMENT / 2)] },
  { size: [WALL, WALL_HEIGHT, SEGMENT], at: [HALF, WALL_HEIGHT / 2, DOOR_HALF + SEGMENT / 2] },
];
const TRIM_PIECES: ReadonlyArray<{ size: [number, number, number]; at: [number, number, number] }> = [
  { size: [LAB_SIZE + 0.1, 0.08, WALL + 0.08], at: [0, WALL_HEIGHT + 0.04, -HALF] },
  { size: [WALL + 0.08, 0.08, LAB_SIZE + 0.1], at: [-HALF, WALL_HEIGHT + 0.04, 0] },
  { size: [LAB_SIZE + 0.1, 0.06, WALL + 0.06], at: [0, 0.53, HALF] },
];
const WINDOW_SIZE: [number, number, number] = [LAB_SIZE * 0.82, 0.32, 0.03];
const WINDOW_AT: [number, number, number] = [0, WALL_HEIGHT * 0.7, -HALF + WALL * 0.55];
const FLOOR_SIZE: [number, number, number] = [LAB_SIZE + 0.4, 0.16, LAB_SIZE + 0.4];
const FLOOR_AT: [number, number, number] = [0, -0.08, 0];
const GLOW_SIZE: [number, number, number] = [LAB_SIZE, 0.01, LAB_SIZE];
const GLOW_AT: [number, number, number] = [0, 0.005, 0];

/**
 * Everything that never moves, drawn with instancing so the whole world costs a few dozen draw
 * calls: lab floors (clickable), walls, window bands, all furniture, and every island's trees, rocks
 * and plants. Each distinct model part is one draw for the entire world.
 * @param props - the static scene and lab handlers
 * @returns the static world
 */
export function StaticWorld({ scene, onSelectLab, onHoverLab }: StaticWorldProps): ReactElement {
  const lit = useMemo(() => scene.labs.filter((lab) => lab.lit), [scene.labs]);
  const dark = useMemo(() => scene.labs.filter((lab) => !lab.lit), [scene.labs]);
  const byType = useMemo(() => LAB_TYPES.map((type) => [type, scene.labs.filter((lab) => lab.type === type)] as const), [scene.labs]);

  return (
    <group>
      {byType.map(([type, slots]) => (
        <group key={type}>
          <BoxInstances
            slots={slots}
            size={FLOOR_SIZE}
            at={FLOOR_AT}
            color={LAB_STYLES[type].floor}
            onSlotClick={(slot, event) => {
              if (isCanvasEvent(event.nativeEvent)) onSelectLab(slot.sessionId, slot.labId);
            }}
            onSlotHover={(slot) => onHoverLab(slot ? `${slot.sessionId}/${slot.labId}` : null)}
          />
          {TRIM_PIECES.map((trim, index) => (
            <BoxInstances key={index} slots={slots} size={trim.size} at={trim.at} color={LAB_STYLES[type].trim} />
          ))}
        </group>
      ))}
      <BoxInstances slots={lit} size={GLOW_SIZE} at={GLOW_AT} color={FLOOR_GLOW} glow={0.6} opacity={0.22} />
      {WALL_PIECES.map((wall, index) => (
        <BoxInstances key={index} slots={scene.labs} size={wall.size} at={wall.at} color={CREAM} shadows />
      ))}
      <BoxInstances slots={dark} size={WINDOW_SIZE} at={WINDOW_AT} color={GLASS_DARK} />
      <BoxInstances slots={lit} size={WINDOW_SIZE} at={WINDOW_AT} color={WINDOW_LIT} glow={1.6} />
      <KitInstances placements={scene.kit} />
    </group>
  );
}

/** Props for one instanced box shape repeated in many labs. */
interface BoxInstancesProps {
  slots: LabSlot[];
  size: [number, number, number];
  at: [number, number, number];
  color: string;
  glow?: number;
  opacity?: number;
  shadows?: boolean;
  onSlotClick?: (slot: LabSlot, event: ThreeEvent<MouseEvent>) => void;
  onSlotHover?: (slot: LabSlot | null) => void;
}

/**
 * One box shape placed in many labs as a single instanced draw, stretched to each lab's size.
 * @param props - labs, box size and lab-local centre, colour, glow and handlers
 * @returns the instanced boxes, or nothing when there are no labs
 */
function BoxInstances(props: BoxInstancesProps): ReactElement | null {
  const { slots, size, at, color, glow = 0, opacity, shadows = false } = props;
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(...size), [size]);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const upright = new Quaternion();
    slots.forEach((slot, index) => {
      position.set(slot.x + at[0] * slot.scale, at[1], slot.z + at[2] * slot.scale);
      scale.set(slot.scale, 1, slot.scale);
      matrix.compose(position, upright, scale);
      target.setMatrixAt(index, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [slots, at]);

  if (!slots.length) return null;
  const interactive = Boolean(props.onSlotClick || props.onSlotHover);
  const slotAt = (event: ThreeEvent<PointerEvent | MouseEvent>): LabSlot | undefined => (event.instanceId === undefined ? undefined : slots[event.instanceId]);
  return (
    <instancedMesh
      key={slots.length}
      ref={mesh}
      args={[geometry, undefined, slots.length]}
      castShadow={shadows}
      receiveShadow
      raycast={interactive ? undefined : ignoreRaycast}
      onClick={
        props.onSlotClick
          ? (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              const slot = slotAt(event);
              if (slot) props.onSlotClick?.(slot, event);
            }
          : undefined
      }
      onPointerMove={
        props.onSlotHover
          ? (event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              props.onSlotHover?.(slotAt(event) ?? null);
            }
          : undefined
      }
      onPointerOut={props.onSlotHover ? () => props.onSlotHover?.(null) : undefined}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        emissive={glow ? color : '#000000'}
        emissiveIntensity={glow}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        depthWrite={opacity === undefined}
      />
    </instancedMesh>
  );
}

/**
 * Every placed kit model, grouped by model, each model part drawn once for all its placements.
 * @param props - placements
 * @returns the instanced kit
 */
function KitInstances({ placements }: { placements: KitPlacement[] }): ReactElement {
  const byUrl = useMemo(() => {
    const groups = new Map<string, KitPlacement[]>();
    placements.forEach((item) => groups.set(item.url, [...(groups.get(item.url) ?? []), item]));
    return [...groups.entries()];
  }, [placements]);
  return (
    <group>
      {byUrl.map(([url, items]) => (
        <KitModelInstances key={url} url={url} items={items} />
      ))}
    </group>
  );
}

/**
 * All placements of one kit model.
 * @param props - model URL and its placements
 * @returns one instanced mesh per model part
 */
function KitModelInstances({ url, items }: { url: string; items: KitPlacement[] }): ReactElement {
  const { scene } = useGLTF(url);
  const parts = useMemo(() => modelParts(scene), [scene]);
  return (
    <group>
      {parts.map((part, index) => (
        <PartInstances key={`${index}-${items.length}`} part={part} items={items} />
      ))}
    </group>
  );
}

/**
 * One model part repeated at every placement.
 * @param props - the part and the placements
 * @returns the instanced part
 */
function PartInstances({ part, items }: { part: KitPart; items: KitPlacement[] }): ReactElement {
  const mesh = useRef<InstancedMesh>(null);
  const shadows = items.some((item) => item.shadow);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const placer = new Object3D();
    const matrix = new Matrix4();
    items.forEach((item, index) => {
      placer.position.set(item.x, item.y, item.z);
      placer.rotation.set(0, item.rotation, 0);
      placer.scale.setScalar(item.scale);
      placer.updateMatrix();
      matrix.multiplyMatrices(placer.matrix, part.matrix);
      target.setMatrixAt(index, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [items, part]);
  return <instancedMesh ref={mesh} args={[part.geometry, part.material, items.length]} castShadow={shadows} receiveShadow raycast={ignoreRaycast} />;
}

/**
 * The drawable parts of a model with their offsets inside it.
 * @param scene - loaded model scene
 * @returns parts
 */
function modelParts(scene: Object3D): KitPart[] {
  scene.updateMatrixWorld(true);
  const parts: KitPart[] = [];
  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material, matrix: mesh.matrixWorld.clone() });
  });
  return parts;
}

/**
 * A raycast that never hits, for meshes that must not catch clicks or hovers.
 * @returns nothing
 */
function ignoreRaycast(): void {
  return undefined;
}
