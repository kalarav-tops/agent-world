import { useRef, type ReactElement, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { DoubleSide, type Mesh, type MeshStandardMaterial } from 'three';
import { Label } from '../scene/Label';

/**
 * The ship's bridge: a dark cockpit, a curved console under a wide window onto drifting stars, the
 * console screens, a light that flashes while an agent waits, and the lever back to the world.
 * @param props - whether anyone is waiting, the motion preference, the leave handler and the screens
 * @returns the bridge
 */
export function Bridge({ waiting, reducedMotion, onLeave, screens }: { waiting: boolean; reducedMotion: boolean; onLeave: () => void; screens: ReactNode }): ReactElement {
  const light = useRef<Mesh>(null);
  useFrame((state) => {
    const material = light.current?.material as MeshStandardMaterial | undefined;
    if (material) material.emissiveIntensity = waiting ? (reducedMotion ? 2 : 1 + Math.sin(state.clock.elapsedTime * 6) * 1.5) : 0.1;
  });
  return (
    <group>
      <ambientLight intensity={0.7} />
      <pointLight position={[0, 2.6, 1.5]} intensity={18} color="#ffd9a0" />
      <pointLight position={[0, 0.4, -1]} intensity={4} color="#ff9f1c" distance={4} />
      <Stars radius={120} depth={60} count={2500} factor={4} fade speed={reducedMotion ? 0 : 0.6} />
      <mesh position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#1a222b" />
      </mesh>
      <mesh position={[0, 1.4, -6]}>
        <cylinderGeometry args={[9, 9, 7, 48, 1, true, Math.PI * 1.25, Math.PI * 0.5]} />
        <meshStandardMaterial color="#1c252e" side={DoubleSide} transparent opacity={0.25} />
      </mesh>
      <mesh position={[0, -0.75, 1.2]}>
        <cylinderGeometry args={[3.2, 3.4, 0.9, 48, 1, false, Math.PI * 0.75, Math.PI * 0.5]} />
        <meshStandardMaterial color="#34424f" metalness={0.3} roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.28, 1.2]} rotation={[Math.PI / 2, 0, Math.PI * 1.25]}>
        <torusGeometry args={[3.25, 0.025, 8, 64, Math.PI * 0.5]} />
        <meshBasicMaterial color="#ff9f1c" toneMapped={false} />
      </mesh>
      <mesh ref={light} position={[2.2, -0.05, -1.9]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#e86fa8" emissive="#e86fa8" toneMapped={false} />
      </mesh>
      <group position={[-2.6, -0.3, -1.4]} onClick={onLeave}>
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, 0.35]}>
          <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
          <meshStandardMaterial color="#9aa8b6" />
        </mesh>
        <mesh position={[0.12, 0.62, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color="#ff9f1c" />
        </mesh>
      </group>
      <Label position={[0, 0.55, -2.2]} center transform distanceFactor={2.2} zIndexRange={[20, 10]}>
        <div className="console">{screens}</div>
      </Label>
    </group>
  );
}
