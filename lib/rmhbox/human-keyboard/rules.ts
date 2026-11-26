/**
 * RMHbox — Human Keyboard rules. Pure: the deal, the cursor over a sentence
 * with spaces, the judging of one press, the rate limit, scoring and the team
 * multiplier. The hub (server/rmhbox/minigames/human-keyboard) holds the state
 * and the clocks and calls these.
 */

import { shuffle } from '../../core/rng';
import {
  HK_COMPLETION_BONUS,
  HK_CORRECT_KEY,
  HK_GOOD_MULTIPLIER,
  HK_INCOMPLETE_MULTIPLIER,
  HK_MVP_BONUS,
  HK_OUTSTANDING_MULTIPLIER,
  HK_OUTSTANDING_SHARE,
  HK_PERFECT_ACCURACY_BONUS,
  HK_TIME_BONUS_PER_SECOND,
  HK_WRONG_KEY_PENALTY,
} from './settings';

export const HK_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Sentence {
  id: string;
  text: string;
  difficulty: Difficulty;
  category: string;
}

export const HK_MIN_SENTENCE_LENGTH = 20;
export const HK_MAX_SENTENCE_LENGTH = 60;

/** Lowercase letters and single spaces only, 20 to 60 characters, no space at either end. */
export function isValidSentenceText(text: string): boolean {
  return (
    text.length >= HK_MIN_SENTENCE_LENGTH && text.length <= HK_MAX_SENTENCE_LENGTH && /^[a-z]+(?: [a-z]+)*$/.test(text)
  );
}

// ─── Deal ────────────────────────────────────────────────────────

/**
 * Deal the 26 letters round-robin from a shuffled alphabet. Every letter goes to
 * exactly one player, letters the sentence never uses included, and each
 * player's letters are sorted for the pad.
 */
export function dealLetters(playerIds: readonly string[], rng: () => number = Math.random): Map<string, string[]> {
  const deal = new Map<string, string[]>();
  for (const id of playerIds) deal.set(id, []);
  if (playerIds.length === 0) return deal;
  shuffle(HK_ALPHABET.split(''), rng).forEach((letter, i) => {
    deal.get(playerIds[i % playerIds.length] as string)?.push(letter);
  });
  for (const letters of deal.values()) letters.sort();
  return deal;
}

/**
 * Move every letter held by `leaving` to the players in `staying`, round-robin
 * from a shuffle, and leave everyone else's letters where they are.
 */
export function redistributeLetters(
  deal: ReadonlyMap<string, readonly string[]>,
  leaving: readonly string[],
  staying: readonly string[],
  rng: () => number = Math.random,
): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const [id, letters] of deal) next.set(id, leaving.includes(id) ? [] : [...letters]);
  if (staying.length === 0) return next;
  const orphans: string[] = [];
  for (const id of leaving) orphans.push(...(deal.get(id) ?? []));
  shuffle(orphans, rng).forEach((letter, i) => {
    const to = staying[i % staying.length] as string;
    const held = next.get(to) ?? [];
    held.push(letter);
    next.set(to, held);
  });
  for (const letters of next.values()) letters.sort();
  return next;
}

/** How many letters each player holds: the part of a deal the whole table sees. */
export function letterCounts(deal: ReadonlyMap<string, readonly string[]>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [id, letters] of deal) counts[id] = letters.length;
  return counts;
}

// ─── Cursor ──────────────────────────────────────────────────────

/** The first index at or after `from` that is a letter, or the sentence's length when none is left. */
export function nextLetterIndex(text: string, from: number): number {
  let i = Math.max(0, from);
  while (i < text.length && text[i] === ' ') i++;
  return i;
}

export type PressVerdict =
  /** The sentence is already complete. */
  | 'done'
  /** The cursor rests on a space that advances by itself. */
  | 'spacing'
  /** The letter is not one the presser holds. */
  | 'not_yours'
  /** The next letter, pressed by its holder. */
  | 'correct'
  /** A letter the presser holds that is not the next one. */
  | 'wrong';

/** Judge one press of `letter` by a player who holds `held` while the cursor is at `cursor`. */
export function judgePress(text: string, cursor: number, letter: string, held: readonly string[]): PressVerdict {
  if (cursor >= text.length) return 'done';
  if (text[cursor] === ' ') return 'spacing';
  if (!held.includes(letter)) return 'not_yours';
  return text[cursor] === letter ? 'correct' : 'wrong';
}

/** The press times kept for the rate limit: only those still inside the window. */
export function pruneTimes(times: readonly number[], now: number, windowMs: number): number[] {
  return times.filter((t) => now - t < windowMs);
}

