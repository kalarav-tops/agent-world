import type { ReactElement } from 'react';
import type { ConversationItem } from '../../shared/types';

/**
 * A conversation as chat: your prompts on one side, the agent's replies on the other, and each tool
 * call on a single line with how it ended.
 * @param props - items, or the reason they could not be read
 * @returns the thread
 */
export function Conversation({ items, error }: { items: ConversationItem[]; error: string | null }): ReactElement {
  if (error) return <p className="muted">{error}</p>;
  if (!items.length) return <p className="muted">Nothing has been said yet.</p>;
  return (
    <ol className="chat">
      {items.map((item, index) =>
        item.kind === 'tool' ? (
          <li key={`${item.toolUseId}-${index}`} className={`chat__tool chat__tool--${item.state}`}>
            <span className="mono">{item.tool}</span> · {item.summary}
          </li>
        ) : (
          <li key={index} className={`chat__item chat__item--${item.kind}`}>
            {item.text}
          </li>
        ),
      )}
    </ol>
  );
}
