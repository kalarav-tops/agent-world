import { useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshBasicMaterial } from 'three';

type Vec3 = [number, number, number];

const GLASS = '#e8f6ff';
const METAL = '#b8c2c8';
const DARK = '#2f3a40';
const WHITE = '#f4f6f8';
const SPARK = '#b8e4ff';
const HELIX_PAIRS = 10;
const CRADLE_BALLS = 5;

/** Placement plus whether the lab is busy and allowed to animate. */
interface PieceProps {
  position: Vec3;
  live: boolean;
}

/**
 * A specimen jar of tinted liquid with something leafy floating inside.
 * @param props - placement and liquid colour
 * @returns the jar
 */
export function SpecimenJar({ position, color, scale = 1 }: { position: Vec3; color: string; scale?: number }): ReactElement {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.34, 16]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.105, 0.105, 0.26, 16]} />
        <meshStandardMaterial color={color} transparent opacity={0.75} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0.4, 0.6, 0]}>
        <octahedronGeometry args={[0.06, 0]} />
        <meshStandardMaterial color="#2f9e57" flatShading />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.125, 0.125, 0.04, 16]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  );
}

/**
 * A pair of petri dishes with coloured cultures.
 * @param props - placement
 * @returns the dishes
 */
export function PetriDishes({ position }: { position: Vec3 }): ReactElement {
  return (
    <group position={position}>
      {[
        [0, 0, '#ffd23f'],
        [0.2, 0.08, '#ff5fa2'],
      ].map(([x, z, color]) => (
        <group key={String(color)} position={[Number(x), 0, Number(z)]}>
          <mesh position={[0, 0.015, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.03, 18]} />
            <meshStandardMaterial color={GLASS} transparent opacity={0.45} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.012, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.012, 18]} />
            <meshStandardMaterial color={String(color)} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * A slowly turning DNA double helix on a stand.
 * @param props - placement and whether to turn
 * @returns the helix
 */
export function DnaHelix({ position, live }: PieceProps): ReactElement {
  const helix = useRef<Group>(null);
  useFrame((_, delta) => {
    if (live && helix.current) helix.current.rotation.y += delta * 0.6;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.1, 18]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <group ref={helix} position={[0, 0.2, 0]}>
        {Array.from({ length: HELIX_PAIRS }, (_, index) => {
          const angle = index * 0.62;
          const y = index * 0.13;
          return (
            <group key={index} position={[0, y, 0]} rotation={[0, angle, 0]}>
              <mesh position={[0.18, 0, 0]}>
                <sphereGeometry args={[0.05, 10, 8]} />
                <meshStandardMaterial color="#3fa9ff" emissive="#3fa9ff" emissiveIntensity={live ? 0.4 : 0.1} />
              </mesh>
              <mesh position={[-0.18, 0, 0]}>
                <sphereGeometry args={[0.05, 10, 8]} />
                <meshStandardMaterial color="#ff5fa2" emissive="#ff5fa2" emissiveIntensity={live ? 0.4 : 0.1} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
                <meshStandardMaterial color={WHITE} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/**
 * A Newton's cradle: the end balls swing and knock while the lab works.
 * @param props - placement and whether to swing
 * @returns the cradle
 */
export function NewtonsCradle({ position, live }: PieceProps): ReactElement {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  useFrame((state) => {
    if (!live) return;
    const swing = Math.sin(state.clock.elapsedTime * 4.5);
    if (left.current) left.current.rotation.z = Math.min(0, swing) * 0.7;
    if (right.current) right.current.rotation.z = Math.max(0, swing) * 0.7;
  });
  const spacing = 0.075;
  return (
    <group position={position}>
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.5, 0.03, 0.22]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.16, 0]}>
          <boxGeometry args={[0.02, 0.3, 0.2]} />
          <meshStandardMaterial color={METAL} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.46, 0.015, 0.02]} />
        <meshStandardMaterial color={METAL} />
      </mesh>
      {Array.from({ length: CRADLE_BALLS }, (_, index) => {
        const x = (index - (CRADLE_BALLS - 1) / 2) * spacing;
        const ref = index === 0 ? left : index === CRADLE_BALLS - 1 ? right : undefined;
        return (
          <group key={index} ref={ref} position={[x, 0.31, 0]}>
            <mesh position={[0, -0.09, 0]}>
              <cylinderGeometry args={[0.003, 0.003, 0.18, 4]} />
              <meshBasicMaterial color="#d0d6da" />
            </mesh>
            <mesh position={[0, -0.2, 0]}>
              <sphereGeometry args={[0.035, 12, 10]} />
              <meshStandardMaterial color={WHITE} metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * A Tesla coil whose top crackles with sparks while the lab works.
 * @param props - placement, whether busy, and size
 * @returns the coil
 */
export function TeslaCoil({ position, live, scale = 1 }: PieceProps & { scale?: number }): ReactElement {
  const sparks = useRef<Group>(null);
  useFrame((state) => {
    if (!sparks.current) return;
    sparks.current.visible = live;
    if (!live) return;
    sparks.current.children.forEach((spark, index) => {
      const flicker = Math.sin(state.clock.elapsedTime * (23 + index * 7) + index * 2);
      spark.visible = flicker > -0.2;
      spark.rotation.set(flicker, index * 1.3 + state.clock.elapsedTime * 3, flicker * 0.5);
      ((spark as Mesh).material as MeshBasicMaterial).opacity = 0.5 + Math.abs(flicker) * 0.5;
    });
  });
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.12, 16]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.8, 16]} />
        <meshStandardMaterial color="#c47a3a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <torusGeometry args={[0.16, 0.06, 10, 22]} />
        <meshStandardMaterial color={METAL} metalness={0.8} roughness={0.2} />
      </mesh>
      <group ref={sparks} position={[0, 0.98, 0]}>
        {Array.from({ length: 4 }, (_, index) => (
          <mesh key={index} position={[0, 0, 0]}>
            <boxGeometry args={[0.6, 0.012, 0.012]} />
            <meshBasicMaterial color={SPARK} transparent opacity={0.9} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * A small telescope on a tripod, pointing up and out.
 * @param props - placement
 * @returns the telescope
 */
export function Telescope({ position }: { position: Vec3 }): ReactElement {
  return (
    <group position={position} rotation={[0, -0.6, 0]}>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.08, 0.13, Math.sin(angle) * 0.08]} rotation={[Math.sin(angle) * 0.3, 0, -Math.cos(angle) * 0.3]}>
          <cylinderGeometry args={[0.008, 0.008, 0.28, 5]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
      ))}
      <mesh position={[0, 0.32, 0]} rotation={[0, 0, Math.PI / 3]}>
        <cylinderGeometry args={[0.045, 0.06, 0.4, 14]} />
        <meshStandardMaterial color="#2f8cff" metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Two monitors side by side showing glowing code while the lab works.
 * @param props - placement and whether busy
 * @returns the monitors
 */
export function MonitorPair({ position, live }: PieceProps): ReactElement {
  return (
    <group position={position}>
      {[-0.22, 0.22].map((x, index) => (
        <group key={x} position={[x, 0, 0]} rotation={[0, index ? -0.25 : 0.25, 0]}>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.08, 0.12, 0.06]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[0.38, 0.24, 0.03]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh position={[0, 0.25, 0.017]}>
            <planeGeometry args={[0.34, 0.2]} />
            <meshBasicMaterial color={live ? (index ? '#3ddc84' : '#7fd1ff') : '#33424a'} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * A robot arm on a turning base whose joints move while the lab works.
 * @param props - placement, whether busy, and size
 * @returns the arm
 */
export function RobotArm({ position, live, scale = 1 }: PieceProps & { scale?: number }): ReactElement {
  const base = useRef<Group>(null);
  const elbow = useRef<Group>(null);
  useFrame((state) => {
    if (!live) return;
    const time = state.clock.elapsedTime;
    if (base.current) base.current.rotation.y = Math.sin(time * 0.8) * 1.2;
    if (elbow.current) elbow.current.rotation.z = -0.9 + Math.sin(time * 1.6) * 0.4;
  });
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.1, 18]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <group ref={base} position={[0, 0.1, 0]}>
        <mesh position={[0, 0.18, 0]} rotation={[0, 0, 0.35]}>
          <boxGeometry args={[0.09, 0.4, 0.09]} />
          <meshStandardMaterial color="#f2b705" />
        </mesh>
        <group ref={elbow} position={[-0.07, 0.36, 0]}>
          <mesh>
            <sphereGeometry args={[0.065, 12, 10]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh position={[0.17, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.07, 0.32, 0.07]} />
            <meshStandardMaterial color="#f2b705" />
          </mesh>
          <mesh position={[0.35, 0, 0]}>
            <boxGeometry args={[0.05, 0.1, 0.1]} />
            <meshStandardMaterial color={METAL} metalness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * A small boxy robot whose eyes blink while the lab works.
 * @param props - placement and whether busy
 * @returns the robot
 */
export function MiniRobot({ position, live }: PieceProps): ReactElement {
  const eyes = useRef<Group>(null);
  useFrame((state) => {
    if (eyes.current) eyes.current.visible = !live || Math.sin(state.clock.elapsedTime * 2.2) > -0.85;
  });
  return (
    <group position={position} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.18, 0.16, 0.14]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.16, 0.12, 0.13]} />
        <meshStandardMaterial color="#ffd23f" />
      </mesh>
      <group ref={eyes} position={[0, 0.26, 0.066]}>
        {[-0.04, 0.04].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <circleGeometry args={[0.018, 10]} />
            <meshBasicMaterial color={live ? '#3fa9ff' : '#33424a'} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.08, 4]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
    </group>
  );
}

/**
 * A pair of meshing gears lying on a table.
 * @param props - placement and whether to turn
 * @returns the gears
 */
export function Gears({ position, live }: PieceProps): ReactElement {
  const big = useRef<Mesh>(null);
  const small = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!live) return;
    if (big.current) big.current.rotation.y += delta * 0.8;
    if (small.current) small.current.rotation.y -= delta * 1.4;
  });
  return (
    <group position={position}>
      <mesh ref={big} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 10]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} flatShading />
      </mesh>
      <mesh ref={small} position={[0.19, 0.02, 0.02]}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 8]} />
        <meshStandardMaterial color="#f2b705" metalness={0.4} flatShading />
      </mesh>
    </group>
  );
}
