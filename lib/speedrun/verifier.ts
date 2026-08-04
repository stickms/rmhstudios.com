/**
 * The speedrun verifier registry — one entry per game (design K1).
 *
 * ## Why this is the feature
 *
 * Every speedrun community on the internet runs on video review and trust,
 * because a video is all a run leaves behind. This site stores runs as
 * `GameReplay` rows — deterministic `{seed, inputs}` logs with the game logic
 * `version` they were recorded on — so a run can be **re-simulated** instead of
 * watched. A board that re-derives its own leaderboard from inputs is a
 * genuinely better product than one that watches videos; a board that *claims*
 * to and actually rubber-stamps a self-reported number is a worse one.
 *
 * So each entry declares a {@link VerificationTier} and the engine below applies
 * a different policy per tier:
 *
 * | tier            | pass →     | fail →     |
 * | --------------- | ---------- | ---------- |
 * | `deterministic` | `verified` | `rejected` |
 * | `consistency`   | `pending`  | `rejected` |
 * | `manual`        | `pending`  | `pending`  |
 *
 * A `consistency` pass is deliberately NOT auto-verified: those verifiers can
 * prove a claim impossible but not prove it real, and "verified" has to mean one
 * thing on every board or it means nothing on any of them.
 *
 * ## Adding a game
 *
 * One entry in {@link SPEEDRUN_VERIFIERS}. To reach the `deterministic` tier a
 * game needs (a) a capture contract in `lib/game/replay.ts` so replays exist at
 * all, and (b) headless logic importable without a DOM. Games that have neither
 * get a `manual` entry with a `note` saying what is missing — declared, not
 * silently absent, so the gap is visible in the registry rather than discovered
 * by a player whose world record sat in a queue forever.
 *
 * Pure and client-safe (no Prisma, no `.server` imports) — same reasoning as
 * `lib/game/registry.ts`: the client can pre-check a submission and the server
 * runs the identical function, so the two can never disagree. The server's call
 * is the authority; sharing the module does not make the client's call
 * trustworthy.
 */

import { z } from 'zod';
import { getReplayable, LIGHTS_OUT_VERSION, SLICE_IT_VERSION } from '@/lib/game/replay';
import { buildDropSchedule } from '@/lib/laundry-sort/match';
import { DIFFICULTIES, MATCH_DURATIONS, SCORE, scoreFor } from '@/lib/laundry-sort/constants';
import type { SpeedrunMetric, SpeedrunRejection, VerificationTier } from './types';

/* -------------------------------------------------------------------------- */
/* Contract                                                                   */
/* -------------------------------------------------------------------------- */

/** What a re-simulation produced. */
export interface SimulationOutcome {
  /** The score the inputs actually produce — never the submitted one. */
  score: number;
  /**
   * How many discrete inputs the log contains. Feeds the "no human does this
   * many things that fast" floor, which is the cheapest anti-forgery signal
   * there is once a time is being claimed.
   */
  inputCount: number;
}

export type SimulationResult =
  | ({ ok: true } & SimulationOutcome)
  | { ok: false; reason: Extract<SpeedrunRejection, 'INVALID_REPLAY' | 'SIMULATION_FAILED'> };

