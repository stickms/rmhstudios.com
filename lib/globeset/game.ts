/**
 * GlobeSet's deal and its run state — the rules, with no UI attached.
 *
 * The daily deal is a **date-seeded shuffle of all 63 cards**, so the run every
 * player gets on a given day is byte-identical without a server round trip or a
 * stored row: the same date produces the same permutation everywhere, forever.
 * (The five AI-authored daily modes need `DailyPuzzle` rows because a language
 * model is not a pure function of the date; a shuffle is, so GlobeSet takes the
 * Lights Out route instead — see `lib/daily-puzzles/generate.server.ts`.)
 *
 * The multiplayer race uses the same code with a server-issued seed, which is
 * the whole of its synchronisation: hand every client in the room one 32-bit
 * number and they are racing the identical deal.
 *
 * Run state is a plain value and every transition is a pure function of it, so
 * the same module drives the browser, the race server's authoritative copy and
 * the tests.
 */

import { BOARD_SIZE, DECK_SIZE, fullDeck, isGlobeSet, type Card } from './cards';
import { createSeededRng } from '../daily-puzzles/seed';

/**
 * Mixed into the date seed so GlobeSet's shuffle is uncorrelated with the other
 * date-seeded modes, which derive from the same `YYYYMMDD` integer. "PRST".
 */
const SEED_SALT = 0x50525354;

/** `YYYY-MM-DD` → the 32-bit seed that deals that day's deck. */
export function seedFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map((part) => Number(part) || 0);
  return ((y * 10000 + m * 100 + d) ^ SEED_SALT) >>> 0;
}

/**
 * The full deck, shuffled by a seeded Fisher–Yates.
 *
 * Fisher–Yates rather than a sort comparator: a comparator-based shuffle is
 * biased and, worse, its bias depends on the engine's sort implementation — so
 * two browsers could deal the same seed differently, which is the one thing a
 * daily puzzle may never do.
 */
