import { useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, type DirectionalLight, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from 'three';

/** Bright daytime palette: clear blue sky, ocean blue sea. */
export const SKY_TOP = '#3fa2f0';
export const SKY_HORIZON = '#cfeeff';
const SEA = '#1aa3e0';
const SUN = '#fff1d6';
const SUN_OFFSET: [number, number, number] = [55, 70, 35];
const SHADOW_EXTENT = 45;

/**
 * Sky dome fading from clear blue overhead to a pale horizon.
 * @returns the sky
 */
export function Sky(): ReactElement {
  const uniforms = useMemo(() => ({ top: { value: new Color(SKY_TOP) }, horizon: { value: new Color(SKY_HORIZON) } }), []);
  return (
    <mesh scale={1800} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={`varying float vHeight; void main() { vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform vec3 top; uniform vec3 horizon; varying float vHeight; void main() { float t = smoothstep(-0.05, 0.55, vHeight); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }`}
      />
    </mesh>
  );
}

/**
 * The sea: a wide, gently glinting plane whose colour slowly breathes.
 * @param props - whether to animate
 * @returns the sea
 */
export function Sea({ animate }: { animate: boolean }): ReactElement {
  const mesh = useRef<Mesh>(null);
  const base = useMemo(() => new Color(SEA), []);
  useFrame((state) => {
    if (!animate || !mesh.current) return;
    const material = mesh.current.material as MeshStandardMaterial;
    const shift = Math.sin(state.clock.elapsedTime * 0.4) * 0.03;
    material.color.copy(base).offsetHSL(0, 0, shift);
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.25, 0]} receiveShadow>
      <circleGeometry args={[1600, 64]} />
      <meshStandardMaterial color={SEA} roughness={0.25} metalness={0.15} />
    </mesh>
  );
}

/**
 * A bright sun whose shadow area follows the point the camera looks at, so shadows stay crisp
 * wherever you look without a huge shadow map.
 * @returns the sun and soft fill lights
 */
export function Sunlight(): ReactElement {
  const sun = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);
  const lookAt = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    if (!sun.current || !target.current) return;
    const controls = state.controls as { getTarget?: (out: Vector3) => Vector3 } | null;
    if (controls?.getTarget) controls.getTarget(lookAt);
    target.current.position.set(lookAt.x, 0, lookAt.z);
    sun.current.position.set(lookAt.x + SUN_OFFSET[0], SUN_OFFSET[1], lookAt.z + SUN_OFFSET[2]);
    sun.current.target = target.current;
  });
  return (
    <>
      <hemisphereLight args={['#e6f4ff', '#7aa35a', 1.25]} />
      <object3D ref={target} />
      <directionalLight
        ref={sun}
        color={SUN}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={250}
      />
    </>
  );
}
