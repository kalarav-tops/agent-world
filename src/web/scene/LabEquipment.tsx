import { useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { LabType } from './layout';
import { DnaHelix, Gears, MiniRobot, MonitorPair, NewtonsCradle, PetriDishes, RobotArm, SpecimenJar, Telescope, TeslaCoil } from './ThemedEquipment';

/** Bright liquid colours used across the lab. */
const LIQUIDS = { pink: '#ff5fa2', green: '#3ddc84', blue: '#3fa9ff', orange: '#ff9a3d', yellow: '#ffd23f' } as const;
const GLASS = '#e8f6ff';
const METAL = '#b8c2c8';
const DARK = '#2f3a40';
const FLAME = '#ff8a1f';
const TELEPORT = '#a77bff';
const DESK_TOP = 0.84;
const TABLE_TOP = 0.82;
const BUBBLE_COUNT = 3;
const BUBBLE_RISE = 0.35;

/** Props for a lab's equipment. */
interface EquipmentProps {
  lit: boolean;
  animate: boolean;
  scale: number;
  type: LabType;
}

/**
 * The lab's science equipment, chosen by its type and spread to its size. Every type uses the same
 * anchors (workbench top, research table, side table, dispatch pad, terminal corner) so scientists'
 * work spots line up with something to work on. While the lab is lit, things bubble, spark, spin,
 * swing and blink.
 * @param props - whether the lab is lit and animated, its size and its type
 * @returns the equipment
 */
export function LabEquipment({ lit, animate, scale, type }: EquipmentProps): ReactElement {
  const live = lit && animate;
  const at = (x: number, y: number, z: number): [number, number, number] => [x * scale, y, z * scale];
  return (
    <group>
      <TeleportPad position={at(2.2, 0.02, -1.7)} lit={lit} animate={animate} />
      {type === 'chemistry' && (
        <>
          <Flask position={at(-2.1, DESK_TOP, -2.55)} color={LIQUIDS.pink} bubbling={live} />
          <Flask position={at(-2.0, DESK_TOP, -2.25)} color={LIQUIDS.green} bubbling={live} scale={0.8} />
          <Beaker position={at(-0.95, DESK_TOP, -2.5)} color={LIQUIDS.blue} bubbling={live} />
          <Microscope position={at(0.3, TABLE_TOP, -2.4)} />
          <TestTubeRack position={at(0.95, TABLE_TOP, -2.25)} />
          <BunsenBurner position={at(1.75, DESK_TOP, -2.55)} lit={lit} animate={animate} />
          <Flask position={[1.75 * scale, DESK_TOP + 0.38, -2.55 * scale]} color={LIQUIDS.orange} bubbling={live} scale={0.6} />
          <ServerRack position={at(2.65, 0, 2.55)} lit={lit} animate={animate} />
        </>
      )}
      {type === 'biology' && (
        <>
          <SpecimenJar position={at(-2.1, DESK_TOP, -2.5)} color={LIQUIDS.green} />
          <SpecimenJar position={at(-0.95, DESK_TOP, -2.5)} color={LIQUIDS.yellow} scale={0.8} />
          <Microscope position={at(0.3, TABLE_TOP, -2.4)} />
          <PetriDishes position={at(0.85, TABLE_TOP, -2.3)} />
          <SpecimenJar position={at(1.75, DESK_TOP, -2.55)} color={LIQUIDS.pink} scale={1.2} />
          <DnaHelix position={at(2.6, 0, 2.5)} live={live} />
        </>
      )}
      {type === 'physics' && (
        <>
          <NewtonsCradle position={at(-2.05, DESK_TOP, -2.45)} live={live} />
          <Telescope position={at(-0.9, DESK_TOP, -2.45)} />
          <NewtonsCradle position={at(0.6, TABLE_TOP, -2.3)} live={live} />
          <TeslaCoil position={at(1.75, DESK_TOP, -2.55)} live={live} scale={0.5} />
          <TeslaCoil position={at(2.55, 0, 2.5)} live={live} />
        </>
      )}
      {type === 'computer' && (
        <>
          <MonitorPair position={at(-1.0, DESK_TOP, -2.55)} live={live} />
          <MonitorPair position={at(0.6, TABLE_TOP, -2.35)} live={live} />
          <MonitorPair position={at(1.85, DESK_TOP, -2.6)} live={live} />
          <ServerRack position={at(2.65, 0, 2.55)} lit={lit} animate={animate} />
        </>
      )}
      {type === 'robotics' && (
        <>
          <MiniRobot position={at(-2.05, DESK_TOP, -2.45)} live={live} />
          <Gears position={at(-0.95, DESK_TOP, -2.45)} live={live} />
          <RobotArm position={at(0.6, TABLE_TOP, -2.3)} live={live} scale={0.6} />
          <MiniRobot position={at(1.75, DESK_TOP, -2.55)} live={live} />
          <RobotArm position={at(2.5, 0, 2.45)} live={live} scale={1.3} />
        </>
      )}
    </group>
  );
}

/**
 * A conical flask of coloured liquid, bubbling while the lab works.
 * @param props - placement, liquid colour, size and bubbling
 * @returns the flask
 */
function Flask({ position, color, bubbling, scale = 1 }: { position: [number, number, number]; color: string; bubbling: boolean; scale?: number }): ReactElement {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.06, 0.17, 0.34, 14]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.35} depthWrite={false} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.155, 0.19, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={bubbling ? 0.45 : 0.15} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.41, 0]}>
        <cylinderGeometry args={[0.05, 0.055, 0.14, 12]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {bubbling && <Bubbles color={color} height={0.42} />}
    </group>
  );
}