export function dealFromSeed(seed: number): Card[] {
  const rng = createSeededRng(seed);
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** The deck for a given day. */
export function dealForDate(dateKey: string): Card[] {
  return dealFromSeed(seedFromDateKey(dateKey));
}

/** One GlobeSet the player took, kept for the share card and the replay strip. */
export interface FoundGlobeSet {
  /** The cards taken, in the order they sat on the board. */
  cards: Card[];
  /** Milliseconds into the run when it was taken. */
  atMs: number;
  /** True when the auto-solver took it rather than the player. */
  bySolver: boolean;
}

export type RunStatus = 'playing' | 'complete';

export interface RunState {
  /** The shuffled deck. Never mutated — `drawIndex` walks it. */
  readonly deck: readonly Card[];
  /** Face-up cards. Shrinks below `boardSize` only once the deck is spent. */
  board: Card[];
  /** Next index in `deck` to deal from. */
  drawIndex: number;
  boardSize: number;
  found: FoundGlobeSet[];
  /** Rejected submissions — a wrong guess, not a mis-click on an empty board. */
  misses: number;
  /** Hints taken. Each one reveals one more card of the easiest GlobeSet. */
  hints: number;
  /** Whether the auto-solver finished the run. Ranks as a DNF. */
  solverUsed: boolean;
  status: RunStatus;
}

/** A fresh run over `deck`. The board is dealt immediately. */
export function createRun(deck: readonly Card[], boardSize: number = BOARD_SIZE): RunState {
  const state: RunState = {
    deck,
    board: [],
    drawIndex: 0,
    boardSize,
    found: [],
    misses: 0,
    hints: 0,
    solverUsed: false,
    status: 'playing',
  };
  refill(state);
  return state;
}

/** Top the board up from the deck, in place. */
function refill(state: RunState): void {
  while (state.board.length < state.boardSize && state.drawIndex < state.deck.length) {
    state.board.push(state.deck[state.drawIndex++]);
  }
  if (state.board.length === 0 && state.drawIndex >= state.deck.length) {
    state.status = 'complete';
  }
}

/** Cards neither taken nor face-up — what is left to deal. */
export function cardsRemaining(state: RunState): number {
  return state.deck.length - state.drawIndex + state.board.length;
}

/** How far through the deck the run is, 0–1. Drives the progress rail. */
export function runProgress(state: RunState): number {
  const total = state.deck.length;
  if (total === 0) return 1;
  return (total - cardsRemaining(state)) / total;
}

export type SubmitOutcome = 'accepted' | 'not-a-globeset' | 'empty' | 'finished';

export interface SubmitResult {
  state: RunState;
  outcome: SubmitOutcome;
  /** Set on `accepted` — the cards that just left the board. */
  taken: Card[];
}

/**
 * Submit a selection of board indices.
 *
 * Returns a NEW state rather than mutating: the board component keeps the
 * previous one alive for the length of the exit animation, and the race server
 * rolls a submission back by simply not adopting the result.
 *
 * `atMs` is supplied by the caller rather than read from the clock here so the
 * function stays pure — the server stamps it from its own clock, the browser
 * from the run timer, and a test from a fixture.
 */
export function submitSelection(
  state: RunState,
  indices: readonly number[],
  atMs: number,
): SubmitResult {
  if (state.status === 'complete') return { state, outcome: 'finished', taken: [] };
  if (indices.length === 0) return { state, outcome: 'empty', taken: [] };

  const unique = [...new Set(indices)].sort((a, b) => a - b);
  const inRange = unique.every((i) => Number.isInteger(i) && i >= 0 && i < state.board.length);
  if (!inRange || unique.length !== indices.length) {
    return { state: { ...state, misses: state.misses + 1 }, outcome: 'not-a-globeset', taken: [] };
  }

  const cards = unique.map((i) => state.board[i]);
  if (!isGlobeSet(cards)) {
    return { state: { ...state, misses: state.misses + 1 }, outcome: 'not-a-globeset', taken: [] };
  }

  const taken = new Set(unique);
  const next: RunState = {
    ...state,
    board: state.board.filter((_, i) => !taken.has(i)),
    found: [...state.found, { cards, atMs, bySolver: false }],
  };
  refill(next);
  return { state: next, outcome: 'accepted', taken: cards };
}

/** Charge a hint. Kept here so the penalty and the share card agree on the count. */
export function takeHint(state: RunState): RunState {
  return { ...state, hints: state.hints + 1 };
}

/**
 * Charge a dead end — a selection that can no longer reach a GlobeSet.
 *
 * This is the run's accuracy metric, and the reason it is *recorded* rather
 * than *displayed*: the board claims a GlobeSet the instant the selection XORs to
 * zero, so there is no wrong-answer button to press, and flagging a dead end
 * live would hand the player the solver's answer one card at a time ("this one
 * goes red, so try another"). Counting it silently and showing the total in the
 * results measures how cleanly the deck was read without telling anyone how to
 * read it. The rules panel says so plainly — a penalty nobody is told about is
 * not a metric, it is a trap.
 *
 * Charged once per entry into a dead end, not once per click inside one.
 */
export function recordDeadEnd(state: RunState): RunState {
  return { ...state, misses: state.misses + 1 };
}

/** Record that a step was played by the auto-solver rather than the player. */
export function applySolverStep(
  state: RunState,
  indices: readonly number[],
  atMs: number,
): RunState {
  const result = submitSelection(state, indices, atMs);
  if (result.outcome !== 'accepted') return state;
  const found = [...result.state.found];
  found[found.length - 1] = { ...found[found.length - 1], bySolver: true };
  return { ...result.state, found, solverUsed: true };
}

/* ─── Scoring ────────────────────────────────────────────────────────────── */

/** The time a competent run takes. Everything faster earns a speed bonus. */
export const PAR_SECONDS = 300;

/** Points awarded for simply clearing the deck, before speed and penalties. */
const BASE_POINTS = 500;
/** The most the speed bonus can add — at an (unreachable) instant finish. */
const MAX_SPEED_BONUS = 400;
const MISS_PENALTY = 15;
const HINT_PENALTY = 40;
/** A finished run is always worth something, however messy. */
const FLOOR_POINTS = 10;

/** Everything the share card, the score row and the stats page need about a run. */
export interface RunSummary {
  dateKey: string;
  puzzleNumber: number;
  timeSeconds: number;
  /** Size of each GlobeSet taken, in order. */
  sizes: number[];
  misses: number;
  hints: number;
  solverUsed: boolean;
}

/** Summarise a finished (or abandoned) run. */
export function summarise(
  state: RunState,
  dateKey: string,
  puzzleNumber: number,
  timeSeconds: number,
): RunSummary {
  return {
    dateKey,
    puzzleNumber,
    timeSeconds: Math.max(0, Math.round(timeSeconds)),
    sizes: state.found.map((f) => f.cards.length),
    misses: state.misses,
    hints: state.hints,
    solverUsed: state.solverUsed,
  };
}

/**
 * Points for a run, 0–999 (the range `/api/daily-puzzles/score` accepts).
 *
 * Time is the leaderboard's ranking key — points exist so the Daily Puzzles hub
 * can add GlobeSet into the day's total alongside the five score-based modes. A
 * run the solver finished scores zero: it is recorded, it keeps the streak, and
 * it does not pretend to be a result.
 */
export function scoreRun(summary: RunSummary): number {
  if (summary.solverUsed) return 0;
  const ratio = Math.min(1, summary.timeSeconds / (PAR_SECONDS * 2));
  const speed = Math.round(MAX_SPEED_BONUS * (1 - ratio));
  const penalty = summary.misses * MISS_PENALTY + summary.hints * HINT_PENALTY;
  return Math.max(FLOOR_POINTS, Math.min(999, BASE_POINTS + speed - penalty));
}

/** `m:ss`, or `h:mm:ss` past an hour. Used by the HUD, the share card and the board. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Sanity bound shared by the client and the race server. */
export const MAX_RUN_SECONDS = 3 * 60 * 60;

export { BOARD_SIZE, DECK_SIZE };
