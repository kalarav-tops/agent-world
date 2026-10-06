import type { WorldSummary } from '../../shared/types';
import { FURNITURE, furnitureUrl, KIT_SCALE, NATURE, natureUrl, seeded } from './assets';
import { LAB_SIZE, sessionLayout, type GridCell, type LabType, type Placement } from './layout';

/** One static kit model placed in the world (or in lab-local space for LAB_FURNITURE). */
export interface KitPlacement {
  url: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  shadow: boolean;
}

/** A lab's position in the world. */
export interface LabSlot {
  sessionId: string;
  labId: string;
  x: number;
  z: number;
  lit: boolean;
  scale: number;
  type: LabType;
}

/** Everything static in the world, ready to draw with instancing. */
export interface StaticScene {
  labs: LabSlot[];
  kit: KitPlacement[];
}

const QUARTER = Math.PI / 2;
const DESK_TOP = 0.84;
const DECOR_PER_AREA = 0.022;
const DECOR_MAX = 90;
const LAB_AREA_MARGIN = 2;
/** Extra clear ground in front of the labs, where the camera looks from. */
const FRONT_MARGIN = 4;

/**
 * Builds a lab-local furniture placement.
 * @param name - furniture model name
 * @param x - lab-local x
 * @param y - height
 * @param z - lab-local z
 * @param rotation - turn around y, radians
 * @returns placement
 */
const piece = (name: string, x: number, y: number, z: number, rotation = 0): KitPlacement => ({
  url: furnitureUrl(name),
  x,
  y,
  z,
  rotation,
  scale: KIT_SCALE,
  shadow: true,
});

/** The furniture in every lab, in lab-local coordinates (door on the +x wall). */
export const LAB_FURNITURE: readonly KitPlacement[] = [
  piece(FURNITURE.desk, -1.5, 0, -2.6),
  piece(FURNITURE.screen, -1.5, DESK_TOP, -2.75),
  piece(FURNITURE.keyboard, -1.5, DESK_TOP, -2.35),
  piece(FURNITURE.chair, -0.75, 0, -2.0, Math.PI * 0.85),
  piece(FURNITURE.roundTable, 0.6, 0.6, -2.3),
  piece(FURNITURE.sideTable, 2.2, 0, -2.6),
  piece(FURNITURE.radio, 2.4, DESK_TOP, -2.65),
  piece(FURNITURE.bookcase, -2.65, 0, -0.55, QUARTER),
  piece(FURNITURE.bookcase, -2.65, 0, 0.45, QUARTER),
  piece(FURNITURE.television, -2.85, 0.75, 1.75, QUARTER),
  piece(FURNITURE.desk, 1.6, 0, 2.6, Math.PI),
  piece(FURNITURE.laptop, 1.5, DESK_TOP, 2.65, Math.PI),
  piece(FURNITURE.tableLamp, 2.2, DESK_TOP, 2.65),
  piece(FURNITURE.sideTable, 2.65, 0, -1.15, -QUARTER),
  piece(FURNITURE.smallPlant, 2.65, DESK_TOP, -1.35),
  piece(FURNITURE.plant, 2.6, 0, 1.4),
  piece(FURNITURE.floorLamp, -2.6, 0, -2.6),
  piece(FURNITURE.box, -2.55, 0, 2.6, 0.4),
];

/**
 * All static objects of the world: every lab's position, size, type and lit state, every lab's
 * furniture spread to that lab's size and moved to it, and every island's trees, rocks and plants.
 * @param world - world summary
 * @param placements - continent placements, in session order
 * @returns the static scene
 */
export function staticScene(world: WorldSummary, placements: Placement[]): StaticScene {
  const labs: LabSlot[] = [];
  const kit: KitPlacement[] = [];
  world.sessions.forEach((session, index) => {
    const placement = placements[index];
    if (!placement) return;
    const layout = sessionLayout(session.labs);
    session.labs.forEach((lab, labIndex) => {
      const cell = layout.cells[labIndex];
      if (!cell) return;
      const x = placement.x + cell.x;
      const z = placement.z + cell.z;
      const scale = layout.scales[labIndex] ?? 1;
      labs.push({ sessionId: session.sessionId, labId: lab.id, x, z, lit: lab.active, scale, type: layout.types[labIndex] ?? 'chemistry' });
      LAB_FURNITURE.forEach((item) => kit.push({ ...item, x: x + item.x * scale, z: z + item.z * scale }));
    });
    const labHalf = (LAB_SIZE / 2) * Math.max(1, ...layout.scales);
    decorate(session.sessionId, placement.radius, layout.cells, labHalf).forEach((item) => kit.push({ ...item, x: placement.x + item.x, z: placement.z + item.z }));
  });
  return { labs, kit };
}

/**
 * Seeded scatter of trees, rocks and plants on an island, keeping the lab area clear.
 * @param seed - scatter seed (the session id)
 * @param radius - island radius
 * @param labCells - lab centres, island-local
 * @param labHalf - half the width of the biggest lab
 * @returns decorations, island-local
 */
export function decorate(seed: string, radius: number, labCells: GridCell[], labHalf = LAB_SIZE / 2): KitPlacement[] {
  const count = Math.min(DECOR_MAX, Math.round(Math.PI * radius * radius * DECOR_PER_AREA));
  const items: KitPlacement[] = [];
  for (let index = 0; index < count * 3 && items.length < count; index += 1) {
    const angle = seeded(seed, 100 + index) * Math.PI * 2;
    const distance = Math.sqrt(seeded(seed, 300 + index)) * (radius - 1.5);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (insideLabArea(x, z, labCells, labHalf)) continue;
    const pick = seeded(seed, 500 + index);
    const group = pick < 0.35 ? NATURE.trees : pick < 0.5 ? NATURE.rocks : pick < 0.95 ? NATURE.plants : NATURE.props;
    const name = group[Math.floor(seeded(seed, 700 + index) * group.length)] ?? NATURE.trees[0];
    const isTree = group === NATURE.trees;
    const size = isTree ? 2.6 + seeded(seed, 900 + index) * 1.2 : 2.2 + seeded(seed, 900 + index) * 0.8;
    items.push({ url: natureUrl(name), x, y: -0.02, z, rotation: seeded(seed, 1100 + index) * Math.PI * 2, scale: size, shadow: isTree || group === NATURE.rocks });
  }
  return items;
}

/**
 * Whether a point falls in the rectangle holding all labs (plus a margin), where decorations would
 * hide the labs from the camera.
 * @param x - point x
 * @param z - point z
 * @param labCells - lab centres
 * @param labHalf - half the width of the biggest lab
 * @returns true when inside
 */
function insideLabArea(x: number, z: number, labCells: GridCell[], labHalf: number): boolean {
  if (!labCells.length) return false;
  const reach = labHalf + LAB_AREA_MARGIN;
  const xs = labCells.map((cell) => cell.x);
  const zs = labCells.map((cell) => cell.z);
  return x > Math.min(...xs) - reach && x < Math.max(...xs) + reach && z > Math.min(...zs) - reach && z < Math.max(...zs) + reach + FRONT_MARGIN;
}