/**
 * An open beaker of liquid with measuring lines.
 * @param props - placement, liquid colour and bubbling
 * @returns the beaker
 */
function Beaker({ position, color, bubbling }: { position: [number, number, number]; color: string; bubbling: boolean }): ReactElement {
  return (
    <group position={position}>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.14, 0.13, 0.32, 16, 1, true]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.35} depthWrite={false} side={2} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.125, 0.125, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={bubbling ? 0.45 : 0.15} />
      </mesh>
      {[0.12, 0.2].map((height) => (
        <mesh key={height} position={[0, height, 0.135]}>
          <boxGeometry args={[0.07, 0.008, 0.005]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      {bubbling && <Bubbles color={color} height={0.36} />}
    </group>
  );
}

/**
 * Small bubbles rising through a liquid and starting over at the bottom.
 * @param props - bubble colour and how high they rise
 * @returns the bubbles
 */
function Bubbles({ color, height }: { color: string; height: number }): ReactElement {
  const group = useRef<Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((bubble, index) => {
      const phase = (state.clock.elapsedTime * 0.6 + index / BUBBLE_COUNT) % 1;
      bubble.position.set(Math.sin(index * 2.1) * 0.04, 0.05 + phase * (height + BUBBLE_RISE * 0.3), Math.cos(index * 2.1) * 0.04);
      bubble.scale.setScalar(1 - phase * 0.5);
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: BUBBLE_COUNT }, (_, index) => (
        <mesh key={index}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A desktop microscope: base, arm, stage and eyepiece tube.
 * @param props - placement
 * @returns the microscope
 */
function Microscope({ position }: { position: [number, number, number] }): ReactElement {
  return (
    <group position={position} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.26, 0.06, 0.32]} />
        <meshStandardMaterial color="#f4f6f8" />
      </mesh>
      <mesh position={[0, 0.25, -0.1]}>
        <boxGeometry args={[0.08, 0.4, 0.08]} />
        <meshStandardMaterial color="#f4f6f8" />
      </mesh>
      <mesh position={[0, 0.16, 0.03]}>
        <boxGeometry args={[0.2, 0.025, 0.16]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.36, 0.02]} rotation={[0.45, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.3, 12]} />
        <meshStandardMaterial color={LIQUIDS.blue} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.52, -0.06]} rotation={[0.45, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  );
}

/**
 * A rack of test tubes, each with a different bright liquid.
 * @param props - placement
 * @returns the rack
 */
function TestTubeRack({ position }: { position: [number, number, number] }): ReactElement {
  const colors = [LIQUIDS.pink, LIQUIDS.yellow, LIQUIDS.green, LIQUIDS.blue];
  return (
    <group position={position} rotation={[0, -0.3, 0]}>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.42, 0.04, 0.12]} />
        <meshStandardMaterial color={LIQUIDS.orange} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.42, 0.03, 0.12]} />
        <meshStandardMaterial color={LIQUIDS.orange} />
      </mesh>
      {colors.map((color, index) => {
        const x = -0.15 + index * 0.1;
        return (
          <group key={color} position={[x, 0, 0]}>
            <mesh position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.26, 10]} />
              <meshStandardMaterial color={GLASS} transparent opacity={0.4} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.021, 0.021, 0.13, 10]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * A Bunsen burner on a stand; its flame burns while the lab is lit.
 * @param props - placement, whether lit, whether to animate
 * @returns the burner
 */
function BunsenBurner({ position, lit, animate }: { position: [number, number, number]; lit: boolean; animate: boolean }): ReactElement {
  const flame = useRef<Mesh>(null);
  useFrame((state) => {
    if (!flame.current || !animate) return;
    const flicker = 1 + Math.sin(state.clock.elapsedTime * 18) * 0.12;
    flame.current.scale.set(1, flicker, 1);
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.09, 0.1, 0.04, 12]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.22, 10]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.35} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.13, 0.18, Math.sin(angle) * 0.13]}>
          <cylinderGeometry args={[0.008, 0.008, 0.36, 6]} />
          <meshStandardMaterial color={METAL} />
        </mesh>
      ))}
      {lit && (
        <mesh ref={flame} position={[0, 0.3, 0]}>
          <coneGeometry args={[0.035, 0.12, 10]} />
          <meshBasicMaterial color={FLAME} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The dispatch pad where agents are sent out: a ring that glows and slowly pulses while lit.
 * @param props - placement, whether lit, whether to animate
 * @returns the pad
 */
function TeleportPad({ position, lit, animate }: { position: [number, number, number]; lit: boolean; animate: boolean }): ReactElement {
  const glow = useRef<Mesh>(null);
  useFrame((state) => {
    if (!glow.current || !animate) return;
    const material = glow.current.material as MeshStandardMaterial;
    material.emissiveIntensity = 0.8 + Math.sin(state.clock.elapsedTime * 3) * 0.4;
  });
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.3, 0.44, 32]} />
        <meshStandardMaterial color={TELEPORT} emissive={TELEPORT} emissiveIntensity={lit ? 0.8 : 0.05} />
      </mesh>
    </group>
  );
}

