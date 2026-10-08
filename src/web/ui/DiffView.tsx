import { useMemo, useState, type ReactElement } from 'react';
import { diffLines } from '../../shared/diff';
import type { ChangeEntry } from '../../shared/types';

const VISIBLE_LINES = 1500;
const MARKS = { same: ' ', add: '+', del: '−' } as const;

/**
 * A line diff of one change: removed lines, then added lines, around unchanged context.
 * @param props - the change
 * @returns the diff
 */
export function DiffView({ change }: { change: ChangeEntry }): ReactElement {
  const [showAll, setShowAll] = useState(false);
  const result = useMemo(() => diffLines(change.oldText, change.newText), [change.oldText, change.newText]);
  const lines = showAll ? result.lines : result.lines.slice(0, VISIBLE_LINES);
  const added = result.lines.filter((line) => line.type === 'add').length;
  const removed = result.lines.filter((line) => line.type === 'del').length;

  return (
    <div className="diff">
      <p className="diff__totals">
        <span className="diff__added">{added} added</span>, <span className="diff__removed">{removed} removed</span>
        {change.op === 'write' && ', whole file written'}
        {result.approximate && ', too large to compare line by line'}
        {change.truncated && ', cut to the first 100,000 characters'}
      </p>
      <pre className="diff__body" aria-label={`Diff of ${change.file}`}>
        {lines.map((line, index) => (
          <span key={index} className={`diff__line diff__line--${line.type}`}>
            <span className="diff__mark" aria-hidden="true">
              {MARKS[line.type]}
            </span>
            {line.text || ' '}
          </span>
        ))}
      </pre>
      {!showAll && result.lines.length > VISIBLE_LINES && (
        <button type="button" className="button button--quiet" onClick={() => setShowAll(true)}>
          Show all {result.lines.length} lines
        </button>
      )}
    </div>
  );
}
