import { describe, expect, it } from 'vitest';
import {
  labScale,
  labTypeFor,
  LAB_TYPES,
  MAX_LAB_SCALE,
  STATION_SLOTS,
  REST_SPOTS,
  AMBIENT_SPOTS,
  pacePoint,
  PACE_REACH,
  wanderSpot,
  continentPlacements,
  isWaiting,
  labGrid,
  LAB_SPACING,
  roleColor,
  scientistTargets,
  STATION_POSITIONS,
  STATUS_COLORS,
  WAITING_AFTER_MS,
} from '../../src/web/scene/layout';
import type { ScientistSummary } from '../../src/shared/types';

/**
 * A scientist summary for layout tests.
 * @param id - scientist id
 * @param status - status
 * @param tool - current tool
 * @returns summary
 */
const scientist = (id: string, status: ScientistSummary['status'], tool?: string): ScientistSummary => ({
  id,
  role: id === 'main' ? 'main' : 'Explore',
  description: '',
  status,
  current: tool ? { toolUseId: `t-${id}`, tool, summary: '', since: '2026-10-06T10:00:00.000Z' } : null,
  parentId: id === 'main' ? null : 'main',
  depth: id === 'main' ? 0 : 1,
  model: '',
  effort: '',
  changeCount: 0,
  updatedAt: '2026-10-06T10:00:00.000Z',
});

describe('labGrid', () => {
  it('puts the newest lab in the front row', () => {
    const cells = labGrid(5);
    expect(cells).toHaveLength(5);
    const newest = cells[4];
    const oldest = cells[0];
    expect(newest?.z).toBeGreaterThan(oldest?.z ?? 0);
  });

  it('spaces labs apart and centres the grid', () => {
    const cells = labGrid(4);
    const xs = cells.map((cell) => cell.x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
    expect(Math.abs((cells[0]?.x ?? 0) - (cells[1]?.x ?? 0))).toBe(LAB_SPACING);
  });

  it('handles no labs', () => {
    expect(labGrid(0)).toEqual([]);
  });
});

describe('continentPlacements', () => {
  it('places the first continent at the centre and keeps continents from overlapping', () => {
    const placements = continentPlacements([3, 40, 1, 8]);
    expect(placements[0]).toMatchObject({ x: 0, z: 0 });
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const left = placements[i];
        const right = placements[j];
        if (!left || !right) throw new Error('missing placement');
        const distance = Math.hypot(left.x - right.x, left.z - right.z);
        expect(distance).toBeGreaterThan(left.radius + right.radius);
      }
    }
  });

  it('grows a continent with its lab count', () => {
    const [small, large] = continentPlacements([1, 50]);
    expect(large?.radius).toBeGreaterThan(small?.radius ?? 0);
  });
});

describe('scientistTargets', () => {
  it('sends each scientist to the station for what it is doing', () => {
    const targets = scientistTargets([scientist('main', 'working', 'Edit'), scientist('a', 'working', 'Grep')]);
    expect(targets.main?.station).toBe('bench');
    expect(targets.a?.station).toBe('microscope');
    expect(targets.main?.x).toBeCloseTo(STATION_POSITIONS.bench.x, 0);
  });

  it('spreads scientists sharing a station so they do not stand inside each other', () => {
    const targets = scientistTargets([scientist('a', 'thinking'), scientist('b', 'thinking'), scientist('c', 'thinking')]);
    const points = Object.values(targets).map((target) => `${target.x.toFixed(2)},${target.z.toFixed(2)}`);
    expect(new Set(points).size).toBe(3);
  });

  it('puts extra workers at other equipment instead of open floor', () => {
    const crowd = Array.from({ length: 6 }, (_, index) => scientist(`w${index}`, 'working', 'Edit'));
    const targets = Object.values(scientistTargets(crowd));
    const benchSpots = STATION_SLOTS.bench.map((spot) => `${spot.x},${spot.z}`);
    expect(targets.filter((target) => benchSpots.includes(`${target.x},${target.z}`))).toHaveLength(STATION_SLOTS.bench.length);
    expect(new Set(targets.map((target) => `${target.x},${target.z}`)).size).toBe(6);
    const known = [...Object.values(STATION_SLOTS).flat(), ...AMBIENT_SPOTS].map((spot) => `${spot.x},${spot.z}`);
    expect(targets.every((target) => known.includes(`${target.x},${target.z}`))).toBe(true);
    expect(targets.every((target) => typeof target.face === 'number')).toBe(true);
  });

  it('seats finished scientists inside the lab, each in its own spot', () => {
    const many = Array.from({ length: 16 }, (_, index) => scientist(`s${index}`, 'done'));
    const targets = Object.values(scientistTargets(many));
    expect(targets.every((target) => target.station === 'lounge')).toBe(true);
    expect(targets.every((target) => Math.abs(target.x) < 2.8 && Math.abs(target.z) < 2.8)).toBe(true);
    const spots = new Set(targets.map((target) => `${target.x.toFixed(2)},${target.z.toFixed(2)}`));
    expect(spots.size).toBe(16);
  });
});

