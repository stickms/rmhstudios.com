/**
 * The line diff the guide history page shows (s09-05): `lib/toolbox/diff.ts` (Myers) behind a size cut-off and a
 * collapse of long unchanged runs. Pure; the page renders the result as a list.
 */
import { diffLines, splitLines, summarise, type DiffLine, type DiffSummary } from '@/lib/toolbox/diff';
import { GUIDE_DIFF_MAX_CHARS } from '@/lib/games/guide-diff-limits';

export type GuideDiffEntry = DiffLine | { op: 'gap'; count: number };

export type GuideDiff =
  { tooLong: true } | { tooLong: false; entries: GuideDiffEntry[]; summary: DiffSummary; identical: boolean };

/** Unchanged lines kept on each side of a change; longer runs collapse to a gap. */
const CONTEXT = 2;

export function collapseUnchanged(lines: readonly DiffLine[], context = CONTEXT): GuideDiffEntry[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.op === 'equal') return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const out: GuideDiffEntry[] = [];
  let hidden = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden > 0) out.push({ op: 'gap', count: hidden });
      hidden = 0;
      out.push(l);
    } else {
      hidden++;
    }
  });
  if (hidden > 0) out.push({ op: 'gap', count: hidden });
  return out;
}

/**
 * Myers keeps a full copy of its state per edit step, so memory and time grow with (lines x edits). Lines the two
 * texts share at the start and end are trimmed first (the usual case: one paragraph changed), and what is left must
 * stay under this many lines, or the browser would stall or run out of memory on a rewrite of a long text.
 */
export const GUIDE_DIFF_MAX_MIDDLE_LINES = 2_500;

/** Compares `before` with `after` (the older text first). Over the limit on either side, nothing is computed. */
export function diffGuideBodies(
  before: string,
  after: string,
  max = GUIDE_DIFF_MAX_CHARS,
  maxMiddle = GUIDE_DIFF_MAX_MIDDLE_LINES,
): GuideDiff {
  if (before.length > max || after.length > max) return { tooLong: true };
  const a = splitLines(before);
  const b = splitLines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  if (midA.length + midB.length > maxMiddle) return { tooLong: true };
  const lines: DiffLine[] = [
    ...a.slice(0, head).map((text, i): DiffLine => ({ op: 'equal', text, oldLine: i + 1, newLine: i + 1 })),
    ...diffLines(midA, midB).map((l): DiffLine => ({
      ...l,
      ...(l.oldLine !== undefined ? { oldLine: l.oldLine + head } : {}),
      ...(l.newLine !== undefined ? { newLine: l.newLine + head } : {}),
    })),
    ...a.slice(a.length - tail).map((text, i): DiffLine => ({
      op: 'equal',
      text,
      oldLine: a.length - tail + i + 1,
      newLine: b.length - tail + i + 1,
    })),
  ];
  const summary = summarise(lines);
  return {
    tooLong: false,
    entries: collapseUnchanged(lines),
    summary,
    identical: summary.added === 0 && summary.removed === 0,
  };
}
