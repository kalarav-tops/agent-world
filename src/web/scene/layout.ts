import { stationFor, type Station } from '../../shared/tools';
import type { ScientistStatus, ScientistSummary } from '../../shared/types';

/** Width and depth of one lab building. */
export const LAB_SIZE = 6;
/** Distance between lab centres on a continent. */
export const LAB_SPACING = 9;
/** A pending call older than this may be waiting on a permission prompt. */
export const WAITING_AFTER_MS = 20_000;

const CONTINENT_GAP = 8;
const ISLAND_MARGIN = 5;
/** Beach and foam reach past the island radius; continents keep clear of each other's shore. */
const SHORE_REACH = 1.3;
/** Resting scientists sit in a grid between the sofa and the front wall. */
const LOUNGE_ORIGIN = { x: -0.9, z: 0.2 };
const LOUNGE_COLUMNS = 4;
const LOUNGE_ROWS = 3;
const LOUNGE_SPACING = 0.78;
const GOLDEN_ANGLE = 2.399963;

/** One colour per status; colour carries no other meaning in the world. */
export const STATUS_COLORS: Record<ScientistStatus, string> = {
  thinking: '#7fd1d9',
  working: '#f2a541',
  asking: '#e86fa8',
  done: '#7ba36b',
  interrupted: '#c4553b',
  idle: '#8a97a3',
};

/** Where each station sits inside a lab, in lab-local coordinates. The door is on the +x wall. */
export const STATION_POSITIONS: Record<Station, { x: number; z: number }> = {
  whiteboard: { x: -2.05, z: 1.75 },
  bench: { x: -1.9, z: -1.85 },
  microscope: { x: 0.35, z: -1.75 },
  portal: { x: 2.2, z: -1.7 },
  library: { x: -1.95, z: -0.55 },
  terminal: { x: 1.6, z: 1.85 },
  helpdesk: { x: 2.05, z: -1.15 },
  lounge: { x: -0.9, z: 0.2 },
  exit: { x: -0.9, z: 0.2 },
};

const ROLE_COLORS: Record<string, string> = {
  main: '#eef1ec',
  Explore: '#7fb3d5',
  Plan: '#b39ddb',
  'general-purpose': '#9cc9a8',
};

const ROLE_PALETTE = ['#f0c987', '#e3a6a0', '#a3c4e0', '#c8b6e2', '#a8d5ba', '#e6c3a1', '#9fd3d9', '#d8b4d0'];

/** A lab's position on its continent. */
export interface GridCell {
  x: number;
  z: number;
}

/** A continent's centre and radius in the world. */
export interface Placement {
  x: number;
  z: number;
  radius: number;
}

/** Where a scientist should stand in its lab. */
export interface Target {
  station: Station;
  x: number;
  z: number;
  face: number;
}

/**
 * Lab positions on a continent, oldest first. The newest lab takes the front row (largest z),
 * nearest the default camera.
 * @param count - number of labs
 * @param spacing - distance between lab centres
 * @returns one cell per lab, in lab order
 */
export function labGrid(count: number, spacing = LAB_SPACING): GridCell[] {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, index) => {
    const slot = count - 1 - index;
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    return { x: (col - (cols - 1) / 2) * spacing, z: ((rows - 1) / 2 - row) * spacing };
  });
}

/**
 * Island radius that fits a continent's lab grid.
 * @param labCount - number of labs
 * @param spacing - distance between lab centres
 * @returns radius
 */
export function islandRadius(labCount: number, spacing = LAB_SPACING): number {
  const cols = Math.ceil(Math.sqrt(Math.max(labCount, 1)));
  return (cols * spacing * Math.SQRT2) / 2 + ISLAND_MARGIN;
}

/**
 * Continent centres around the launch-tower island at the origin, each at the nearest free spot
 * along a golden-angle spiral, so nothing overlaps whatever its size.
 * @param labCounts - lab count per continent, in display order
 * @param spacings - lab spacing per continent (bigger labs need more), default LAB_SPACING
 * @returns one placement per continent
 */
export function continentPlacements(labCounts: number[], spacings: number[] = []): Placement[] {
  const tower: Placement = { x: 0, z: 0, radius: TOWER_RADIUS };
  const placed: Placement[] = [tower];
  labCounts.forEach((count, index) => {
    const radius = islandRadius(count, spacings[index] ?? LAB_SPACING);
    const angle = index * GOLDEN_ANGLE;
    for (let distance = radius + TOWER_RADIUS; ; distance += 2) {
      const candidate = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, radius };
      const clear = placed.every((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) > (other.radius + radius) * SHORE_REACH + CONTINENT_GAP);
      if (clear) {
        placed.push(candidate);
        return;
      }
    }
  });
  return placed.slice(1);
}

