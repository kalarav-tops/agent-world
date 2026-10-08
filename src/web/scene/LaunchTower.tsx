import { useRef, type ReactElement } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { Island } from './Island';
import { Label } from './Label';
import { TOWER_RADIUS } from './layout';

const TOWER_HEIGHT = 9;
const BEACON_IDLE = '#3a4652';
const BEACON_LIT = '#e86fa8';

/**
 * The launch-tower island at the centre of the world: a lattice tower, a rocket on its pad, and a
 * beacon that flashes while an agent is waiting on you. Clicking it warps to the ship.
 * @param props - whether anyone is waiting, the motion preference and the click handler
 * @returns the island
 */
export function LaunchTower({ waiting, reducedMotion, onEnter }: { waiting: boolean; reducedMotion: boolean; onEnter: () => void }): ReactElement {
  const beacon = useRef<Mesh>(null);
  useFrame((state) => {
    const material = beacon.current?.material as MeshStandardMaterial | undefined;
    if (!material) return;
    const pulse = waiting && !reducedMotion ? 0.5 + Math.sin(state.clock.elapsedTime * 5) * 0.5 : 1;
    material.emissiveIntensity = waiting ? 0.6 + pulse * 2.4 : 0.2;
  });
  const enter = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    onEnter();
  };
  return (
    <group>
      <Island seed="launch-tower" radius={TOWER_RADIUS} onClick={enter} />
      <group position={[0, 0.6, 0]} onClick={enter}>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[2.4, 2.6, 0.3, 32]} />
          <meshStandardMaterial color="#5b6670" />
        </mesh>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[1.6 * sx, TOWER_HEIGHT / 2, 1.6 * sz - 0.4]}>
            <boxGeometry args={[0.18, TOWER_HEIGHT, 0.18]} />
            <meshStandardMaterial color="#c4553b" />
          </mesh>
        )))}
        {Array.from({ length: 6 }, (_, index) => (
          <mesh key={index} position={[0, 1 + index * 1.5, -0.4]}>
            <boxGeometry args={[3.4, 0.12, 3.4]} />
            <meshStandardMaterial color="#d9d4c7" wireframe />
          </mesh>
        ))}
        <group position={[0, 0.3, 0.9]}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 6, 24]} />
            <meshStandardMaterial color="#eef1ec" />
          </mesh>
          <mesh position={[0, 6.8, 0]}>
            <coneGeometry args={[0.7, 1.6, 24]} />
            <meshStandardMaterial color="#ff9f1c" />
          </mesh>
          {[0, 1, 2].map((index) => (
            <mesh key={index} position={[Math.cos((index * Math.PI * 2) / 3) * 0.8, 0.6, Math.sin((index * Math.PI * 2) / 3) * 0.8]} rotation={[0, (-index * Math.PI * 2) / 3, 0]}>
              <boxGeometry args={[0.6, 1.2, 0.08]} />
              <meshStandardMaterial color="#ff9f1c" />
            </mesh>
          ))}
        </group>
        <mesh ref={beacon} position={[0, TOWER_HEIGHT + 0.5, -0.4]}>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshStandardMaterial color={waiting ? BEACON_LIT : BEACON_IDLE} emissive={waiting ? BEACON_LIT : BEACON_IDLE} toneMapped={false} />
        </mesh>
      </group>
      <Label position={[0, TOWER_HEIGHT + 2.2, 0]} center zIndexRange={[12, 2]}>
        <button type="button" className="tower-tag" onClick={onEnter} aria-label="Fly to the command centre">
          Launch tower
        </button>
      </Label>
    </group>
  );
}
