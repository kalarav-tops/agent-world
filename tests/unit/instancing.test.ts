import { describe, expect, it } from 'vitest';
import { LAB_FURNITURE, staticScene, decorate } from '../../src/web/scene/instancing';
import { continentPlacements, labGrid } from '../../src/web/scene/layout';
import type { LabSummary, SessionSummary, WorldSummary } from '../../src/shared/types';

/**
 * A lab summary for instancing tests.
 * @param id - lab id
 * @param active - whether it is lit
 * @returns lab
 */
const lab = (id: string, active = false): LabSummary => ({
  id,
  index: 1,
  prompt: 'p',
  startedAt: '2026-10-06T10:00:00.000Z',
  updatedAt: '2026-10-06T10:00:00.000Z',
  active,
  changeCount: 0,
  scientists: [],
  version: 1,
});

/**
 * A session summary for instancing tests.
 * @param sessionId - session id
 * @param labs - its labs
 * @returns session
 */
const session = (sessionId: string, labs: LabSummary[]): SessionSummary => ({
  sessionId,
  pid: 1,
  cwd: '/w',
  project: 'w',
  branch: '',
  title: '',
  kind: 'interactive',
  entrypoint: 'cli',
  startedAt: 1,
  labs,
});

describe('staticScene', () => {
  const world: WorldSummary = { generatedAt: '', sessions: [session('s1', [lab('a'), lab('b', true)]), session('s2', [lab('c')])] };
  const placements = continentPlacements(world.sessions.map((entry) => entry.labs.length));

  it('lists every lab with its world position and whether it is lit', () => {
    const scene = staticScene(world, placements);
    expect(scene.labs.map((entry) => [entry.sessionId, entry.labId, entry.lit])).toEqual([
      ['s1', 'a', false],
      ['s1', 'b', true],
      ['s2', 'c', false],
    ]);
    const cell = labGrid(2)[1];
    expect(scene.labs[1]?.x).toBeCloseTo((placements[0]?.x ?? 0) + (cell?.x ?? 0));
    expect(scene.labs[1]?.z).toBeCloseTo((placements[0]?.z ?? 0) + (cell?.z ?? 0));
  });

  it('places a full furniture set in every lab, offset to that lab', () => {
    const scene = staticScene(world, placements);
    const furniture = scene.kit.filter((item) => item.url.includes('/furniture/'));
    expect(furniture).toHaveLength(LAB_FURNITURE.length * 3);
    const first = LAB_FURNITURE[0];
    const placed = furniture[0];
    expect(placed?.x).toBeCloseTo((scene.labs[0]?.x ?? 0) + (first?.x ?? 0));
  });

  it('adds island decorations for each continent', () => {
    const scene = staticScene(world, placements);
    expect(scene.kit.some((item) => item.url.includes('/nature/'))).toBe(true);
  });

  it('is empty for an empty world', () => {
    expect(staticScene({ generatedAt: '', sessions: [] }, [])).toEqual({ labs: [], kit: [] });
  });
});

describe('decorate', () => {
  it('is stable for a seed and keeps decorations off the labs', () => {
    const cells = labGrid(4);
    const first = decorate('seed', 30, cells);
    expect(decorate('seed', 30, cells)).toEqual(first);
    expect(first.length).toBeGreaterThan(10);
    for (const item of first) {
      const onLab = cells.some((cell) => Math.abs(cell.x - item.x) < 3 && Math.abs(cell.z - item.z) < 3);
      expect(onLab).toBe(false);
    }
  });
});