/**
 * Where every scientist in a lab should stand. Each station has a few work slots at its furniture;
 * scientists beyond those go to another piece of equipment rather than open floor. Resting ones sit
 * in the lounge grid.
 * @param scientists - scientists in the lab, in arrival order
 * @param stateOf - optional override of each scientist's status and tool (used by replay)
 * @returns target by scientist id
 */
export function scientistTargets(
  scientists: ScientistSummary[],
  stateOf: (scientist: ScientistSummary) => { status: ScientistStatus; tool: string | undefined } = (scientist) => ({
    status: scientist.status,
    tool: scientist.current?.tool,
  }),
): Record<string, Target> {
  const occupancy: Partial<Record<Station, number>> = {};
  const targets: Record<string, Target> = {};
  let overflow = 0;
  for (const scientist of scientists) {
    const { status, tool } = stateOf(scientist);
    const station = stationFor(status, tool);
    const slot = occupancy[station] ?? 0;
    occupancy[station] = slot + 1;
    const slots = STATION_SLOTS[station];
    if (station === 'lounge' || station === 'exit') {
      targets[scientist.id] = { station, ...offset(station, slot), face: 0 };
    } else if (slot < slots.length) {
      const spot = slots[slot] ?? slots[0];
      targets[scientist.id] = { station, x: spot?.x ?? 0, z: spot?.z ?? 0, face: spot?.face ?? 0 };
    } else {
      const spot = AMBIENT_SPOTS[overflow % AMBIENT_SPOTS.length] ?? AMBIENT_SPOTS[0];
      overflow += 1;
      targets[scientist.id] = { station, x: spot?.x ?? 0, z: spot?.z ?? 0, face: spot?.face ?? 0 };
    }
  }
  return targets;
}

/**
 * Whether a working scientist's call has been pending long enough that it may be blocked on
 * a permission prompt. Subagent spawns are expected to run long and never count.
 * @param scientist - scientist summary
 * @param now - current time, epoch milliseconds
 * @returns true when it may be waiting
 */
export function isWaiting(scientist: ScientistSummary, now: number): boolean {
  const current = scientist.current;
  if (scientist.status !== 'working' || !current) return false;
  if (current.tool === 'Agent' || current.tool === 'Task' || current.tool === 'Workflow') return false;
  return now - Date.parse(current.since) > WAITING_AFTER_MS;
}

/**
 * Lab-coat colour for a role: fixed for well-known roles, a stable hash for others.
 * @param role - agent role
 * @returns hex colour
 */
export function roleColor(role: string): string {
  const known = ROLE_COLORS[role];
  if (known) return known;
  let hash = 0;
  for (const char of role) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ROLE_PALETTE[hash % ROLE_PALETTE.length] ?? '#cccccc';
}

/**
 * The spot for the nth scientist at a station.
 * @param station - station
 * @param slot - how many scientists already stand there
 * @returns lab-local position
 */
function offset(station: Station, slot: number): { x: number; z: number } {
  const base = STATION_POSITIONS[station];
  if (station === 'lounge') {
    const column = slot % LOUNGE_COLUMNS;
    const row = Math.floor(slot / LOUNGE_COLUMNS);
    return { x: LOUNGE_ORIGIN.x + column * LOUNGE_SPACING, z: LOUNGE_ORIGIN.z + (row % LOUNGE_ROWS) * LOUNGE_SPACING + Math.floor(row / LOUNGE_ROWS) * 0.25 };
  }
  return base;
}

/** A place in the lab where an idle scientist goes to tinker, and what it does there. */
export interface AmbientSpot {
  x: number;
  z: number;
  face: number;
  clip: string;
}

/** Spots around the lab's equipment where finished or idle scientists potter about. */
export const AMBIENT_SPOTS: readonly AmbientSpot[] = [
  { x: -1.9, z: -1.75, face: Math.PI, clip: 'interact-right' },
  { x: -1.05, z: -1.7, face: Math.PI, clip: 'holding-both' },
  { x: 0.35, z: -1.8, face: Math.PI, clip: 'holding-both' },
  { x: 1.05, z: -1.85, face: Math.PI, clip: 'interact-left' },
  { x: 1.7, z: -1.95, face: Math.PI, clip: 'interact-right' },
  { x: -1.85, z: -0.45, face: -Math.PI / 2, clip: 'pick-up' },
  { x: -1.85, z: 0.55, face: -Math.PI / 2, clip: 'pick-up' },
  { x: 1.0, z: 1.9, face: 0, clip: 'interact-left' },
  { x: -2.1, z: 1.4, face: -Math.PI / 2, clip: 'idle' },
  { x: 2.05, z: 1.4, face: Math.PI / 2, clip: 'interact-right' },
  { x: 2.1, z: 2.0, face: Math.PI / 2, clip: 'interact-right' },
  { x: 2.0, z: 0.9, face: Math.PI / 2, clip: 'idle' },
  { x: -1.3, z: 2.0, face: 0, clip: 'crouch' },
];

