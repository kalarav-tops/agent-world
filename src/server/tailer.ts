import { open, stat } from 'node:fs/promises';

const NEWLINE = 0x0a;
const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_CHUNKS = 4;

/** Lines read since the last call; `reset` means the file shrank and was read from the start. */
export interface TailResult {
  lines: unknown[];
  reset: boolean;
}

/** Read sizing; a call reads at most `chunkBytes × maxChunksPerRead` bytes. */
export interface TailerOptions {
  chunkBytes?: number;
  maxChunksPerRead?: number;
}

/**
 * Follows an append-only JSONL file, reading only the bytes added since the last call, in
 * bounded chunks so a huge backlog is consumed over several calls instead of one giant buffer.
 * A trailing partial line is held back as bytes (so a split multi-byte character survives)
 * until its newline arrives. Malformed lines are skipped.
 */
export class JsonlTailer {
  private offset = 0;
  private pending: Buffer = Buffer.alloc(0);
  private readonly chunkBytes: number;
  private readonly maxChunks: number;

  /**
   * @param path - file to follow
   * @param options - read sizing
   */
  constructor(
    readonly path: string,
    options: TailerOptions = {},
  ) {
    this.chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    this.maxChunks = options.maxChunksPerRead ?? DEFAULT_MAX_CHUNKS;
  }

  /**
   * Read complete lines appended since the last call, up to the per-call byte budget.
   * @returns parsed lines and whether the file was reset
   */
  async readNew(): Promise<TailResult> {
    const size = await fileSize(this.path);
    if (size === null) return { lines: [], reset: false };
    const reset = size < this.offset;
    if (reset) {
      this.offset = 0;
      this.pending = Buffer.alloc(0);
    }
    const lines: unknown[] = [];
    for (let chunk = 0; chunk < this.maxChunks && this.offset < size; chunk += 1) {
      const bytes = await readRange(this.path, this.offset, Math.min(this.chunkBytes, size - this.offset));
      if (!bytes.length) break;
      this.offset += bytes.length;
      lines.push(...this.consume(bytes));
    }
    return { lines, reset };
  }

  /**
   * Append bytes to the held partial line and parse every line now complete.
   * @param bytes - newly read bytes
   * @returns parsed lines
   */
  private consume(bytes: Buffer): unknown[] {
    const data = this.pending.length ? Buffer.concat([this.pending, bytes]) : bytes;
    const lastNewline = data.lastIndexOf(NEWLINE);
    if (lastNewline < 0) {
      this.pending = data;
      return [];
    }
    this.pending = Buffer.from(data.subarray(lastNewline + 1));
    return parseLines(data.subarray(0, lastNewline));
  }
}

/**
 * Size of a file, or null when it does not exist.
 * @param path - file path
 * @returns size in bytes
 */
async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

/**
 * Read a byte range of a file.
 * @param path - file path
 * @param start - first byte
 * @param length - number of bytes
 * @returns the bytes read
 */
async function readRange(path: string, start: number, length: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Parse newline-separated JSON, skipping blank and malformed lines.
 * @param data - complete lines
 * @returns parsed values
 */
function parseLines(data: Buffer): unknown[] {
  return data
    .toString('utf8')
    .split('\n')
    .flatMap((line) => {
      if (!line.trim()) return [];
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
}
