import type { ReactElement } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { isCanvasEvent } from './events';
import { Label } from './Label';
import { LabEquipment } from './LabEquipment';
import type { LabType } from './layout';

/** Props for the furniture inside a detailed lab. */
interface StationsProps {
  lit: boolean;
  animate: boolean;
  scale: number;
  type: LabType;
  changeCount: number;
  showBadge: boolean;
  onOpenChanges: () => void;
}

const QUARTER = Math.PI / 2;
const SCREEN_GLOW = '#9fe3ff';

/**
 * The live parts of a lab's stations: the science equipment and the wall screen, which glows while
 * the lab works and opens the changes board when clicked. Furniture is drawn by StaticWorld.
 * @param props - whether the lab is lit and animated, its size and type, and the changes-board count
 * @returns the furniture
 */
export function Stations({ lit, animate, scale, type, changeCount, showBadge, onOpenChanges }: StationsProps): ReactElement {
  const openChanges = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    if (isCanvasEvent(event.nativeEvent)) onOpenChanges();
  };

  return (
    <group>
      <LabEquipment lit={lit} animate={animate} scale={scale} type={type} />
      <group position={[-2.85 * scale, 0.75, 1.75 * scale]} onClick={openChanges}>
        <mesh position={[0.18, 0.5, 0]} rotation={[0, QUARTER, 0]}>
          <planeGeometry args={[1.25, 0.72]} />
          <meshStandardMaterial color={lit ? SCREEN_GLOW : '#2c3e46'} emissive={lit ? SCREEN_GLOW : '#000000'} emissiveIntensity={lit ? 0.8 : 0} />
        </mesh>
        {showBadge && (
          <Label position={[0.3, 1.45, 0]} center zIndexRange={[10, 0]}>
            <button type="button" className="board-badge" onClick={onOpenChanges}>
              {changeCount === 1 ? '1 change' : `${changeCount} changes`}
            </button>
          </Label>
        )}
      </group>
    </group>
  );
}
