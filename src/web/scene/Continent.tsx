import { useMemo, type ReactElement } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Label } from './Label';
import type { SessionSummary } from '../../shared/types';
import type { ReplayState } from '../../shared/replay';
import { sessionLayout, type Placement } from './layout';
import { LabBuilding } from './LabBuilding';
import { Island } from './Island';
import { isCanvasEvent } from './events';
import { clientLabel, preview } from '../ui/format';

/** Which lab is selected, and the replay shown in it if any. */
export interface SceneSelection {
  sessionId: string;
  labId: string;
}

/** Props for one session's continent. */
interface ContinentProps {
  session: SessionSummary;
  placement: Placement;
  selection: SceneSelection | null;
  replay: { sessionId: string; labId: string; states: Record<string, ReplayState> } | null;
  lightBudget: Set<string>;
  hoveredLab: string | null;
  now: number;
  reducedMotion: boolean;
  onSelectLab: (sessionId: string, labId: string) => void;
  onSelectScientist: (sessionId: string, labId: string, scientistId: string) => void;
  onOpenChanges: (sessionId: string, labId: string) => void;
  onFocus: (sessionId: string) => void;
}

const LABEL_HEIGHT = 6;

/**
 * One live session as an island holding its labs, every lab open with its scientists inside.
 * @param props - session, its placement and handlers
 * @returns the continent
 */
export function Continent(props: ContinentProps): ReactElement {
  const { session, placement, selection, replay, now, reducedMotion } = props;
  const layout = useMemo(() => sessionLayout(session.labs), [session.labs]);

  const focus = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    if (isCanvasEvent(event.nativeEvent)) props.onFocus(session.sessionId);
  };

  return (
    <group position={[placement.x, 0, placement.z]}>
      <Island seed={session.sessionId} radius={placement.radius} onClick={focus} />
      <Label position={[0, LABEL_HEIGHT, -placement.radius * 0.95]} center zIndexRange={[12, 2]}>
        <button type="button" className="continent-tag" onClick={() => props.onFocus(session.sessionId)}>
          <span className="continent-tag__name">{session.project}</span>
          {session.title && <span className="continent-tag__title">{preview(session.title, 48)}</span>}
          <span className="continent-tag__meta">
            {session.branch ? `${session.branch}, ` : ''}
            {clientLabel(session.entrypoint)}
          </span>
        </button>
      </Label>
      {session.labs.map((lab, index) => {
        const cell = layout.cells[index];
        if (!cell) return null;
        const selected = selection?.sessionId === session.sessionId && selection.labId === lab.id;
        const labReplay = replay && replay.sessionId === session.sessionId && replay.labId === lab.id ? replay.states : null;
        return (
          <LabBuilding
            key={lab.id}
            sessionId={session.sessionId}
            lab={lab}
            position={[cell.x, 0, cell.z]}
            scale={layout.scales[index] ?? 1}
            labType={layout.types[index] ?? 'chemistry'}
            selected={selected}
            hovered={props.hoveredLab === `${session.sessionId}/${lab.id}`}
            withLight={props.lightBudget.has(`${session.sessionId}/${lab.id}`)}
            replay={labReplay}
            now={now}
            reducedMotion={reducedMotion}
            onSelectLab={() => props.onSelectLab(session.sessionId, lab.id)}
            onSelectScientist={(scientistId) => props.onSelectScientist(session.sessionId, lab.id, scientistId)}
            onOpenChanges={() => props.onOpenChanges(session.sessionId, lab.id)}
          />
        );
      })}
    </group>
  );
}