/** How far a thinking scientist paces either side of its spot. */
export const PACE_REACH = 0.6;

const WANDER_MIN_MS = 12000;
const WANDER_SPREAD_MS = 10000;
const WANDER_JITTER = 0.28;
const SEAT_PERIOD_MS = 16000;
const SEAT_STAGGER_MS = 1100;
/** Seats beyond the collision-free count rest at this offset from the spot. */
const LAYER_OFFSET = 0.45;
const PACE_PERIOD_MS = 6000;

/**
 * Where a finished or idle scientist rests at a moment: it sits or stands at one relaxed spot for a
 * while, then strolls to another. No work motions, so a finished lab never looks busy. Each agent has
 * its own rhythm and route, so resting agents spread out instead of standing in a block.
 * With a seat number (the agent's place among the lab's resting agents), seats step forward through
 * the spots in staggered order, so up to REST_SPOTS.length - 1 seated agents never share a spot.
 * @param key - the agent's stable key
 * @param timeMs - the current time, milliseconds
 * @param seat - optional seat number among the lab's resting agents
 * @returns the spot (with a small personal offset) and its index
 */
export function wanderSpot(key: string, timeMs: number, seat?: number): AmbientSpot & { index: number } {
  const period = seat === undefined ? WANDER_MIN_MS + unitHash(key, 1) * WANDER_SPREAD_MS : SEAT_PERIOD_MS;
  const cycle = Math.floor((timeMs + (seat === undefined ? unitHash(key, 2) * period : seat * SEAT_STAGGER_MS)) / period);
  const index =
    seat === undefined
      ? Math.floor(unitHash(key, 100 + cycle) * REST_SPOTS.length)
      : (seat + cycle) % REST_SPOTS.length;
  const spot = REST_SPOTS[index] ?? REST_SPOTS[0];
  if (!spot) throw new Error('no rest spots');
  const layer = seat === undefined ? 0 : Math.floor(seat / (REST_SPOTS.length - 1));
  return {
    ...spot,
    index,
    x: spot.x + (unitHash(key, 200 + cycle) - 0.5) * WANDER_JITTER + layer * LAYER_OFFSET,
    z: spot.z + (unitHash(key, 300 + cycle) - 0.5) * WANDER_JITTER + layer * LAYER_OFFSET,
  };
}

/**
 * Where a thinking scientist is while pacing back and forth beside its spot.
 * @param base - the spot it paces around
 * @param key - the agent's stable key, which sets its pacing phase
 * @param timeMs - the current time, milliseconds
 * @returns the point
 */
export function pacePoint(base: { x: number; z: number }, key: string, timeMs: number): { x: number; z: number } {
  const angle = (timeMs / PACE_PERIOD_MS) * Math.PI * 2 + unitHash(key, 3) * Math.PI * 2;
  return { x: base.x + Math.sin(angle) * PACE_REACH, z: base.z + Math.cos(angle * 2) * 0.15 };
}

/**
 * A stable pseudo-random number in [0, 1) for a key and a salt.
 * @param key - text key
 * @param salt - varies the result for different uses of one key
 * @returns number in [0, 1)
 */
