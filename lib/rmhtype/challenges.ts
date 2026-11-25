/**
 * RMHType challenges (s11-12): send your best run on a curated passage to a mutual, who races the snapshot ghost in
 * one attempt. Pure and client-safe; the server module, the socket hub, the page and the tests share it.
 *
 * Only a curated passage can be challenged: a standard passage (`easy-01`, …) or a code snippet (`code-ts-debounce`).
 * A saved text (`text:<id>`, private), a written-to-order passage (`ai-…`), a news-sentence passage (`lore-…`, a
 * different run of sentences each time) and anything else has no text that is the same for both members.
 *
 * The result is settled from the server's own figures, checked: see `evaluateFinish` (`run-check.ts`, re-exported here)
 * and {@link decideOutcome}.
 */
import { PASSAGES } from '@/lib/rmhtype/passages';
import { CODE_SNIPPETS } from '@/lib/rmhtype/sources';
import { MIN_GHOST_ACCURACY, isPlausibleGhost, isSampleArray } from '@/lib/rmhtype/ghost';
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

/** Open challenges a member can have sent at once. */
export const MAX_OPEN_CHALLENGES = 10;
/** Open challenges from one member to the same opponent. */
export const MAX_OPEN_PER_OPPONENT = 3;
/** A challenge nobody races lapses after this long. */
export const CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A race that has been `racing` this long is settled as "Did not finish" (a hub restart loses the room). */
export const RACING_STALE_MS = 15 * 60 * 1000;
/** The settled challenges the page lists. */
export const SETTLED_LIST_LIMIT = 50;
/** A run under this accuracy cannot win (the ghost rule). */
export const MIN_CHALLENGE_ACCURACY = MIN_GHOST_ACCURACY;

export type ChallengeStatus = 'pending' | 'racing' | 'done' | 'declined' | 'expired';
export type ChallengeOutcome = 'challenger' | 'opponent' | 'draw';

/** A curated passage a challenge can be about. */
export interface ChallengePassage {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** A code snippet is practice on the board (the hub's `aiPassage`), a standard passage is ranked. */
  code: boolean;
}

const CODE_PREFIX = 'code-';

/** The curated passage behind an id, or `null` for a saved text, a generated or lore passage and an unknown id. */
export function challengePassage(passageId: string): ChallengePassage | null {
  if (passageId.startsWith(CODE_PREFIX)) {
    const snippet = CODE_SNIPPETS.find((s) => s.id === passageId.slice(CODE_PREFIX.length));
    return snippet ? { id: passageId, text: snippet.text, difficulty: 'medium', code: true } : null;
  }
  const passage = PASSAGES.find((p) => p.id === passageId);
  return passage ? { id: passage.id, text: passage.text, difficulty: passage.difficulty, code: false } : null;
}

/** Whether a passage id can be sent as a challenge. */
export function isChallengeablePassage(passageId: string): boolean {
  return challengePassage(passageId) !== null;
}

/** A short name for a passage: its first words, or a code snippet's id. Member-independent, so never translated. */
export function passageTitle(passageId: string): string {
  const passage = challengePassage(passageId);
  if (!passage) return passageId;
  if (passage.code) return passageId.slice(CODE_PREFIX.length);
  const words = passage.text.split(/\s+/).slice(0, 4).join(' ');
  return passage.text.split(/\s+/).length > 4 ? `${words}…` : words;
}

/** What a challenge stores of the challenger's best run. */
export interface ChallengeSnapshot {
  wpm: number;
  accuracy: number;
  timeMs: number;
  samples: number[];
}

/**
 * Whether a copy of a ghost is believable: a finite speed within the cap, an accuracy that could have kept the ghost,
 * a whole-millisecond time and a curve that passes {@link isPlausibleGhost} against the passage.
 */
export function isChallengeSnapshot(snapshot: unknown, passageId: string): snapshot is ChallengeSnapshot {
  const passage = challengePassage(passageId);
  if (!passage || typeof snapshot !== 'object' || snapshot === null) return false;
  const s = snapshot as Record<string, unknown>;
  const { wpm, accuracy, timeMs, samples } = s;
  if (typeof wpm !== 'number' || !Number.isFinite(wpm) || wpm <= 0 || wpm > MAX_WPM) return false;
  if (typeof accuracy !== 'number' || !(accuracy >= MIN_CHALLENGE_ACCURACY) || accuracy > 100) return false;
  if (typeof timeMs !== 'number' || !Number.isInteger(timeMs) || timeMs <= 0) return false;
  if (!isSampleArray(samples)) return false;
  return isPlausibleGhost(samples, { passageLength: passage.text.length, timeMs });
}

/** A member's name set apart (first-strong isolate), so it keeps its direction inside a translated sentence. */
export const isolate = (name: string) => `\u2068${name}\u2069`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export { clampRunCounts, evaluateFinish } from '@/lib/rmhtype/run-check';
export type { RaceFigures, RunReason } from '@/lib/rmhtype/run-check';

/**
 * Who won. The higher speed, provided accuracy is at least 90%; a run under 90% or one that did not finish loses; the
 * same speed to two decimals is a draw.
 */
export function decideOutcome(
  challengerWpm: number,
  opponent: { finished: boolean; wpm: number; accuracy: number },
): ChallengeOutcome {
  if (!opponent.finished || !(opponent.accuracy >= MIN_CHALLENGE_ACCURACY)) return 'challenger';
  const a = round2(challengerWpm);
  const b = round2(opponent.wpm);
  if (b > a) return 'opponent';
  return b === a ? 'draw' : 'challenger';
}

/** A challenge as the page lists it. */
export interface ChallengeMember {
  id: string;
  name: string;
  handle: string | null;
}

export interface ChallengeRow {
  id: string;
  /** Which side the reader is on. */
  role: 'challenger' | 'opponent';
  passageId: string;
  title: string;
  status: ChallengeStatus;
  challengerWpm: number;
  challengerAccuracy: number;
  challengerTimeMs: number;
  opponentWpm: number | null;
  opponentAccuracy: number | null;
  opponentTimeMs: number | null;
  outcome: ChallengeOutcome | null;
  /** `false` is "Did not finish". */
  finished: boolean | null;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
  challenger: ChallengeMember;
  opponent: ChallengeMember;
}

export interface ChallengesView {
  /** Whether the reader accepts challenges (the switch). */
  enabled: boolean;
  received: ChallengeRow[];
  sent: ChallengeRow[];
  settled: ChallengeRow[];
}

/** What the reader's side of a settled challenge was: won, lost, drew, or (the opponent only) did not finish. */
export type ChallengeResult = 'won' | 'lost' | 'drew' | 'unfinished' | 'forfeited';

/**
 * The result from the reader's side. A "Did not finish" is the opponent's `unfinished` and the challenger's
 * `forfeited` (their opponent never finished), so the page words each in the right voice.
 */
export function resultFor(
  role: 'challenger' | 'opponent',
  outcome: ChallengeOutcome,
  finished: boolean,
): ChallengeResult {
  if (outcome === 'draw') return 'drew';
  if (!finished) return role === 'opponent' ? 'unfinished' : 'forfeited';
  return outcome === role ? 'won' : 'lost';
}

/** One of the member's own bests that can be sent: a ghost on a curated passage. */
export interface ChallengeableRun {
  passageId: string;
  title: string;
  wpm: number;
  timeMs: number;
}