describe('labScale and lab types', () => {
  it('grows a lab with its agent count, within limits', () => {
    expect(labScale(1)).toBe(1);
    expect(labScale(4)).toBe(1);
    expect(labScale(12)).toBeGreaterThan(1);
    expect(labScale(12)).toBeLessThan(labScale(30));
    expect(labScale(500)).toBe(MAX_LAB_SCALE);
  });

  it('spaces a grid of big labs further apart', () => {
    const normal = labGrid(4);
    const roomy = labGrid(4, LAB_SPACING * 1.5);
    expect(Math.abs((roomy[0]?.x ?? 0) - (roomy[1]?.x ?? 0))).toBeCloseTo(LAB_SPACING * 1.5);
    expect(Math.abs((normal[0]?.x ?? 0) - (normal[1]?.x ?? 0))).toBeCloseTo(LAB_SPACING);
  });

  it('gives a continent of big labs a bigger island', () => {
    const [small, big] = continentPlacements([4, 4], [LAB_SPACING, LAB_SPACING * 1.6]);
    expect(big?.radius).toBeGreaterThan(small?.radius ?? 0);
  });

  it('assigns each lab a stable type from the list', () => {
    expect(labTypeFor('lab-a')).toBe(labTypeFor('lab-a'));
    const types = new Set(Array.from({ length: 40 }, (_, index) => labTypeFor(`lab-${index}`)));
    expect(types.size).toBe(LAB_TYPES.length);
  });
});

describe('wanderSpot', () => {
  it('keeps agents at a spot for a while, then moves them on', () => {
    const agents = Array.from({ length: 20 }, (_, index) => `agent-${index}`);
    const stayed = agents.filter((key) => JSON.stringify(wanderSpot(key, 30_000)) === JSON.stringify(wanderSpot(key, 31_000)));
    expect(stayed.length).toBeGreaterThanOrEqual(16);
    const visited = new Set(Array.from({ length: 12 }, (_, step) => wanderSpot('agent-a', step * 9000).index));
    expect(visited.size).toBeGreaterThan(2);
  });

  it('spreads different agents over different spots at the same moment', () => {
    const spots = new Set(Array.from({ length: 10 }, (_, index) => wanderSpot(`agent-${index}`, 50_000).index));
    expect(spots.size).toBeGreaterThan(4);
  });

  it('never puts two seated agents on the same spot', () => {
    for (let time = 0; time < 200_000; time += 2_345) {
      const spots = Array.from({ length: REST_SPOTS.length - 1 }, (_, seat) => wanderSpot(`agent-${seat}`, time, seat).index);
      expect(new Set(spots).size).toBe(REST_SPOTS.length - 1);
    }
  });

  it('rests finished agents without work motions', () => {
    const workClips = ['interact-right', 'interact-left', 'holding-both', 'holding-right', 'pick-up'];
    for (let step = 0; step < 40; step += 1) {
      expect(workClips).not.toContain(wanderSpot(`rest-${step}`, step * 7777).clip);
    }
  });

  it('only returns spots inside the lab', () => {
    for (let step = 0; step < 40; step += 1) {
      const { x, z } = wanderSpot(`a${step}`, step * 3333);
      expect(Math.abs(x)).toBeLessThan(2.8);
      expect(Math.abs(z)).toBeLessThan(2.8);
    }
    expect(AMBIENT_SPOTS.length).toBeGreaterThan(6);
  });
});

describe('pacePoint', () => {
  it('moves a thinking agent back and forth around its spot', () => {
    const base = { x: 0, z: 0 };
    const xs = Array.from({ length: 20 }, (_, step) => pacePoint(base, 'agent-a', step * 400).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.6);
    expect(xs.every((x) => Math.abs(x) <= PACE_REACH + 1e-9)).toBe(true);
  });
});

describe('isWaiting', () => {
  it('flags a working scientist whose call has been pending too long', () => {
    const since = Date.parse('2026-10-06T10:00:00.000Z');
    const working = scientist('a', 'working', 'Bash');
    expect(isWaiting(working, since + WAITING_AFTER_MS + 1)).toBe(true);
    expect(isWaiting(working, since + 1000)).toBe(false);
    expect(isWaiting(scientist('b', 'thinking'), since + WAITING_AFTER_MS * 10)).toBe(false);
  });

  it('never flags a spawned subagent call as waiting', () => {
    const since = Date.parse('2026-10-06T10:00:00.000Z');
    expect(isWaiting(scientist('a', 'working', 'Agent'), since + WAITING_AFTER_MS * 10)).toBe(false);
  });
});

describe('colours', () => {
  it('gives every status a colour and stable role colours', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual(['asking', 'done', 'idle', 'interrupted', 'thinking', 'working']);
    expect(roleColor('Explore')).toBe(roleColor('Explore'));
    expect(roleColor('main')).not.toBe(roleColor('Explore'));
    expect(roleColor('some-custom-agent')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