function unitHash(key: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

/** Work slots per station, right at the furniture's front edge, facing it. Slot 0 is STATION_POSITIONS. */
export const STATION_SLOTS: Record<Station, ReadonlyArray<{ x: number; z: number; face: number }>> = {
  bench: [
    { x: -1.9, z: -1.85, face: HALF_TURN },
    { x: -1.1, z: -1.85, face: HALF_TURN },
    { x: -0.55, z: -1.8, face: HALF_TURN * 0.9 },
  ],
  microscope: [
    { x: 0.35, z: -1.75, face: HALF_TURN },
    { x: 0.95, z: -1.8, face: HALF_TURN },
    { x: 1.4, z: -2.0, face: -QUARTER_TURN },
  ],
  portal: [
    { x: 2.2, z: -1.7, face: HALF_TURN },
    { x: 1.75, z: -2.0, face: HALF_TURN * 0.8 },
  ],
  library: [
    { x: -1.95, z: -0.55, face: -QUARTER_TURN },
    { x: -1.95, z: 0.45, face: -QUARTER_TURN },
  ],
  whiteboard: [
    { x: -2.05, z: 1.75, face: -QUARTER_TURN },
    { x: -1.6, z: 1.35, face: -QUARTER_TURN * 1.2 },
  ],
  terminal: [
    { x: 1.6, z: 1.85, face: 0 },
    { x: 1.0, z: 1.9, face: 0 },
  ],
  helpdesk: [
    { x: 2.05, z: -1.15, face: QUARTER_TURN },
    { x: 2.0, z: -0.55, face: QUARTER_TURN },
  ],
  lounge: [],
  exit: [],
};

/** Relaxed spots around the room where finished agents sit or stand; no work happens here. */
export const REST_SPOTS: readonly AmbientSpot[] = [
  { x: -0.9, z: 0.3, face: 0, clip: 'sit' },
  { x: 0.1, z: 0.6, face: -Math.PI / 4, clip: 'sit' },
  { x: 1.0, z: 0.2, face: Math.PI / 5, clip: 'idle' },
  { x: -1.4, z: 1.2, face: Math.PI / 3, clip: 'sit' },
  { x: -0.4, z: 1.5, face: Math.PI, clip: 'sit' },
  { x: 0.6, z: 1.35, face: -Math.PI / 2, clip: 'sit' },
  { x: 1.6, z: 0.9, face: -Math.PI / 3, clip: 'idle' },
  { x: -0.2, z: -0.6, face: Math.PI / 6, clip: 'idle' },
  { x: 0.9, z: -0.7, face: Math.PI / 2, clip: 'sit' },
  { x: -1.3, z: -0.9, face: 0, clip: 'sit' },
  { x: 2.35, z: 0.1, face: -Math.PI / 2, clip: 'idle' },
  { x: -2.2, z: 2.3, face: Math.PI / 4, clip: 'sit' },
];

/** The largest a lab grows, as a multiple of its base size. */
export const MAX_LAB_SCALE = 1.6;
const AGENTS_PER_BASE_LAB = 4;
const GROWTH_PER_AGENT = 0.04;

/**
 * How much bigger a lab is than the base size, given how many agents work in it.
 * @param agentCount - agents in the lab
 * @returns scale between 1 and MAX_LAB_SCALE
 */
export function labScale(agentCount: number): number {
  return Math.min(MAX_LAB_SCALE, Math.max(1, 1 + (agentCount - AGENTS_PER_BASE_LAB) * GROWTH_PER_AGENT));
}

/**
 * Distance between lab centres on a continent, sized for its biggest lab.
 * @param agentCounts - agents per lab on the continent
 * @returns spacing
 */
export function continentSpacing(agentCounts: number[]): number {
  return LAB_SPACING * Math.max(1, ...agentCounts.map(labScale));
}

/** The kinds of lab a prompt can get; purely for variety. */
export const LAB_TYPES = ['chemistry', 'biology', 'physics', 'computer', 'robotics'] as const;
export type LabType = (typeof LAB_TYPES)[number];

/**
 * A lab's type, stable for the lab.
 * @param labId - lab id
 * @returns lab type
 */
export function labTypeFor(labId: string): LabType {
  return LAB_TYPES[Math.floor(unitHash(labId, 41) * LAB_TYPES.length)] ?? 'chemistry';
}

/** Where a session's labs sit on its island, how big each is, and what kind of lab it is. */
export interface SessionLayout {
  spacing: number;
  cells: GridCell[];
  scales: number[];
  types: LabType[];
}

/**
 * The layout of one session's island: lab spacing sized for its biggest lab, each lab's grid cell,
 * size and type. Every part of the scene uses this, so positions always agree.
 * @param labs - the session's labs, in order, with their scientists and ids
 * @returns the layout
 */
export function sessionLayout(labs: ReadonlyArray<{ id: string; scientists: readonly unknown[] }>): SessionLayout {
  const counts = labs.map((lab) => lab.scientists.length);
  const spacing = continentSpacing(counts);
  return { spacing, cells: labGrid(labs.length, spacing), scales: counts.map(labScale), types: labs.map((lab) => labTypeFor(lab.id)) };
}

/** Radius of the launch-tower island at the centre of the world. */
export const TOWER_RADIUS = 7;
