import { useMemo, type ReactElement } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { ExtrudeGeometry, Shape } from 'three';
import { seeded } from './assets';

/** Props for one island. */
interface IslandProps {
  seed: string;
  radius: number;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}

const GRASS = '#5fc24a';
const EARTH = '#c98a4b';
const SAND = '#ffd98a';
const FOAM = '#ffffff';
const ISLAND_DEPTH = 1.4;
const TOP_BEVEL = 0.5;
/** Bevel height as a share of bevel size; the bevel adds this much height above the extrusion. */
const BEVEL_RISE = 0.6;
/** The grass surface sits just under lab floors and highlight rings, which rest at y = 0. */
const GRASS_LEVEL = -0.03;
const OUTLINE_POINTS = 64;


/**
 * A grassy island with an earthy bank, a sandy beach and a foam line. Its outline is seeded by the
 * session, so each continent keeps its own shape; trees and rocks are drawn by StaticWorld.
 * @param props - seed, radius and click handler
 * @returns the island
 */
export function Island({ seed, radius, onClick }: IslandProps): ReactElement {
  const top = useMemo(() => islandGeometry(radius, seed, ISLAND_DEPTH, TOP_BEVEL), [radius, seed]);
  const beach = useMemo(() => islandGeometry(radius * 1.08, seed, 0.5, 0.3), [radius, seed]);

  return (
    <group>
      <mesh geometry={top} rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_LEVEL - ISLAND_DEPTH - TOP_BEVEL * BEVEL_RISE, 0]} onClick={onClick} receiveShadow>
        <meshStandardMaterial attach="material-0" color={GRASS} roughness={0.95} flatShading />
        <meshStandardMaterial attach="material-1" color={EARTH} roughness={1} flatShading />
      </mesh>
      <mesh geometry={beach} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]} receiveShadow>
        <meshStandardMaterial attach="material-0" color={SAND} roughness={1} flatShading />
        <meshStandardMaterial attach="material-1" color={SAND} roughness={1} flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.17, 0]}>
        <ringGeometry args={[radius * 1.14, radius * 1.22, 64]} />
        <meshBasicMaterial color={FOAM} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * An extruded, gently wobbly island outline. Cap faces use material 0, sides material 1.
 * @param radius - average radius
 * @param seed - outline seed
 * @param depth - extrusion depth
 * @param bevel - bevel size, rounding the top edge
 * @returns geometry lying in XY, extruded along +Z
 */
function islandGeometry(radius: number, seed: string, depth: number, bevel: number): ExtrudeGeometry {
  const phaseA = seeded(seed, 1) * Math.PI * 2;
  const phaseB = seeded(seed, 2) * Math.PI * 2;
  const shape = new Shape();
  for (let index = 0; index <= OUTLINE_POINTS; index += 1) {
    const angle = (index / OUTLINE_POINTS) * Math.PI * 2;
    const wobble = 1 + 0.07 * Math.sin(3 * angle + phaseA) + 0.04 * Math.sin(5 * angle + phaseB);
    const x = Math.cos(angle) * radius * wobble;
    const y = Math.sin(angle) * radius * wobble;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel * BEVEL_RISE, bevelSegments: 2, curveSegments: 4 });
}