/** A press at `now` is allowed when fewer than `limit` of the player's presses fall in the window. */
export function withinRateLimit(times: readonly number[], now: number, limit: number, windowMs: number): boolean {
  return pruneTimes(times, now, windowMs).length < limit;
}

// ─── Sentences ───────────────────────────────────────────────────

/** Three or four players get an easy or medium sentence; five or more get any. */
export function sentencePool(sentences: readonly Sentence[], playerCount: number): Sentence[] {
  if (playerCount >= 5) return [...sentences];
  const gentle = sentences.filter((s) => s.difficulty !== 'hard');
  return gentle.length > 0 ? gentle : [...sentences];
}

/** One sentence for the player count, one not already used this game while any other is left. */
export function pickSentence(
  sentences: readonly Sentence[],
  playerCount: number,
  usedIds: ReadonlySet<string>,
  rng: () => number = Math.random,
): Sentence | null {
  const pool = sentencePool(sentences, playerCount);
  const fresh = pool.filter((s) => !usedIds.has(s.id));
  const from = fresh.length > 0 ? fresh : pool;
  if (from.length === 0) return null;
  return from[Math.floor(rng() * from.length)] ?? null;
}

// ─── Scoring ─────────────────────────────────────────────────────

/** 1.5 when the table finished within half the time, 1 when it finished, 0.5 when it did not. */
export function teamMultiplier(completed: boolean, elapsedMs: number, limitMs: number): number {
  if (!completed) return HK_INCOMPLETE_MULTIPLIER;
  return elapsedMs <= limitMs * HK_OUTSTANDING_SHARE ? HK_OUTSTANDING_MULTIPLIER : HK_GOOD_MULTIPLIER;
}

export interface PlayerPresses {
  userId: string;
  /** Presses that advanced the cursor. */
  correct: number;
  /** Held letters that were not the next one. */
  wrong: number;
}

export interface PlayerRoundScore {
  userId: string;
  correct: number;
  wrong: number;
  /** The points before the team multiplier. */
  raw: number;
  /** The round's points: raw times the multiplier, rounded, never below 0. */
  points: number;
  perfect: boolean;
  mvp: boolean;
}

export interface RoundScoreInput {
  players: readonly PlayerPresses[];
  completed: boolean;
  /** Whole seconds left when the sentence was completed (0 when it was not). */
  secondsLeft: number;
  elapsedMs: number;
  limitMs: number;
}

/**
 * A round's points (spec 2.3.6): 20 per correct press, 5 off per wrong one, 200
 * for a player with at least one correct and no wrong press, 100 each and 5 a
 * second left when the sentence completes, 100 to the most correct presses
 * (ties share). The multiplier is applied once, to the sum.
 */
export function scoreRound(input: RoundScoreInput): { multiplier: number; players: PlayerRoundScore[] } {
  const multiplier = teamMultiplier(input.completed, input.elapsedMs, input.limitMs);
  const most = input.players.reduce((m, p) => Math.max(m, p.correct), 0);
  const players = input.players.map((p) => {
    const perfect = p.correct > 0 && p.wrong === 0;
    const mvp = most > 0 && p.correct === most;
    const raw =
      p.correct * HK_CORRECT_KEY -
      p.wrong * HK_WRONG_KEY_PENALTY +
      (perfect ? HK_PERFECT_ACCURACY_BONUS : 0) +
      (input.completed ? HK_COMPLETION_BONUS + HK_TIME_BONUS_PER_SECOND * Math.max(0, input.secondsLeft) : 0) +
      (mvp ? HK_MVP_BONUS : 0);
    return {
      userId: p.userId,
      correct: p.correct,
      wrong: p.wrong,
      raw,
      points: Math.max(0, Math.round(raw * multiplier)),
      perfect,
      mvp,
    };
  });
  return { multiplier, players };
}

// ─── Words ───────────────────────────────────────────────────────

/**
 * The word the cursor has just finished, when the last press (or the step over
 * a space) completed one: the text from the start of that word up to the cursor.
 * Null while the cursor is inside a word. The client announces it.
 */
export function completedWord(text: string, cursor: number): string | null {
  if (cursor <= 0 || cursor > text.length) return null;
  if (text[cursor - 1] === ' ') return null;
  if (cursor < text.length && text[cursor] !== ' ') return null;
  const start = text.lastIndexOf(' ', cursor - 1) + 1;
  return text.slice(start, cursor);
}

// ─── Client clock ────────────────────────────────────────────────

/**
 * Whether the client re-renders once a second to draw the countdown: only while
 * a typing phase is live. REVEAL, ROUND_RESULT and a paused game schedule nothing.
 */
export function countdownTicks(phase: string, paused: boolean): boolean {
  return phase === 'TYPING' && !paused;
}
