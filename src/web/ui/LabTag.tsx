import type { CSSProperties, ReactElement } from 'react';
import type { LabSummary } from '../../shared/types';
import type { LabType } from '../scene/layout';
import { LAB_STYLES } from '../scene/labStyles';
import { agentCount, labClock, preview } from './format';
import { Icon } from './icons';

/** Props for a lab's name tag. */
interface LabTagProps {
  lab: LabSummary;
  labType: LabType;
  lit: boolean;
  now: number;
  onSelect: () => void;
}

/**
 * A lab's name tag: a fixed-width card edged in the lab type's colour, with the lab number and type,
 * a status dot while anyone works, the clock, the prompt and the agent count. Only the prompt is
 * shortened, so the number and clock are never cut off.
 * @param props - lab, its type, whether it is lit, the clock and the click handler
 * @returns the tag button
 */
export function LabTag({ lab, labType, lit, now, onSelect }: LabTagProps): ReactElement {
  const style = LAB_STYLES[labType];
  return (
    <button type="button" className={`lab-tag${lit ? ' lab-tag--lit' : ''}`} style={{ '--lab-edge': style.trim } as CSSProperties} onClick={onSelect}>
      <span className="lab-tag__head">
        <span className="lab-tag__index">Lab {lab.index}</span>
        <span className="lab-tag__type">{style.name.replace(/ lab$/, '')}</span>
        {lit && (
          <span className="lab-tag__status">
            <span className="status-dot status-dot--working" aria-hidden="true" />
            Working
          </span>
        )}
        <span className="lab-tag__clock" aria-label={lit ? 'Running for' : 'Took'}>
          <Icon name="clock" />
          {labClock(lab.startedAt, lit ? new Date(now).toISOString() : lab.updatedAt)}
        </span>
      </span>
      <span className="lab-tag__prompt">{preview(lab.prompt, 80) || 'No prompt text'}</span>
      <span className="lab-tag__count">{agentCount(lab.scientists)}</span>
    </button>
  );
}