export interface SpeedrunVerifier {
  /** Matches `GameReplay.game` and `SpeedrunCategory.game`. */
  game: string;
  tier: VerificationTier;
  /**
   * Replay versions this verifier can run. A replay recorded on any other
   * version is NOT judged — it queues. Rejecting it would punish a player for a
   * game update they did not ask for, which is exactly the version drift the
   * per-version boards exist to handle.
   *
   * Empty for `manual` entries (nothing to run).
   */
  versions: readonly string[];
  /**
   * Fastest defensible time per input, in ms. Multiplied by the log's input
   * count to give the floor a claimed time must clear.
   */
  minMsPerInput?: number;
  /** Re-simulate the log. Required for every non-`manual` tier. */
  simulate?: (data: unknown) => SimulationResult;
  /** For `manual` entries: what is missing, in one sentence. */
  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Lights Out — deterministic                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The re-simulation is `lib/game/replay.ts`'s own `verify()`: it rebuilds the
 * board the seed produces, replays every clicked cell and accepts the run only
 * if the board ends solved. Delegating rather than re-implementing is the point
 * — a second copy of the simulation is a second thing to drift, and the copy
 * that wrote the replay is the one that should read it back.
 */
function simulateLightsOut(data: unknown): SimulationResult {
  const def = getReplayable('lights-out');
  if (!def?.verify) return { ok: false, reason: 'INVALID_REPLAY' };

  const inputs = (data as { inputs?: unknown })?.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: false, reason: 'INVALID_REPLAY' };
  }

  const result = def.verify(data);
  // `verify()` returns null for both a malformed payload and a run that does not
  // end solved. The array check above separates them, so the player is told
  // which of the two happened.
  if (!result) return { ok: false, reason: 'SIMULATION_FAILED' };

  return { ok: true, score: result.score, inputCount: inputs.length };
}

/* -------------------------------------------------------------------------- */
/* Slice It! — consistency only                                               */
/* -------------------------------------------------------------------------- */

/**
 * Slice It's authoritative beat map is not importable as pure logic, so the
 * stored judgments cannot be checked against the track — only against
 * themselves (monotonic timestamps) and the scoring rule (score recomputed from
 * the judgment log). That catches a tampered score and a reordered log and
 * misses a wholly fabricated one, which is precisely what the `consistency`
 * tier means.
 */
function simulateSliceIt(data: unknown): SimulationResult {
  const def = getReplayable('slice-it');
  if (!def?.verify) return { ok: false, reason: 'INVALID_REPLAY' };

  const inputs = (data as { inputs?: unknown })?.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: false, reason: 'INVALID_REPLAY' };
  }

  const result = def.verify(data);
  if (!result) return { ok: false, reason: 'SIMULATION_FAILED' };

  return { ok: true, score: result.score, inputCount: inputs.length };
}

/* -------------------------------------------------------------------------- */
/* Laundry Sort — consistency                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Laundry Sort's drop schedule is generated up front from a 32-bit seed
 * (`buildDropSchedule`, pure and already unit-tested), and its scoring rule is a
 * pure function of the outcome sequence. So the whole *director* re-derives
 * exactly; only the cloth solver — which decides whether a given garment
 * actually landed in a bin — does not, and re-running a soft-body solver
 * server-side to settle a leaderboard is not a trade anyone should take.
 *
 * The verifier therefore re-derives the schedule and checks the outcome log
 * against it: every resolved garment must be a real drop from this seed, each
 * resolves once, nothing resolves before it spawns or after the match clock
 * ends, and the claimed score must equal the score its own outcomes produce
 * under `scoreFor` + the combo rules. `LaundryMatch.resolveGarments` is mirrored
 * exactly, including the `Math.max(0, …)` floor.
 *
 * NOTE — Laundry Sort has no entry in `lib/game/replay.ts`, so it cannot record
 * a replay yet and `submitRun` will refuse a run for it. This verifier is the
 * half that has to exist first: adopting the game is then one capture entry
 * whose payload matches {@link laundrySortReplaySchema}, not a verification
 * project.
 */
export const laundrySortReplaySchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  durationSec: z
    .number()
    .int()
    .refine((v) => (MATCH_DURATIONS as readonly number[]).includes(v), {
      message: 'not a match duration',
    }),
  difficulty: z.enum(DIFFICULTIES),
  inputs: z
    .array(
      z.object({
        /** Index into the re-derived drop schedule. */
        drop: z.number().int().min(0).max(8_191),
        outcome: z.enum(['sorted', 'wrong', 'missed']),
        /** Simulated seconds from the start of the match. */
        at: z.number().min(0).max(600),
      }),
    )
    .min(1)
    .max(8_192),
});

export type LaundrySortReplay = z.infer<typeof laundrySortReplaySchema>;

