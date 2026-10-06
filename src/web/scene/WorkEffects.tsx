import { useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Station } from '../../shared/tools';

/** Colour of each station's experiment effect. */
const EFFECT_COLORS: Partial<Record<Station, string>> = {
  bench: '#ff5fa2',
  microscope: '#3fa9ff',
  library: '#ffd23f',
  portal: '#a77bff',
  terminal: '#3ddc84',
  helpdesk: '#ff9a3d',
};

const PUFF_COUNT = 4;
const PUFF_RISE = 0.9;
const BIT_COUNT = 5;
const DOT_COUNT = 3;

/**
 * The visible "experiment" a working scientist is running at its station: coloured smoke puffs at
 * the bench and research table, sparkles at the dispatch pad, and data bits rising at the terminal.
 * Rendered in the scientist's own space, in front of its hands.
 * @param props - station the scientist works at, and its height
 * @returns the effect, or nothing for stations without one
 */
export function WorkEffect({ station, height }: { station: Station; height: number }): ReactElement | null {
  const color = EFFECT_COLORS[station];
  if (!color) return null;
  const origin: [number, number, number] = [0, height * 0.75, 0.42];
  if (station === 'terminal') return <DataBits color={color} origin={origin} />;
  if (station === 'portal') return <Sparkles color={color} origin={origin} />;
  return <Puffs color={color} origin={origin} />;
}

/**
 * Three dots bobbing above a thinking scientist's head.
 * @param props - head height
 * @returns the dots
 */
export function ThinkingDots({ height }: { height: number }): ReactElement {
  const group = useRef<Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((dot, index) => {
      dot.position.y = Math.max(0, Math.sin(state.clock.elapsedTime * 4 - index * 0.7)) * 0.08;
    });
  });
  return (
    <group ref={group} position={[0, height + 0.55, 0]}>
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <mesh key={index} position={[(index - 1) * 0.11, 0, 0]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Soft coloured puffs that rise, grow and fade, then start again.
 * @param props - colour and starting point
 * @returns the puffs
 */
function Puffs({ color, origin }: { color: string; origin: [number, number, number] }): ReactElement {
  const group = useRef<Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((puff, index) => {
      const phase = (state.clock.elapsedTime * 0.7 + index / PUFF_COUNT) % 1;
      puff.position.set(Math.sin(index * 2.3 + phase * 3) * 0.08, phase * PUFF_RISE, Math.cos(index * 1.7) * 0.05);
      puff.scale.setScalar(0.4 + phase * 1.1);
      ((puff as Mesh).material as MeshStandardMaterial).opacity = 0.75 * (1 - phase);
    });
  });
  return (
    <group ref={group} position={origin}>
      {Array.from({ length: PUFF_COUNT }, (_, index) => (
        <mesh key={index}>
          <icosahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.6} depthWrite={false} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Small glowing cubes rising from a keyboard, like data going out.
 * @param props - colour and starting point
 * @returns the bits
 */
function DataBits({ color, origin }: { color: string; origin: [number, number, number] }): ReactElement {
  const group = useRef<Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((bit, index) => {
      const phase = (state.clock.elapsedTime * 0.9 + index / BIT_COUNT) % 1;
      bit.position.set((index - 2) * 0.07, phase * 0.7, 0);
      bit.rotation.set(phase * 4, phase * 6, 0);
      bit.visible = phase < 0.85;
    });
  });
  return (
    <group ref={group} position={origin}>
      {Array.from({ length: BIT_COUNT }, (_, index) => (
        <mesh key={index}>
          <boxGeometry args={[0.045, 0.045, 0.045]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Twinkling sparkles circling the dispatch pad.
 * @param props - colour and starting point
 * @returns the sparkles
 */
function Sparkles({ color, origin }: { color: string; origin: [number, number, number] }): ReactElement {
  const group = useRef<Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((spark, index) => {
      const angle = state.clock.elapsedTime * 1.6 + (index / BIT_COUNT) * Math.PI * 2;
      spark.position.set(Math.cos(angle) * 0.3, 0.15 + Math.sin(angle * 2) * 0.15, Math.sin(angle) * 0.3);
      spark.scale.setScalar(0.6 + Math.abs(Math.sin(angle * 3)) * 0.8);
    });
  });
  return (
    <group ref={group} position={[origin[0], origin[1] * 0.4, origin[2] * 0.3]}>
      {Array.from({ length: BIT_COUNT }, (_, index) => (
        <mesh key={index}>
          <octahedronGeometry args={[0.04, 0]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
