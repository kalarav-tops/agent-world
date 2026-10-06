import { describe, expect, it } from 'vitest';
import { agentCount, labClock } from '../../src/web/ui/format';
import type { ScientistSummary } from '../../src/shared/types';

/**
 * A scientist summary with a status.
 * @param status - status
 * @returns summary
 */
const scientist = (status: ScientistSummary['status']): ScientistSummary => ({
  id: status + Math.random(),
  role: 'Explore',
  description: '',
  status,
  current: null,
  parentId: null,
  depth: 1,
  model: '',
  effort: '',
  changeCount: 0,
  updatedAt: '',
});

describe('agentCount', () => {
  it('counts agents and those still working', () => {
    expect(agentCount([scientist('done')])).toBe('1 agent');
    expect(agentCount([scientist('done'), scientist('done')])).toBe('2 agents');
    expect(agentCount([scientist('working'), scientist('thinking'), scientist('asking'), scientist('done'), scientist('idle')])).toBe('5 agents, 3 working');
    expect(agentCount([scientist('working')])).toBe('1 agent, working');
  });
});

describe('labClock', () => {
  it('formats seconds, minutes and hours', () => {
    expect(labClock('2026-10-06T10:00:00Z', '2026-10-06T10:00:45Z')).toBe('45s');
    expect(labClock('2026-10-06T10:00:00Z', '2026-10-06T10:58:00Z')).toBe('58m');
    expect(labClock('2026-10-06T10:00:00Z', '2026-10-06T11:12:00Z')).toBe('1h 12m');
  });
});