function simulateLaundrySort(data: unknown): SimulationResult {
  const parsed = laundrySortReplaySchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: 'INVALID_REPLAY' };

  const { seed, durationSec, difficulty, inputs } = parsed.data;
  const schedule = buildDropSchedule(seed, durationSec, difficulty);

  const seen = new Set<number>();
  let previousAt = 0;
  let score = 0;
  let combo = 0;

  for (const event of inputs) {
    const drop = schedule[event.drop];
    // A garment that this seed never produced, or one resolved twice, means the
    // log does not describe a run of this match.
    if (!drop || seen.has(event.drop)) return { ok: false, reason: 'SIMULATION_FAILED' };
    seen.add(event.drop);

    // The log is a timeline: it cannot go backwards, resolve a garment before
    // the chute released it, or continue past the final tick.
    if (event.at < previousAt || event.at < drop.at || event.at > durationSec) {
      return { ok: false, reason: 'SIMULATION_FAILED' };
    }
    previousAt = event.at;

    if (event.outcome === 'sorted') {
      score = Math.max(0, score + scoreFor(true, combo));
      combo++;
    } else if (event.outcome === 'wrong') {
      score = Math.max(0, score + SCORE.wrong);
      combo = 0;
    } else {
      // A miss breaks the streak and costs nothing else — the lost multiplier
      // is already the punishment (constants.ts SCORE).
      combo = 0;
    }
  }

  return { ok: true, score, inputCount: inputs.length };
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every game a speedrun category may be opened for.
 *
 * The `manual` entries are the honest half of this table. Dream Rift, Kowloon
 * Knockout and CookGame all have deterministic, unit-tested logic under `lib/`
 * — what they do not have is a replay capture contract, and two of them cannot
 * be stepped headlessly today, so a verifier for them would be code that runs on
 * nothing. Saying so here is better than a board that quietly trusts whatever
 * number the client sent.
 */
export const SPEEDRUN_VERIFIERS: readonly SpeedrunVerifier[] = [
  {
    game: 'lights-out',
    tier: 'deterministic',
    versions: [LIGHTS_OUT_VERSION],
    // A cell toggle is a click. Below ~40ms apart a run is a script, not a
    // person — generous next to the ~150ms a fast human actually manages.
    minMsPerInput: 40,
    simulate: simulateLightsOut,
  },
  {
    game: 'slice-it',
    tier: 'consistency',
    versions: [SLICE_IT_VERSION],
    // Notes come as fast as the chart does; 15ms is a lower bound on a beat.
    minMsPerInput: 15,
    simulate: simulateSliceIt,
  },
  {
    game: 'laundry-sort',
    tier: 'consistency',
    // No capture contract yet, so no recorded version exists to match. Stated
    // as the empty set rather than a guessed string: an invented version would
    // silently pass the version gate the day capture lands on a different one.
    versions: [],
    minMsPerInput: 120,
    simulate: simulateLaundrySort,
  },
  {
    game: 'dream-rift',
    tier: 'manual',
    versions: [],
    note:
      'The world simulation is deterministic and fixed-step, but `sim/world.ts` ' +
      'imports `render/sprites`, which allocates canvas surfaces at module load ' +
      '— headless re-simulation needs that dependency broken first.',
  },
  {
    game: 'kowloon-knockout',
    tier: 'manual',
    versions: [],
    note:
      'The fight simulation is pure and testable, but nothing records an input ' +
      'log: a verifier needs a per-frame input capture contract in ' +
      'lib/game/replay.ts before there is anything to re-simulate.',
  },
  {
    game: 'cookgame',
    tier: 'manual',
    versions: [],
    note:
      'A long-form save-based simulation with no run boundary and no input log ' +
      '— the unit of a "run" has to be defined before it can be verified.',
  },
] as const;

const BY_GAME = new Map(SPEEDRUN_VERIFIERS.map((v) => [v.game, v]));

export function getSpeedrunVerifier(game: string): SpeedrunVerifier | undefined {
  return BY_GAME.get(game);
}