/**
 * A server rack whose status lights blink while the lab is lit.
 * @param props - placement, whether lit, whether to animate
 * @returns the rack
 */
function ServerRack({ position, lit, animate }: { position: [number, number, number]; lit: boolean; animate: boolean }): ReactElement {
  const lights = useRef<Group>(null);
  useFrame((state) => {
    if (!lights.current || !lit || !animate) return;
    lights.current.children.forEach((light, index) => {
      light.visible = Math.sin(state.clock.elapsedTime * (3 + index * 1.7) + index) > -0.3;
    });
  });
  const colors = [LIQUIDS.green, LIQUIDS.blue, LIQUIDS.green, LIQUIDS.orange, LIQUIDS.green, LIQUIDS.blue];
  return (
    <group position={position}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[0.45, 1.7, 0.55]} />
        <meshStandardMaterial color={DARK} roughness={0.6} />
      </mesh>
      {[0.3, 0.6, 0.9, 1.2, 1.5].map((height) => (
        <mesh key={height} position={[-0.23, height, 0]}>
          <boxGeometry args={[0.01, 0.2, 0.48]} />
          <meshStandardMaterial color="#45535a" />
        </mesh>
      ))}
      <group ref={lights}>
        {colors.map((color, index) => (
          <mesh key={index} position={[-0.24, 0.35 + index * 0.24, 0.15]}>
            <boxGeometry args={[0.01, 0.03, 0.05]} />
            <meshBasicMaterial color={lit ? color : '#3a464c'} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
