/**
 * Line diff (Myers, "An O(ND) Difference Algorithm", 1986).
 *
 * Myers finds a shortest edit script in O((N+M)·D) time, where D is the number
 * of differing lines, so two long, mostly equal documents compare quickly —
 * unlike the O(N·M) table of a textbook LCS, which would need 25 million cells
 * for two 5,000-line files.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the original, for `equal` and `delete`. */
  oldLine?: number;
  /** 1-based line number in the changed text, for `equal` and `insert`. */
  newLine?: number;
}

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

export function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
}

function normalise(line: string, opts: DiffOptions): string {
  let out = line;
  if (opts.ignoreWhitespace) out = out.trim().replace(/\s+/g, ' ');
  if (opts.ignoreCase) out = out.toLowerCase();
  return out;
}

/** The shortest edit script turning `a` into `b`, as a list of lines. */
export function diffLines(a: readonly string[], b: readonly string[], opts: DiffOptions = {}): DiffLine[] {
  const na = a.map((l) => normalise(l, opts));
  const nb = b.map((l) => normalise(l, opts));
  const n = na.length;
  const m = nb.length;
  const max = n + m;
  const offset = max;
  let v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    const next = v.slice();
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && na[x] === nb[y]) {
        x++;
        y++;
      }
      next[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(next);
        break outer;
      }
    }
    v = next;
  }

  // Walk the trace backwards from (n, m) to (0, 0), emitting the moves.
  const out: DiffLine[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 2; d >= 0; d--) {
    const vd = trace[d] as Int32Array;
    const k = x - y;
    const down = k === -d || (k !== d && (vd[offset + k - 1] ?? 0) < (vd[offset + k + 1] ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = vd[offset + prevK] ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ op: 'equal', text: b[y - 1] ?? '', oldLine: x, newLine: y });
      x--;
      y--;
    }
    if (d > 0) {
      if (down) out.push({ op: 'insert', text: b[y - 1] ?? '', newLine: y });
      else out.push({ op: 'delete', text: a[x - 1] ?? '', oldLine: x });
    }
    x = prevX;
    y = prevY;
  }
  return out.reverse();
}

export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

export function summarise(lines: readonly DiffLine[]): DiffSummary {
  const s = { added: 0, removed: 0, unchanged: 0 };
  for (const line of lines) {
    if (line.op === 'insert') s.added++;
    else if (line.op === 'delete') s.removed++;
    else s.unchanged++;
  }
  return s;
}

/**
 * A unified diff (`diff -u` format) with `context` lines around each change,
 * ready to paste into a review or `git apply`.
 */
export function unifiedDiff(lines: readonly DiffLine[], context = 3, names = { old: 'a', new: 'b' }): string {
  const changed = lines.map((l, i) => (l.op === 'equal' ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return '';
  // Group changes whose context windows touch into hunks.
  const hunks: [number, number][] = [];
  for (const i of changed) {
    const lo = Math.max(0, i - context);
    const hi = Math.min(lines.length - 1, i + context);
    const last = hunks[hunks.length - 1];
    if (last && lo <= last[1] + 1) last[1] = hi;
    else hunks.push([lo, hi]);
  }
  const out = [`--- ${names.old}`, `+++ ${names.new}`];
  for (const [lo, hi] of hunks) {
    const slice = lines.slice(lo, hi + 1);
    let oldStart = 0;
    let newStart = 0;
    // The line numbers a hunk starts at: the first line it holds on each side, or the line before it.
    for (let i = lo; i >= 0; i--) {
      const l = lines[i];
      if (!oldStart && l?.oldLine) oldStart = i === lo ? l.oldLine : l.oldLine + 1;
      if (!newStart && l?.newLine) newStart = i === lo ? l.newLine : l.newLine + 1;
      if (oldStart && newStart) break;
    }
    const oldCount = slice.filter((l) => l.op !== 'insert').length;
    const newCount = slice.filter((l) => l.op !== 'delete').length;
    if (!oldStart) oldStart = oldCount ? 1 : 0;
    if (!newStart) newStart = newCount ? 1 : 0;
    if (oldCount === 0) oldStart = Math.max(0, oldStart - 1);
    if (newCount === 0) newStart = Math.max(0, newStart - 1);
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const l of slice) out.push(`${l.op === 'insert' ? '+' : l.op === 'delete' ? '-' : ' '}${l.text}`);
  }
  return out.join('\n');
}
