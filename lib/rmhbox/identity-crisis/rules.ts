/**
 * RMHbox — Identity Crisis pure rules: the draw, the turn order, the plurality
 * of a vote, the cleaning of member text, the matching of a guess and the
 * scoring. No I/O and no clock: randomness and the matcher are passed in, so
 * every rule is testable on its own. The fuse.js matcher itself lives in the
 * server handler (it never ships to a client).
 */

import {
  IC_CORRECT_GUESS,
  IC_EARLY_BONUS_BASE,
  IC_EARLY_PENALTY,
  IC_EFFICIENCY_BONUS,
  IC_MAX_GUESS_LENGTH,
  IC_MAX_QUESTION_LENGTH,
  IC_MIN_GUESS_LENGTH,
  IC_MIN_QUESTION_LENGTH,
} from './settings';
import { shuffle } from '@/lib/core/rng';
import type { Vote } from './schemas';

// ─── Identities ──────────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Identity {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  difficulty: Difficulty;
}

export type Rng = () => number;

/**
 * The difficulties a game draws from: the first game of a lobby session only
 * the easy ones, later games easy and medium; `hard` joins only when the host
 * switched `hardIdentities` on.
 */
export function difficultiesFor(gameNumber: number, hardIdentities: boolean): Difficulty[] {
  const tiers: Difficulty[] = gameNumber <= 1 ? ['easy'] : ['easy', 'medium'];
  if (hardIdentities) tiers.push('hard');
  return tiers;
}

export interface DrawOptions {
  /** 1 for the first Identity Crisis game of this lobby session. */
  gameNumber: number;
  hardIdentities: boolean;
  rng?: Rng;
}

/**
 * Draw one identity per player without replacement, in `playerIds` order. No
 * two from the same category while an unused category is left in the pool. If
 * the difficulty pool holds fewer identities than there are players, the whole
 * list is the pool; if even that is too small the result is shorter than
 * `playerIds` (the caller refuses to start).
 */
export function drawIdentities(
  pool: readonly Identity[],
  playerIds: readonly string[],
  options: DrawOptions,
): Identity[] {
  const rng = options.rng ?? Math.random;
  const tiers = difficultiesFor(options.gameNumber, options.hardIdentities);
  let candidates = pool.filter((identity) => tiers.includes(identity.difficulty));
  if (candidates.length < playerIds.length) candidates = [...pool];

  const remaining = shuffle(candidates, rng);
  const usedCategories = new Set<string>();
  const drawn: Identity[] = [];
  for (let i = 0; i < playerIds.length; i++) {
    let at = remaining.findIndex((identity) => !usedCategories.has(identity.category));
    if (at === -1) at = 0;
    const [picked] = remaining.splice(at, 1);
    if (!picked) break;
    usedCategories.add(picked.category);
    drawn.push(picked);
  }
  return drawn;
}

/** A random asking order. */
export function turnOrder(playerIds: readonly string[], rng: Rng = Math.random): string[] {
  return shuffle(playerIds, rng);
}

/** The player whose turn slot `cursor` is: round `floor(cursor / n)`, seat `cursor % n`. */
export function seatAt(order: readonly string[], cursor: number): string | undefined {
  if (order.length === 0 || cursor < 0) return undefined;
  return order[cursor % order.length];
}

// ─── Member text ─────────────────────────────────────────────────

/**
 * Control characters (C0, DEL, C1) become spaces, whitespace runs collapse to
 * one space and the ends are trimmed. Newlines and tabs are whitespace too, so
 * a question is always one line.
 */
export function cleanText(raw: string): string {
  let spaced = '';
  for (const char of raw) {
    const code = char.codePointAt(0)!;
    const control = code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    spaced += control ? ' ' : char;
  }
  return spaced.replace(/\s+/g, ' ').trim();
}

function lengthOf(text: string): number {
  return Array.from(text).length;
}

/** A question as it will be shown, or null when its cleaned length is not 3 to 200 characters. */
export function cleanQuestion(raw: string): string | null {
  const text = cleanText(raw);
  const length = lengthOf(text);
  if (length < IC_MIN_QUESTION_LENGTH || length > IC_MAX_QUESTION_LENGTH) return null;
  return text;
}

/** A guess as it will be matched, or null when its cleaned length is not 1 to 100 characters. */
export function cleanGuess(raw: string): string | null {
  const text = cleanText(raw);
  const length = lengthOf(text);
  if (length < IC_MIN_GUESS_LENGTH || length > IC_MAX_GUESS_LENGTH) return null;
  return text;
}

// ─── Votes ───────────────────────────────────────────────────────

export interface VoteCounts {
  yes: number;
  no: number;
  maybe: number;
}

export type Plurality = 'yes' | 'no' | 'maybe' | 'split';

export function tally(votes: Iterable<Vote>): VoteCounts {
  const counts: VoteCounts = { yes: 0, no: 0, maybe: 0 };
  for (const vote of votes) counts[vote]++;
  return counts;
}

/** The answer with strictly the most votes; any tie for the top (and no votes at all) is "split". */
export function plurality(counts: VoteCounts): Plurality {
  const top = Math.max(counts.yes, counts.no, counts.maybe);
  const leaders = (['yes', 'no', 'maybe'] as const).filter((answer) => counts[answer] === top);
  return top > 0 && leaders.length === 1 ? leaders[0]! : 'split';
}

// ─── Guesses ─────────────────────────────────────────────────────

/** Lower case, accents and punctuation gone, one space between words. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Shortest guess (normalised) that is matched at all: one or two letters would fuzzy-match nearly anything. */
export const IC_MIN_MATCH_LENGTH = 3;

export type GuessMatcher = (normalizedGuess: string, identity: Identity) => boolean;

export interface JudgedGuess {
  /** The cleaned text of the guess. */
  text: string;
  correct: boolean;
}

/** Judge a guess against an identity through the matcher; null if the text is not a guess at all. */
export function judgeGuess(raw: string, identity: Identity, matcher: GuessMatcher): JudgedGuess | null {
  const text = cleanGuess(raw);
  if (text === null) return null;
  const normalized = normalizeForMatch(text);
  if (normalized.length < IC_MIN_MATCH_LENGTH) return { text, correct: false };
  return { text, correct: matcher(normalized, identity) };
}

// ─── Scoring ─────────────────────────────────────────────────────

/** An early correct guess: 200 + 300 x (question slots left / slots in all). */
export function earlyCorrectPoints(slotsLeft: number, slotsTotal: number): number {
  const ratio = slotsTotal > 0 ? Math.min(1, Math.max(0, slotsLeft / slotsTotal)) : 0;
  return IC_CORRECT_GUESS + Math.round(IC_EARLY_BONUS_BASE * ratio);
}

/** A wrong early guess. */
export const EARLY_WRONG_POINTS = IC_EARLY_PENALTY;

/** A correct guess in the final phase: no bonus. */
export const FINAL_CORRECT_POINTS = IC_CORRECT_GUESS;

/** 20 points for each question slot a correct guesser did not use. */
export function efficiencyPoints(slotsLeft: number): number {
  return IC_EFFICIENCY_BONUS * Math.max(0, slotsLeft);
}
