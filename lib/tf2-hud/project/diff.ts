/**
 * Line diff (Myers, O(ND)) with common prefix/suffix trimming, for the
 * changed-files view. Inputs larger than `MAX_LINES` in the differing middle
 * fall back to a single replace hunk instead of risking a long stall.
 */

export type DiffKind = 'eq' | 'add' | 'del';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** 1-based line numbers in the old / new text (absent on the other side). */
  oldLine?: number;
  newLine?: number;
}

const MAX_LINES = 6000;

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function myers(a: string[], b: string[]): { kind: DiffKind; text: string }[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  const out: { kind: DiffKind; text: string }[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = prev[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      out.push({ kind: 'eq', text: a[x] });
    }
    if (down) {
      y--;
      out.push({ kind: 'add', text: b[y] });
    } else {
      x--;
      out.push({ kind: 'del', text: a[x] });
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    out.push({ kind: 'eq', text: a[x] });
  }
  return out.reverse();
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);
  const middle =
    middleA.length + middleB.length > MAX_LINES
      ? [
          ...middleA.map((text) => ({ kind: 'del' as const, text })),
          ...middleB.map((text) => ({ kind: 'add' as const, text })),
        ]
      : myers(middleA, middleB);

  const all: { kind: DiffKind; text: string }[] = [
    ...a.slice(0, start).map((text) => ({ kind: 'eq' as const, text })),
    ...middle,
    ...a.slice(endA).map((text) => ({ kind: 'eq' as const, text })),
  ];

  let o = 0;
  let nw = 0;
  return all.map((l) => {
    if (l.kind === 'eq') return { ...l, oldLine: ++o, newLine: ++nw };
    if (l.kind === 'del') return { ...l, oldLine: ++o };
    return { ...l, newLine: ++nw };
  });
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(lines: readonly DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === 'add') added++;
    else if (l.kind === 'del') removed++;
  }
  return { added, removed };
}

/** Collapse long unchanged runs into context windows; `null` marks a gap. */
export function withContext(lines: readonly DiffLine[], context = 3): (DiffLine | null)[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === 'eq') return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
      keep[j] = true;
    }
  });
  const out: (DiffLine | null)[] = [];
  let gap = false;
  lines.forEach((l, i) => {
    if (keep[i]) {
      out.push(l);
      gap = false;
    } else if (!gap) {
      out.push(null);
      gap = true;
    }
  });
  return out;
}
