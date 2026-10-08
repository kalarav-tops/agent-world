import type { ConversationItem, WorldEvent } from './types.js';

/** Most items a conversation view holds. */
export const CONVERSATION_LIMIT = 2000;

/**
 * A main transcript's events as chat: your prompts, the agent's messages, and its tool calls with
 * their outcome. Thinking, interruptions and metadata are left out.
 * @param events - normalized events of the main transcript, in order
 * @param limit - most items kept, newest last
 * @returns chat items
 */
export function buildConversation(events: WorldEvent[], limit = CONVERSATION_LIMIT): ConversationItem[] {
  const items: ConversationItem[] = [];
  const tools = new Map<string, number>();
  for (const event of events) {
    if (event.kind === 'prompt') items.push({ kind: 'prompt', at: event.at, text: event.text });
    if (event.kind === 'text' && event.text.trim()) items.push({ kind: 'reply', at: event.at, text: event.text });
    if (event.kind === 'tool') {
      tools.set(event.toolUseId, items.length);
      items.push({ kind: 'tool', at: event.at, toolUseId: event.toolUseId, tool: event.tool, summary: event.summary, state: 'running' });
    }
    if (event.kind === 'toolResult') {
      const index = tools.get(event.toolUseId);
      const item = index === undefined ? undefined : items[index];
      if (item?.kind === 'tool') items[index as number] = { ...item, state: event.isError ? 'error' : 'done' };
    }
  }
  return items.slice(-limit);
}
