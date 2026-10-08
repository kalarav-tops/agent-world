import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LabSummary, ScientistSummary, SessionSummary, WorldSummary } from '../../src/shared/types';
import { ICONS, Icon, type IconName } from '../../src/web/ui/icons';
import { Hud } from '../../src/web/ui/Hud';
import { LabTag } from '../../src/web/ui/LabTag';
import { InspectPanel } from '../../src/web/ui/InspectPanel';
import { ViewControls } from '../../src/web/ui/ViewControls';

const NOW = Date.parse('2026-10-08T10:01:02Z');

const scientist = (overrides: Partial<ScientistSummary> = {}): ScientistSummary => ({
  id: 'main',
  role: 'main',
  description: '',
  status: 'working',
  current: { tool: 'Bash', summary: 'npm test', since: '2026-10-08T10:01:00Z', toolUseId: 't1' },
  parentId: null,
  depth: 0,
  model: 'claude-opus-5-5',
  effort: 'high',
  changeCount: 0,
  updatedAt: '2026-10-08T10:01:00Z',
  ...overrides,
});

const lab = (overrides: Partial<LabSummary> = {}): LabSummary =>
  ({
    id: 'lab-15',
    index: 15,
    prompt: 'Add retries with backoff to the payment client',
    startedAt: '2026-10-08T10:00:00Z',
    updatedAt: '2026-10-08T10:01:00Z',
    active: true,
    changeCount: 0,
    version: 1,
    scientists: [scientist()],
    ...overrides,
  }) as LabSummary;

const session = (labs: LabSummary[]): SessionSummary =>
  ({ sessionId: 's1', project: 'checkout-service', title: 'Payment retries', entrypoint: 'cli', labs }) as unknown as SessionSummary;

const world = (labs: LabSummary[]): WorldSummary => ({ sessions: [session(labs)] }) as unknown as WorldSummary;

const hud = (labs: LabSummary[]): string =>
  renderToStaticMarkup(
    createElement(Hud, {
      world: world(labs),
      connected: true,
      now: NOW,
      focusedSessionId: null,
      onFocusContinent: () => undefined,
      onOverview: () => undefined,
      onCommand: () => undefined,
      waitingOnYou: 0,
    }),
  );

describe('icons', () => {
  it('draws every icon as a decorative 24px stroke', () => {
    for (const name of Object.keys(ICONS) as IconName[]) {
      const markup = renderToStaticMarkup(createElement(Icon, { name }));
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain('focusable="false"');
    }
  });
});

describe('Hud', () => {
  it('labels each top-bar number', () => {
    const markup = hud([lab()]);
    for (const label of ['session', 'busy', 'lab', 'edit']) expect(markup).toContain(`hud__metric-label">${label}`);
  });

  it('keeps the "N noun" reading the tests and screen readers rely on', () => {
    const text = hud([lab()]).replace(/<[^>]+>/g, '');
    expect(text).toContain('1 session');
    expect(text).toContain('0 edits');
  });

  it('shows the stuck chip only while something is stuck', () => {
    expect(hud([lab()])).not.toContain('hud__stuck');
    const stuck = scientist({ current: { tool: 'Bash', summary: 'deploy', since: '2026-10-08T10:00:10Z', toolUseId: 't2' } });
    expect(hud([lab({ scientists: [stuck] })])).toContain('hud__stuck');
  });

  it('keeps the Command centre button name', () => {
    expect(hud([lab()])).toMatch(/<button[^>]*class="hud__command[^"]*"[^>]*>.*Command centre/);
  });
});

describe('LabTag', () => {
  const tag = (lit: boolean): string =>
    renderToStaticMarkup(createElement(LabTag, { lab: lab(), labType: 'physics', lit, now: NOW, onSelect: () => undefined }));

  it('is a fixed-width card edged in the lab type colour', () => {
    const markup = tag(true);
    expect(markup).toContain('lab-tag lab-tag--lit');
    expect(markup).toContain('--lab-edge:#2f8cff');
    expect(markup).toContain('Lab 15');
    expect(markup).toContain('Physics');
  });

  it('shows status as a dot with text and the clock', () => {
    const markup = tag(true);
    expect(markup).toContain('lab-tag__status');
    expect(markup).toContain('Working');
    expect(markup).toContain('aria-label="Running for"');
    expect(tag(false)).not.toContain('Working');
    expect(tag(false)).toContain('aria-label="Took"');
  });
});

describe('InspectPanel', () => {
  const panel = (view: Parameters<typeof InspectPanel>[0]['view']): string => {
    const labs = [lab({ scientists: [scientist(), scientist({ id: 'cr', role: 'code-reviewer', model: 'claude-sonnet-5-5', effort: 'medium', depth: 1 })] })];
    return renderToStaticMarkup(
      createElement(InspectPanel, {
        session: session(labs),
        lab: labs[0]!,
        detail: null,
        view,
        now: NOW,
        replayBar: null,
        access: { enabled: false },
        onView: () => undefined,
        onClose: () => undefined,
      }),
    );
  };

  it('shows each agent with its model and effort', () => {
    const markup = panel({ kind: 'lab' });
    expect(markup).toContain('Opus 5.5 · High');
    expect(markup).toContain('Sonnet 5.5 · Medium');
  });

  it('shows lab details as key and value pairs', () => {
    expect(panel({ kind: 'lab' })).toMatch(/<dl class="facts">/);
  });

  it('uses an icon back button that keeps its name', () => {
    const markup = panel({ kind: 'scientist', scientistId: 'cr' });
    expect(markup).toMatch(/<button[^>]*class="icon-button[^"]*"[^>]*aria-label="Back to lab"/);
    expect(markup).not.toContain('text-button');
  });
});

describe('ViewControls', () => {
  it('is one toolbar of grouped buttons with every name kept', () => {
    const markup = renderToStaticMarkup(createElement(ViewControls, { camera: { current: null }, reducedMotion: false }));
    expect(markup.match(/role="group"/g)).toHaveLength(3);
    for (const name of ['Zoom in (+)', 'Zoom out (-)', 'Turn left (q)', 'Turn right (e)', 'Tilt up (w)', 'Tilt down (s)', 'Face north (r)']) {
      expect(markup).toContain(`aria-label="${name}"`);
    }
  });
});
