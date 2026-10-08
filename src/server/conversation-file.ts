import { open } from 'node:fs/promises';
import { buildConversation } from '../shared/conversation.js';
import type { ConversationItem } from '../shared/types.js';
import { normalizeLine } from './normalize.js';

const TAIL_BYTES = 16 * 1024 * 1024;
const CACHE_LIMIT = 20;

/** The last conversation built per transcript, with the size and time it was built from. */
const cache = new Map<string, { size: number; mtimeMs: number; items: ConversationItem[] }>();

/**
 * Read a transcript's last 16 MB and build its conversation. A cut first line is dropped. While the
 * file's size and modification time are unchanged, the last result is returned without reading it
 * again, so a page polling a long session costs one stat call.
 * @param path - transcript path
 * @returns chat items
 */
export async function readConversation(path: string): Promise<ConversationItem[]> {
  const file = await open(path, 'r');
  try {
    const { size, mtimeMs } = await file.stat();
    const cached = cache.get(path);
    if (cached && cached.size === size && cached.mtimeMs === mtimeMs) return cached.items;
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    const items = buildConversation(lines.flatMap((raw) => {
      try {
        return normalizeLine(JSON.parse(raw));
      } catch {
        return [];
      }
    }));
    remember(path, { size, mtimeMs, items });
    return items;
  } finally {
    await file.close();
  }
}

/**
 * Keep a built conversation, dropping the oldest once the cache is full.
 * @param path - transcript path
 * @param entry - what was built, and from which size and time
 */
function remember(path: string, entry: { size: number; mtimeMs: number; items: ConversationItem[] }): void {
  cache.delete(path);
  cache.set(path, entry);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}
