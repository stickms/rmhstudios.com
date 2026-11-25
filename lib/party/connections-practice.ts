/**
 * Connections grids — the rules of a guess, kept pure so the server and the author's practice mode judge a guess the
 * same way. The server (`submitGuess`) calls `judgeGuess` over the grid it just re-read inside its transaction; the
 * "Try it" mode calls it in the browser over the author's own groups and writes nothing.
 */
import { MAX_MISTAKES, type GridGroup } from '@/lib/party/connections';

/** FNV-style hash so every viewer sees the same shuffled order for a grid. */
export function stableOrder(id: string, items: string[]): string[] {
  const h = (s: string) => {
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
    return x >>> 0;
  };
  return [...items].sort((a, b) => h(id + a) - h(id + b));
}

/** A play in progress: the indices of the groups found so far, the mistakes made, and where it stands. */
export interface PlayProgress {
  found: number[];
  mistakes: number;
  status: 'active' | 'solved' | 'failed';
}

export const freshProgress = (): PlayProgress => ({ found: [], mistakes: 0, status: 'active' });

export type GuessJudgement =
  | { kind: 'invalid'; reason: 'not-four' | 'unknown-item' | 'item-solved' }
  | { kind: 'finished' }
  | { kind: 'hit'; index: number; progress: PlayProgress }
  | { kind: 'miss'; oneAway: boolean; progress: PlayProgress };

const lowerAll = (items: string[]) => items.map((i) => i.toLowerCase());

/** The four picked items are four different items of this grid (case-insensitive, as stored). */
export function validatePick(groups: GridGroup[], items: string[]): 'not-four' | 'unknown-item' | null {
  const lower = lowerAll(items);
  if (new Set(lower).size !== 4) return 'not-four';
  const all = new Set(groups.flatMap((x) => lowerAll(x.items)));
  return lower.every((i) => all.has(i)) ? null : 'unknown-item';
}

/** Judge one guess against the grid's groups and the play so far. Pure: the caller stores the new progress. */
export function judgeGuess(groups: GridGroup[], progress: PlayProgress, items: string[]): GuessJudgement {
  const invalid = validatePick(groups, items);
  if (invalid) return { kind: 'invalid', reason: invalid };
  if (progress.status !== 'active') return { kind: 'finished' };
  const lower = lowerAll(items);
  const { found } = progress;
  if (found.some((idx) => (groups[idx]?.items ?? []).some((i) => lower.includes(i.toLowerCase())))) {
    return { kind: 'invalid', reason: 'item-solved' };
  }
  const hit = groups.findIndex(
    (grp, idx) => !found.includes(idx) && grp.items.every((i) => lower.includes(i.toLowerCase())),
  );
  if (hit >= 0) {
    const nextFound = [...found, hit];
    return {
      kind: 'hit',
      index: hit,
      progress: { found: nextFound, mistakes: progress.mistakes, status: nextFound.length === 4 ? 'solved' : 'active' },
    };
  }
  const oneAway = groups.some((grp) => grp.items.filter((i) => lower.includes(i.toLowerCase())).length === 3);
  const mistakes = progress.mistakes + 1;
  return {
    kind: 'miss',
    oneAway,
    progress: { found, mistakes, status: mistakes >= MAX_MISTAKES ? 'failed' : 'active' },
  };
}

/** Whether a title and four groups are a complete grid: the checks `createGridSchema` makes, without zod. */
export function isCompleteGrid(title: string, groups: GridGroup[]): boolean {
  if (title.trim().length < 3 || groups.length !== 4) return false;
  if (!groups.every((g) => g.label.trim().length >= 2 && g.items.length === 4)) return false;
  const items = groups.flatMap((g) => g.items.map((i) => i.trim().toLowerCase()));
  if (items.length !== 16 || !items.every(Boolean) || new Set(items).size !== 16) return false;
  return new Set(groups.map((g) => g.label.trim().toLowerCase())).size === 4;
}

/** The practice board: the sixteen items in the order every player of this grid sees, minus the groups found. */
export function practiceBoard(seed: string, groups: GridGroup[], progress: PlayProgress): string[] {
  const solved = new Set(progress.found.flatMap((idx) => groups[idx]?.items ?? []));
  return stableOrder(
    seed,
    groups.flatMap((g) => g.items),
  ).filter((i) => !solved.has(i));
}

export type PracticeOutcome =
  | { ok: false; reason: 'not-four' | 'unknown-item' | 'item-solved' | 'finished' }
  | {
      ok: true;
      correct: boolean;
      oneAway: boolean;
      group: { index: number; label: string; items: string[] } | null;
      progress: PlayProgress;
    };

/** One practice guess: the browser's version of `submitGuess`, writing nothing. */
export function practiceGuess(groups: GridGroup[], progress: PlayProgress, items: string[]): PracticeOutcome {
  const j = judgeGuess(groups, progress, items);
  if (j.kind === 'invalid') return { ok: false, reason: j.reason };
  if (j.kind === 'finished') return { ok: false, reason: 'finished' };
  if (j.kind === 'hit') {
    const g = groups[j.index]!;
    return {
      ok: true,
      correct: true,
      oneAway: false,
      group: { index: j.index, label: g.label, items: g.items },
      progress: j.progress,
    };
  }
  return { ok: true, correct: false, oneAway: j.oneAway, group: null, progress: j.progress };
}
