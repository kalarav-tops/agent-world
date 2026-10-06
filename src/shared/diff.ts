/** One line of a rendered diff. */
export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** A line diff; `approximate` means the inputs were too large for an exact diff. */
export interface DiffResult {
  lines: DiffLine[];
  approximate: boolean;
}

const DEFAULT_MAX_CELLS = 4_000_000;

/**
 * Line diff of two texts using a longest-common-subsequence table.
 * Above `maxCells` (old lines × new lines) it shows every old line removed and every new line added.
 * @param oldText - text before
 * @param newText - text after
 * @param maxCells - largest table size to compute exactly
 * @returns the diff
 */
export function diffLines(oldText: string, newText: string, maxCells = DEFAULT_MAX_CELLS): DiffResult {
  const before = oldText === '' ? [] : oldText.split('\n');
  const after = newText === '' ? [] : newText.split('\n');
  if (before.length * after.length > maxCells) {
    return {
      approximate: true,
      lines: [...before.map((text): DiffLine => ({ type: 'del', text })), ...after.map((text): DiffLine => ({ type: 'add', text }))],
    };
  }
  return { approximate: false, lines: walk(before, after, lcsTable(before, after)) };
}

/**
 * Suffix LCS lengths: `table[i][j]` is the LCS length of `before[i..]` and `after[j..]`.
 * @param before - old lines
 * @param after - new lines
 * @returns the table, flattened row by row
 */
function lcsTable(before: string[], after: string[]): Uint32Array {
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j] ? (table[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  return table;
}

/**
 * Walk the LCS table from the start, emitting kept, removed and added lines.
 * @param before - old lines
 * @param after - new lines
 * @param table - LCS table from `lcsTable`
 * @returns diff lines
 */
function walk(before: string[], after: string[], table: Uint32Array): DiffLine[] {
  const width = after.length + 1;
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({ type: 'same', text: before[i] ?? '' });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      lines.push({ type: 'del', text: before[i] ?? '' });
      i += 1;
    } else {
      lines.push({ type: 'add', text: after[j] ?? '' });
      j += 1;
    }
  }
  before.slice(i).forEach((text) => lines.push({ type: 'del', text }));
  after.slice(j).forEach((text) => lines.push({ type: 'add', text }));
  return lines;
}
