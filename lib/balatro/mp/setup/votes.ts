/**
 * Balatro multiplayer — casual setup votes (MM-03, MM-04, A1 §1.5; D-32).
 *
 * A pure machine the host driver (WS12) runs:
 *
 *     voteStep(state, input) → { state, view, wakeAt, result }
 *
 * - `voting`: each seated voter casts once (a tile, or `random` = a uniform
 *   pick made for them). Who voted is hidden until close; the view only
 *   shows `voted / voters` over the *connected* voters. Closes at the
 *   deadline (default 15 s, clamped 5–120 s), or early once every connected
 *   voter has voted.
 * - Roll: one lottery ticket per cast vote, drawn uniformly over tickets;
 *   with no votes, uniform over the options. Drawn from the seeded RNG at
 *   close, so the result is known from `rolling` on.
 * - `rolling` (1.2 s, the 12 Hz cycle — `rollFrame` gives the option on
 *   screen) → `reveal` (3 s, counts and chances shown) → `done`.
 */

import { Rng, rngSeed } from '../rng';
import { CASUAL_VOTE_RULESETS, TRAP_VOTE_RULESETS } from '../rulesets/rulesets';
import type { Id, QueueMode, SetupView } from '../types';

export const VOTE_TIMING = {
  DEFAULT_WINDOW_MS: 15_000,
  MIN_WINDOW_MS: 5_000,
  MAX_WINDOW_MS: 120_000,
  ROLL_MS: 1_200,
  ROLL_HZ: 12,
  REVEAL_MS: 3_000,
} as const;

export const TRAP_OPTIONS = ['traps_on', 'traps_off'] as const;
export const RANDOM_VOTE = 'random';

export type VoteKind = 'ruleset_vote' | 'trap_vote';
export type VotePhase = 'voting' | 'rolling' | 'reveal' | 'done';

export interface VoteState {
  stepId: string;
  kind: VoteKind;
  options: string[];
  voters: Id[];
  connected: Id[];
  /** voter → option (hidden from the view until close). */
  votes: Record<Id, string>;
  phase: VotePhase;
  openedAt: number;
  deadline: number;
  closedAt: number | null;
  result: string | null;
  rngState: number;
}

export type VoteInput =
  | { t: 'cast'; at: number; from: Id; option: string }
  | { t: 'presence'; at: number; connected: Id[] }
  | { t: 'tick'; at: number };

export interface VoteStep {
  state: VoteState;
  view: SetupView;
  wakeAt: number | null;
  /** Non-null once the vote is `done`. */
  result: string | null;
}

export function clampWindow(ms: number | undefined): number {
  const v = ms === undefined || !Number.isFinite(ms) ? VOTE_TIMING.DEFAULT_WINDOW_MS : ms;
  return Math.max(VOTE_TIMING.MIN_WINDOW_MS, Math.min(VOTE_TIMING.MAX_WINDOW_MS, Math.round(v)));
}

export interface VoteOpen {
  stepId: string;
  kind: VoteKind;
  options: readonly string[];
  voters: readonly Id[];
  connected?: readonly Id[];
  at: number;
  windowMs?: number;
  /** A raw seed from the host driver (mixed with `rngSeed`). */
  rngState: number;
}

export function openVote(o: VoteOpen): VoteState {
  return {
    stepId: o.stepId,
    kind: o.kind,
    options: [...o.options],
    voters: [...o.voters],
    connected: [...(o.connected ?? o.voters)].filter((id) => o.voters.includes(id)),
    votes: {},
    phase: 'voting',
    openedAt: o.at,
    deadline: o.at + clampWindow(o.windowMs),
    closedAt: null,
    result: null,
    rngState: rngSeed(o.rngState),
  };
}

/** Lottery chance of each option (A1 §1.5). */
export function voteChances(
  options: readonly string[],
  votes: Record<Id, string>,
): Record<string, number> {
  const counts = voteCounts(options, votes);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const o of options)
    out[o] = total === 0 ? 1 / options.length : (counts[o] as number) / total;
  return out;
}

export function voteCounts(
  options: readonly string[],
  votes: Record<Id, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of options) counts[o] = 0;
  for (const v of Object.values(votes)) if (v in counts) counts[v] = (counts[v] as number) + 1;
  return counts;
}

/** Draw the winner: uniform over tickets, or over options with no tickets. */
export function rollVote(
  options: readonly string[],
  votes: Record<Id, string>,
  rng: Rng,
): string | null {
  if (options.length === 0) return null;
  const tickets = Object.values(votes).filter((v) => options.includes(v));
  // Tickets in option order so the draw does not depend on voter-id order.
  tickets.sort((a, b) => options.indexOf(a) - options.indexOf(b));
  return (tickets.length > 0 ? rng.pick(tickets) : rng.pick(options)) ?? null;
}

function allConnectedVoted(s: VoteState): boolean {
  return s.connected.every((id) => id in s.votes);
}

