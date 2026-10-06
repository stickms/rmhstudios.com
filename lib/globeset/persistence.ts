/**
 * GlobeSet's local store: the in-progress run, and the player's own record.
 *
 * Two things live here, for two different reasons.
 *
 * **The in-progress run.** GlobeSet is the only daily mode that is ranked on the
 * clock and takes minutes rather than seconds, so a reload in the middle is a
 * lost run unless something writes it down. The snapshot is the board, the
 * draw cursor and the elapsed milliseconds — never a start timestamp, because
 * a start timestamp keeps counting while the tab is closed and would hand a
 * player a four-hour run for going to lunch.
 *
 * **The record.** Best time, runs finished, GlobeSets taken, and the dates
 * played, which is what the streak is computed from.
 *
 * Every read is defensive: `localStorage` throws outright in some privacy
 * modes, returns stale JSON from an older build, and is trivially editable by
 * the player. A restored snapshot is therefore *verified against the deal*
 * ({@link snapshotMatchesDeck}) rather than trusted — a board that is not
 * reachable from the day's deck is dropped and the run restarts, which is the
 * correct outcome for both a corrupted write and a hand-edited one. The
 * leaderboard never reads any of this: it ranks the server's rows.
 */

import { isCard, type Card } from './cards';
import { dealForDate } from './game';

const RUN_KEY = 'rmh-globeset-run';
const STATS_KEY = 'rmh-globeset-stats';
const VERSION = 1;
/** Dates kept for the streak. A year of history is far more than it needs. */
const MAX_PLAYED_DATES = 400;

export interface RunSnapshot {
  v: number;
  dateKey: string;
  board: Card[];
  drawIndex: number;
  found: { cards: Card[]; atMs: number; bySolver: boolean }[];
  misses: number;
  hints: number;
  solverUsed: boolean;
  elapsedMs: number;
  updatedAt: number;
}

export interface GlobeSetStats {
  v: number;
  runs: number;
  bestSeconds: number | null;
  totalGlobeSets: number;
  playedDates: string[];
}

const EMPTY_STATS: GlobeSetStats = {
  v: VERSION,
  runs: 0,
  bestSeconds: null,
  totalGlobeSets: 0,
  playedDates: [],
};

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota, privacy mode, disabled storage — the run still plays */
  }
}

function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ─── The in-progress run ────────────────────────────────────────────────── */

/**
 * Is this snapshot reachable from the day's deal?
 *
 * The cards face-up plus the cards already taken must be exactly the first
 * `drawIndex` cards of the deck — the one invariant every legal run preserves.
 * That single check rejects a truncated write, a snapshot from a different
 * day's deck, and a hand-edited board that "already found" ten GlobeSets.
 */
export function snapshotMatchesDeck(snapshot: RunSnapshot, deck: readonly Card[]): boolean {
  if (!Number.isInteger(snapshot.drawIndex)) return false;
  if (snapshot.drawIndex < 0 || snapshot.drawIndex > deck.length) return false;
  if (!Array.isArray(snapshot.board) || !snapshot.board.every(isCard)) return false;
  if (!Array.isArray(snapshot.found)) return false;

  const dealt = new Set(deck.slice(0, snapshot.drawIndex));
  const accounted = new Set<Card>();
  for (const card of snapshot.board) {
    if (accounted.has(card)) return false;
    accounted.add(card);
  }
  for (const entry of snapshot.found) {
    if (!Array.isArray(entry?.cards) || !entry.cards.every(isCard)) return false;
    for (const card of entry.cards) {
      if (accounted.has(card)) return false;
      accounted.add(card);
    }
  }
  if (accounted.size !== dealt.size) return false;
  for (const card of accounted) if (!dealt.has(card)) return false;
  return true;
}

/** The saved run for `dateKey`, or `null` when there is nothing usable. */
export function loadRun(dateKey: string): RunSnapshot | null {
  const saved = readJson<RunSnapshot>(RUN_KEY);
  if (!saved || saved.v !== VERSION || saved.dateKey !== dateKey) return null;
  if (typeof saved.elapsedMs !== 'number' || !Number.isFinite(saved.elapsedMs)) return null;
  if (saved.elapsedMs < 0) return null;
  if (!snapshotMatchesDeck(saved, dealForDate(dateKey))) {
    removeKey(RUN_KEY);
    return null;
  }
  return saved;
}

export function saveRun(snapshot: Omit<RunSnapshot, 'v' | 'updatedAt'>): void {
  writeJson(RUN_KEY, { ...snapshot, v: VERSION, updatedAt: Date.now() });
}

/** Drop the saved run — on completion, or when the player restarts the day. */
export function clearRun(): void {
  removeKey(RUN_KEY);
}

/* ─── The player's record ────────────────────────────────────────────────── */

export function loadStats(): GlobeSetStats {
  const saved = readJson<GlobeSetStats>(STATS_KEY);
  if (!saved || saved.v !== VERSION) return { ...EMPTY_STATS };
  return {
    v: VERSION,
    runs: Number.isFinite(saved.runs) ? Math.max(0, Math.floor(saved.runs)) : 0,
    bestSeconds:
      typeof saved.bestSeconds === 'number' && Number.isFinite(saved.bestSeconds)
        ? saved.bestSeconds
        : null,
    totalGlobeSets: Number.isFinite(saved.totalGlobeSets)
      ? Math.max(0, Math.floor(saved.totalGlobeSets))
      : 0,
    playedDates: Array.isArray(saved.playedDates)
      ? saved.playedDates.filter((d) => typeof d === 'string').slice(-MAX_PLAYED_DATES)
      : [],
  };
}

/**
 * Fold a finished run into the record.
 *
 * A run the auto-solver finished counts as played — it keeps the streak, which
 * is the point of giving people a way out — but it never sets a best time.
 */
export function recordCompletion(input: {
  dateKey: string;
  timeSeconds: number;
  globeSets: number;
  solverUsed: boolean;
}): GlobeSetStats {
  const stats = loadStats();
  const dates = new Set(stats.playedDates);
  const firstTimeToday = !dates.has(input.dateKey);
  dates.add(input.dateKey);

  const next: GlobeSetStats = {
    v: VERSION,
    runs: stats.runs + (firstTimeToday ? 1 : 0),
    bestSeconds:
      input.solverUsed || input.timeSeconds <= 0
        ? stats.bestSeconds
        : stats.bestSeconds == null
          ? input.timeSeconds
          : Math.min(stats.bestSeconds, input.timeSeconds),
    totalGlobeSets: stats.totalGlobeSets + (firstTimeToday ? input.globeSets : 0),
    playedDates: [...dates].sort().slice(-MAX_PLAYED_DATES),
  };
  writeJson(STATS_KEY, next);
  return next;
}

/**
 * Consecutive days played, ending today or yesterday.
 *
 * Yesterday still counts so the number does not read as broken at 9am before
 * today's run — the same rule the Daily Puzzles hub uses for its streak.
 */
export function streakFrom(playedDates: readonly string[], todayKey: string): number {
  const played = new Set(playedDates);
  const cursor = new Date(`${todayKey}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return 0;

  const key = () => cursor.toISOString().slice(0, 10);
  if (!played.has(key())) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!played.has(key())) return 0;
  }
  let streak = 0;
  while (played.has(key())) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
