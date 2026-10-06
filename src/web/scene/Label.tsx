import { createContext, useContext, type ComponentProps, type ReactElement, type RefObject } from 'react';
import { Html } from '@react-three/drei';

/** The overlay element every floating label renders into. */
export const LabelLayerContext = createContext<RefObject<HTMLElement> | null>(null);

/**
 * A DOM label pinned to a 3D position. All labels render into one overlay that exists before the
 * scene mounts, so their container never changes under them, and clicks on them never reach the
 * 3D click handling.
 * @param props - drei Html props
 * @returns the label
 */
export function Label(props: ComponentProps<typeof Html>): ReactElement {
  const layer = useContext(LabelLayerContext);
  return <Html {...props} portal={layer ?? undefined} />;
}