function close(s: VoteState, at: number): void {
  const rng = new Rng(s.rngState);
  s.result = rollVote(s.options, s.votes, rng);
  s.rngState = rng.state;
  s.phase = 'rolling';
  s.closedAt = at;
}

function advance(s: VoteState, at: number): void {
  if (s.phase === 'voting' && (at >= s.deadline || allConnectedVoted(s)))
    close(s, Math.min(at, s.deadline));
  if (s.closedAt === null) return;
  if (s.phase === 'rolling' && at >= s.closedAt + VOTE_TIMING.ROLL_MS) s.phase = 'reveal';
  if (s.phase === 'reveal' && at >= s.closedAt + VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS)
    s.phase = 'done';
}

function phaseEnd(s: VoteState): number | null {
  if (s.phase === 'voting') return s.deadline;
  if (s.closedAt === null) return null;
  if (s.phase === 'rolling') return s.closedAt + VOTE_TIMING.ROLL_MS;
  if (s.phase === 'reveal') return s.closedAt + VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS;
  return null;
}

export function voteView(s: VoteState, at: number): SetupView {
  const closed = s.phase !== 'voting';
  const counts = voteCounts(s.options, s.votes);
  const chances = voteChances(s.options, s.votes);
  const end = phaseEnd(s);
  return {
    stepId: s.stepId,
    kind: s.kind,
    phase: s.phase,
    msLeft: end === null ? 0 : Math.max(0, Math.round(end - at)),
    options: s.options.map((id) =>
      closed ? { id, count: counts[id] as number, chance: chances[id] as number } : { id },
    ),
    voted: s.connected.filter((id) => id in s.votes).length,
    voters: s.connected.length,
    result: closed ? s.result : null,
    draft: null,
  };
}

/** The option shown at `at` during the 12 Hz roll (lands on the result). */
export function rollFrame(s: VoteState, at: number): string | null {
  if (s.phase === 'voting' || s.closedAt === null || s.result === null) return null;
  const elapsed = at - s.closedAt;
  if (elapsed >= VOTE_TIMING.ROLL_MS) return s.result;
  const frames = Math.round((VOTE_TIMING.ROLL_MS / 1000) * VOTE_TIMING.ROLL_HZ);
  const frame = Math.max(0, Math.floor((elapsed / VOTE_TIMING.ROLL_MS) * frames));
  const resultIdx = s.options.indexOf(s.result);
  const idx =
    (((resultIdx - (frames - 1 - frame)) % s.options.length) + s.options.length) % s.options.length;
  return s.options[idx] ?? null;
}

export function voteStep(state: VoteState, input: VoteInput): VoteStep {
  const s: VoteState = {
    ...state,
    options: [...state.options],
    voters: [...state.voters],
    connected: [...state.connected],
    votes: { ...state.votes },
  };
  switch (input.t) {
    case 'cast': {
      if (s.phase !== 'voting' || !s.voters.includes(input.from) || input.from in s.votes) break;
      if (input.at >= s.deadline) break;
      let option: string | undefined = input.option;
      if (option === RANDOM_VOTE) {
        const rng = new Rng(s.rngState);
        option = rng.pick(s.options);
        s.rngState = rng.state;
      }
      if (option === undefined || !s.options.includes(option)) break;
      s.votes[input.from] = option;
      break;
    }
    case 'presence':
      s.connected = s.voters.filter((id) => input.connected.includes(id));
      break;
    case 'tick':
      break;
  }
  advance(s, input.at);
  return {
    state: s,
    view: voteView(s, input.at),
    wakeAt: phaseEnd(s),
    result: s.phase === 'done' ? s.result : null,
  };
}

/* ─── Which steps a lobby runs ───────────────────────────────────────────── */

export type SetupStepKind = 'ruleset_vote' | 'trap_vote' | 'draft';

/**
 * D-32: votes and the draft only run in casual (matchmade) lobbies. The
 * ruleset vote applies to Nemesis/Royale/Manhunt/Teams (not Small World,
 * which is its own ruleset); the trap vote only follows Balanced/Expanded;
 * the draft always runs in a matchmade lobby.
 */
export function setupPlan(
  kind: 'private' | 'casual' | 'party',
  queueMode: QueueMode,
): SetupStepKind[] {
  if (kind !== 'casual') return [];
  const steps: SetupStepKind[] = [];
  if (queueMode !== 'pvp_smallworld') steps.push('ruleset_vote', 'trap_vote');
  steps.push('draft');
  return steps;
}

export function rulesetVoteOptions(): string[] {
  return [...CASUAL_VOTE_RULESETS];
}

/** MM-04: is the trap vote offered after this ruleset rolled? */
export function trapVoteApplies(ruleset: string): boolean {
  return (TRAP_VOTE_RULESETS as readonly string[]).includes(ruleset);
}