/** Games a category may be opened for, for admin UI and validation. */
export function speedrunGameIds(): string[] {
  return SPEEDRUN_VERIFIERS.map((v) => v.game);
}

/** The tier a game's runs are checked at — `'manual'` for anything unregistered. */
export function verificationTierFor(game: string): VerificationTier {
  return BY_GAME.get(game)?.tier ?? 'manual';
}

/**
 * Whether a run can be submitted for this game at all: a speedrun entry
 * references a `GameReplay`, so a game with no capture contract in
 * `lib/game/replay.ts` has nothing to reference.
 */
export function canCaptureRuns(game: string): boolean {
  return getReplayable(game) !== undefined;
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

export interface SpeedrunClaim {
  /** Run length in ms, taken from the replay row (never from the submitter). */
  timeMs: number;
  /** The score stored with the replay, when the game scores at all. */
  score: number | null;
  /** The category's ranking metric — decides whether the score must match. */
  metric: SpeedrunMetric;
}

export interface SpeedrunVerifyInput {
  game: string;
  /** The `version` recorded on the replay, not the category's. */
  version: string;
  /** The replay's `data` payload. */
  data: unknown;
  claim: SpeedrunClaim;
}

export interface SpeedrunVerdict {
  status: 'verified' | 'rejected' | 'pending';
  tier: VerificationTier;
  /** The re-simulated score, when a simulation ran. */
  derivedScore: number | null;
  /** Present for everything except a clean `verified`. */
  reason?: SpeedrunRejection;
}

/** Default input floor for a verifier that does not set one. */
const DEFAULT_MIN_MS_PER_INPUT = 20;

/**
 * Judge one run. Pure: same replay, same verdict, on the worker, in the route
 * and in the test suite.
 */
export function verifySpeedrun(input: SpeedrunVerifyInput): SpeedrunVerdict {
  const verifier = BY_GAME.get(input.game);

  if (!verifier || verifier.tier === 'manual' || !verifier.simulate) {
    return { status: 'pending', tier: 'manual', derivedScore: null, reason: 'NO_VERIFIER' };
  }

  // Version drift: a game update invalidates old logs. The run is not wrong —
  // it is unjudgeable by today's logic — so it queues rather than being thrown
  // away, and the board it queues for is that version's board.
  if (!verifier.versions.includes(input.version)) {
    return {
      status: 'pending',
      tier: verifier.tier,
      derivedScore: null,
      reason: 'VERSION_UNSUPPORTED',
    };
  }

  const sim = verifier.simulate(input.data);
  if (!sim.ok) {
    return { status: 'rejected', tier: verifier.tier, derivedScore: null, reason: sim.reason };
  }

  // The replay's stored score is itself derived at save time for verified games,
  // so a mismatch means the row was tampered with or the logic moved under it.
  if (input.claim.score !== null && input.claim.score !== sim.score) {
    return {
      status: 'rejected',
      tier: verifier.tier,
      derivedScore: sim.score,
      reason: 'SCORE_MISMATCH',
    };
  }
  if (input.claim.metric === 'score' && input.claim.score === null) {
    return {
      status: 'rejected',
      tier: verifier.tier,
      derivedScore: sim.score,
      reason: 'SCORE_MISMATCH',
    };
  }

  const floor = (verifier.minMsPerInput ?? DEFAULT_MIN_MS_PER_INPUT) * sim.inputCount;
  if (
    !Number.isFinite(input.claim.timeMs) ||
    input.claim.timeMs <= 0 ||
    input.claim.timeMs < floor
  ) {
    return {
      status: 'rejected',
      tier: verifier.tier,
      derivedScore: sim.score,
      reason: 'TIME_IMPLAUSIBLE',
    };
  }

  if (verifier.tier === 'consistency') {
    return {
      status: 'pending',
      tier: verifier.tier,
      derivedScore: sim.score,
      reason: 'NEEDS_REVIEW',
    };
  }

  return { status: 'verified', tier: verifier.tier, derivedScore: sim.score };
}
