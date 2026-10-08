import { open } from 'node:fs/promises';
import { buildConversation } from '../shared/conversation.js';
import type { ConversationItem } from '../shared/types.js';
import { normalizeLine } from './normalize.js';

const TAIL_BYTES = 16 * 1024 * 1024;

/**
 * Read a transcript's last 16 MB and build its conversation. A cut first line is dropped.
 * @param path - transcript path
 * @returns chat items
 */
export async function readConversation(path: string): Promise<ConversationItem[]> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    return buildConversation(lines.flatMap((raw) => {
      try {
        return normalizeLine(JSON.parse(raw));
      } catch {
        return [];
      }
    }));
  } finally {
    await file.close();
  }
}
