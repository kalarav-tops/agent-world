import { useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type InstancedMesh } from 'three';

const STARS = 900;
const DEPTH = 240;

/**
 * Stars streaking past the camera; the faster the warp, the longer the streaks.
 * @param props - speed from 0 (drifting) to 1 (full warp)
 * @returns the tunnel
 */
export function WarpTunnel({ speed }: { speed: number }): ReactElement {
  const mesh = useRef<InstancedMesh>(null);
  const stars = useMemo(
    () => Array.from({ length: STARS }, (_, index) => {
      const angle = (index * 2.399963) % (Math.PI * 2);
      const radius = 2 + ((index * 7919) % 1000) / 1000 * 14;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: -((index * 104729) % DEPTH) };
    }),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const step = (20 + speed * 220) * Math.min(delta, 0.1);
    stars.forEach((star, index) => {
      star.z += step;
      if (star.z > 2) star.z -= DEPTH;
      dummy.position.set(star.x, star.y, star.z);
      dummy.scale.set(1, 1, 1 + speed * 60);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, STARS]}>
      <boxGeometry args={[0.05, 0.05, 0.12]} />
      <meshBasicMaterial color="#dfe9ff" toneMapped={false} />
    </instancedMesh>
  );
}
