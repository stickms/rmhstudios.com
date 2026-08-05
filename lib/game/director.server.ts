/**
 * The difficulty director (A10) — a per-player, per-game modifier envelope.
 * Server-only.
 *
 * Difficulty in the solo arcade titles is authored, static, and identical for a
 * first-timer and someone with four hundred runs. The inputs to fix that
 * already exist and nothing consumes them: `lib/game/registry.ts` knows each
 * game's bounds and direction, and `lib/game/adapters.server.ts` knows where
 * each player stands. This module joins the two into an envelope the client
 * applies at run start.
 *
 * **This is deliberately not an AI feature.** No model is called and none will
 * be: the mapping from standing to modifiers is a table you can read, argue
 * with, and unit-test. If a model has a role here it is tuning that table
 * offline, between releases — not deciding per run, where a non-deterministic
 * difficulty is indistinguishable from a bug and impossible to support.
 *
 * ## The hard rule
 *
 * **A run with a non-neutral envelope can never reach a leaderboard.** Adaptive
 * difficulty and a shared high-score table are mutually exclusive — a board
 * that mixes assisted and unassisted runs measures nothing — and picking
 * silently is how the board loses its meaning. The rule is enforced three ways,
 * in increasing order of how much it matters:
 *
 *  1. **In the type.** `DirectorEnvelope` is a union discriminated on `ranked`.
 *     The only value with `ranked: true` is `NEUTRAL_ENVELOPE`, whose
 *     `intensity` and `assistGrant` are the literal types `1` and `0`. There is
 *     no way to construct a modified envelope that claims to be ranked, and
 *     `envelopeIsRanked()` narrows for callers that need to branch.
 *  2. **On the server, at issue time.** `issueEnvelope` records a *claim* when
 *     it hands out a modified envelope. The client is never asked whether it
 *     was assisted, because the client is the one thing here with a motive to
 *     lie.
 *  3. **At submit time.** `consumeRunEligibility` reads and clears that claim.
 *     `lib/game/submit.server.ts` calls it before writing to an adapter — see
 *     the wiring note at the bottom of this file.
 *
 * ## Why it ships inert
 *
 * `DIRECTOR_TUNING` starts empty, so every game gets `NEUTRAL_ENVELOPE` and
 * nothing changes. That is not caution for its own sake: an envelope is applied
 * by the *client*, so enabling a game whose client does not read the envelope
 * would cost its players leaderboard eligibility in exchange for no assist at
 * all — strictly worse than the status quo. A game joins the table in the same
 * change that teaches its client to apply the modifiers.
 */

import { apiCache } from '@/lib/cache';
import { redisDel, redisGetJSON, redisSetJSON } from '@/lib/redis.server';
import { getGameAdapter } from '@/lib/game/adapters.server';
import { getGameScoreRules } from '@/lib/game/registry';

/* -------------------------------------------------------------------------- */
/* The envelope                                                               */
/* -------------------------------------------------------------------------- */

/** Bounds on `intensity`. Outside these a game stops being the game it was. */
export const MIN_INTENSITY = 0.8;
export const MAX_INTENSITY = 1.25;

/**
 * The un-modified run: what every player gets by default, and the only shape
 * that is leaderboard-eligible.
 *
 * The literal types are the enforcement. `intensity: 1` is not "a number that
 * happens to be one" — it is the only value assignable, so a caller cannot
 * widen a modified envelope into this branch by mutation or by cast-free
 * assignment.
 */
export interface NeutralEnvelope {
  readonly intensity: 1;
  readonly assistGrant: 0;
  readonly ranked: true;
}

/**
 * A modified run.
 *
 * `intensity` multiplies whatever the game treats as pressure — enemy density,
 * spawn rate, scroll speed. `assistGrant` is extra starting resource (lives,
 * shields, rewinds) in the game's own units. Both are advisory: the client
 * decides how to spend them, and a game that only understands one of the two
 * ignores the other.
 */
export interface AdaptiveEnvelope {
  readonly intensity: number;
  readonly assistGrant: number;
  /** Never true. See "The hard rule" in the module docblock. */
  readonly ranked: false;
  /** Why this player got this envelope — for telemetry and for the UI's copy. */
  readonly reason: DirectorReason;
}

export type DirectorEnvelope = NeutralEnvelope | AdaptiveEnvelope;

export type DirectorReason =
  /** No recorded run in this game. */
  | 'newcomer'
  /** Recorded runs, but below the sampled board. */
  | 'below-board'
  /** On the board, in its lower half. */
  | 'climbing'
  /** Near the top of the board. */
  | 'expert';

export const NEUTRAL_ENVELOPE: NeutralEnvelope = Object.freeze({
  intensity: 1,
  assistGrant: 0,
  ranked: true,
});

/**
 * Narrow to the leaderboard-eligible branch.
 *
 * Callers should prefer this over reading `.ranked` directly — it is the same
 * check, but it gives TypeScript the narrowing, so the compiler starts
 * complaining when a leaderboard path is handed something adaptive.
 */
export function envelopeIsRanked(envelope: DirectorEnvelope): envelope is NeutralEnvelope {
  return envelope.ranked;
}

/* -------------------------------------------------------------------------- */
/* Tuning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Per-game overrides for the default mapping.
 *
 * Empty on purpose — see "Why it ships inert". A game is enabled by adding an
 * entry; `{}` accepts every default, which is the normal case.
 */
export interface DirectorTuning {
  /** Multiplier applied to the default intensity delta. 0 disables intensity changes. */
  readonly intensityScale?: number;
  /** Ceiling on `assistGrant` in this game's units. Default 2. */
  readonly maxAssist?: number;
}

/**
 * The allowlist. A game id present here has a client that applies the envelope;
 * a game id absent gets `NEUTRAL_ENVELOPE` and is unaffected in every way.
 *
 * Adding an entry is a deliberate, per-game decision with a client change
 * attached. It is not a rollout flag — flipping it on for a game whose client
 * ignores the envelope silently removes that game's players from its own
 * leaderboard.
 */
export const DIRECTOR_TUNING: Readonly<Record<string, DirectorTuning>> = Object.freeze({});

/** True when this game has opted in. */
export function directorEnabled(gameId: string): boolean {
  return Object.hasOwn(DIRECTOR_TUNING, gameId);
}

/* -------------------------------------------------------------------------- */
/* Standing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How many rows of the board to sample.
 *
 * `GameAdapter` exposes `leaderboard(limit)` and nothing else — there is no
 * per-player read on the interface, and reaching around it into a game's Prisma
 * model would put knowledge of that model in a second file, which is exactly
 * what `adapters.server.ts` exists to prevent. So the standing is derived from
 * a bounded head sample.
 *
 * That sample answers the question this feature actually asks. The envelope
 * only has to separate "this player is near the top" from "this player is not",
 * and a head sample answers the first case exactly and the second by exclusion.
 * It cannot tell a median player from a struggling one — which is why absence
 * from a *full* sample is treated as `below-board` (a light assist) rather than
 * as `newcomer` (a larger one), and why `newcomer` requires the whole board to
 * fit inside the sample.
 */
const SAMPLE_SIZE = 200;

/** Standing cache TTL. A board does not reorder meaningfully in five minutes. */
const STANDING_TTL_MS = 5 * 60_000;

export interface PlayerStanding {
  /** Rows the sample actually returned. */
  sampled: number;
  /** 1-based rank within the sample, or `null` when the player is not in it. */
  rank: number | null;
  /** True when the sample is the entire board (so absence means "no runs"). */
  boardComplete: boolean;
}

/**
 * Where a player sits on their own game's board.
 *
 * Cached per game (not per player): one sample serves every player of that game
 * for the TTL, which turns "one leaderboard read per run start" into "one per
 * game per five minutes".
 */
export async function playerStanding(
  gameId: string,
  userId: string,
): Promise<PlayerStanding | null> {
  const adapter = getGameAdapter(gameId);
  if (!adapter) return null;

  const key = `director:board:${gameId}`;
  let rows = apiCache.get<{ userId: string | null }[]>(key);
  if (!rows) {
    rows = (await adapter.leaderboard(SAMPLE_SIZE)).map((r) => ({ userId: r.userId }));
    apiCache.set(key, rows, STANDING_TTL_MS);
  }

  const index = rows.findIndex((r) => r.userId === userId);
  return {
    sampled: rows.length,
    rank: index >= 0 ? index + 1 : null,
    boardComplete: rows.length < SAMPLE_SIZE,
  };
}

/* -------------------------------------------------------------------------- */
/* The mapping                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Standing → envelope. Pure, total, and the whole of the policy.
 *
 * Exported and dependency-free so it can be tested exhaustively without a
 * database, a game, or a player. The numbers are the argument; keeping them in
 * one readable function is what lets that argument be had in review rather than
 * discovered in production.
 *
 * The shape: strong players get pressure, everyone else gets a little help, and
 * the ends are deliberately closer to 1 than the bounds allow. An envelope that
 * makes the game feel like a different game is worse than no envelope, because
 * the player cannot tell it happened.
 */
export function envelopeFor(
  standing: PlayerStanding,
  tuning: DirectorTuning = {},
): DirectorEnvelope {
  const scale = tuning.intensityScale ?? 1;
  const maxAssist = tuning.maxAssist ?? 2;

  const build = (delta: number, assist: number, reason: DirectorReason): DirectorEnvelope => {
    const intensity = clamp(1 + delta * scale, MIN_INTENSITY, MAX_INTENSITY);
    const assistGrant = Math.max(0, Math.min(Math.round(assist), maxAssist));
    // A tuning that scaled the delta to nothing and granted nothing has not
    // modified the run, so it must not cost the player their leaderboard slot.
    // Returning the neutral singleton here is the one place the two branches
    // meet, and it is worth the extra check: `intensityScale: 0` is exactly how
    // someone disables the director for a game without removing its entry.
    if (intensity === 1 && assistGrant === 0) return NEUTRAL_ENVELOPE;
    return { intensity, assistGrant, ranked: false, reason };
  };

  // No recorded run anywhere on a board we can see the whole of.
  if (standing.rank === null && standing.boardComplete) return build(-0.15, 2, 'newcomer');
  // Below the sampled head. Could be a median player; assist lightly.
  if (standing.rank === null) return build(-0.1, 1, 'below-board');

  const percentile = standing.rank / Math.max(1, standing.sampled);
  if (percentile <= 0.1) return build(0.25, 0, 'expert');
  if (percentile <= 0.25) return build(0.15, 0, 'expert');
  if (percentile <= 0.5) return build(0.05, 0, 'climbing');
  return build(-0.05, 1, 'climbing');
}

function clamp(value: number, min: number, max: number): number {
  // Two decimals: an intensity of 1.0500000000000003 renders in a debug overlay
  // and reads as a bug. Rounding here also makes the `=== 1` check above exact.
  return Math.round(Math.min(Math.max(value, min), max) * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Claims — the server-side record that a run was assisted                    */
/* -------------------------------------------------------------------------- */

/**
 * How long a claim survives.
 *
 * Longer than any plausible run of a solo arcade title, short enough that a
 * player who takes an assisted envelope and then walks away for the afternoon
 * is not still marked when they come back. A claim that outlived its run would
 * unrank an honest one; a claim that expired mid-run would rank an assisted
 * one. Two hours errs toward the first, which is the direction that protects
 * the board.
 */
const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

interface RunClaim {
  intensity: number;
  assistGrant: number;
  reason: DirectorReason;
  at: number;
}

const claimKey = (gameId: string, userId: string) => `director:claim:${gameId}:${userId}`;

async function writeClaim(gameId: string, userId: string, claim: RunClaim): Promise<void> {
  const key = claimKey(gameId, userId);
  apiCache.set(key, claim, CLAIM_TTL_MS);
  try {
    await redisSetJSON(key, claim, CLAIM_TTL_MS);
  } catch (err) {
    console.error('[director] claim write failed:', (err as Error)?.message);
  }
}

/**
 * Compute, record, and return the envelope for a run about to start.
 *
 * The recording is the load-bearing half. `submit.server.ts` learns that a run
 * was assisted by reading what *this* function wrote, not by trusting a flag on
 * the submission — a client that wants a modified run on the leaderboard would
 * simply not send the flag.
 *
 * Returns `NEUTRAL_ENVELOPE` (writing nothing) for a game that has not opted
 * in, an unknown game, or any failure while reading the board. Failing toward
 * neutral is correct in both directions at once: the player gets the game they
 * expected, and their run stays eligible.
 */
export async function issueEnvelope(gameId: string, userId: string): Promise<DirectorEnvelope> {
  if (!directorEnabled(gameId)) return NEUTRAL_ENVELOPE;
  if (!getGameScoreRules(gameId)) return NEUTRAL_ENVELOPE;

  let envelope: DirectorEnvelope = NEUTRAL_ENVELOPE;
  try {
    const standing = await playerStanding(gameId, userId);
    if (standing) envelope = envelopeFor(standing, DIRECTOR_TUNING[gameId]);
  } catch (err) {
    console.warn('[director] standing lookup failed:', (err as Error)?.message);
    return NEUTRAL_ENVELOPE;
  }

  if (envelopeIsRanked(envelope)) return envelope;

  await writeClaim(gameId, userId, {
    intensity: envelope.intensity,
    assistGrant: envelope.assistGrant,
    reason: envelope.reason,
    at: Date.now(),
  });
  return envelope;
}

export interface RunEligibility {
  /** False when the player took a modified envelope for this game. */
  ranked: boolean;
  /** Present when `ranked` is false. */
  reason?: DirectorReason;
}

/**
 * Read and clear the claim for a finishing run.
 *
 * Consuming (rather than peeking) is what keeps one assisted run from unranking
 * every subsequent run: the player takes an envelope, submits once, and the
 * next run starts clean unless the director hands out another.
 *
 * **Fails open** — a Redis outage returns `{ ranked: true }`. That is the wrong
 * direction for board integrity and the right one for the player: the
 * alternative is refusing honest submissions during an infrastructure problem,
 * and the population that can be affected here is by construction the one being
 * assisted, i.e. not the population near the top of the board.
 */
export async function consumeRunEligibility(
  gameId: string,
  userId: string,
): Promise<RunEligibility> {
  if (!directorEnabled(gameId)) return { ranked: true };

  const key = claimKey(gameId, userId);
  let claim = apiCache.get<RunClaim>(key) ?? null;
  if (!claim) {
    try {
      claim = await redisGetJSON<RunClaim>(key);
    } catch (err) {
      console.warn('[director] claim read failed:', (err as Error)?.message);
      return { ranked: true };
    }
  }
  if (!claim) return { ranked: true };

  // `apiCache` exposes prefix invalidation, not a single-key delete. The key is
  // already unique per (user, game) so invalidating it as a prefix removes
  // exactly this entry.
  apiCache.invalidatePrefix(key);
  try {
    await redisDel(key);
  } catch {
    // The TTL will clear it. A failed delete costs at most one extra unranked
    // run, which is the safe side of this particular mistake.
  }

  return { ranked: false, reason: claim.reason };
}

/* -------------------------------------------------------------------------- *
 * WIRING NOTE — `lib/game/submit.server.ts`
 *
 * This module cannot enforce its own rule at the submission boundary, because
 * the submission boundary is `submitGameScore`. The check belongs immediately
 * AFTER the registry verdict and BEFORE `adapter.submit(...)`:
 *
 *   const eligibility = await consumeRunEligibility(input.gameId, input.userId);
 *   if (eligibility.ranked) {
 *     await adapter.submit({ ... });          // unchanged
 *   }
 *   // progression still runs either way — an assisted run is still a run
 *   await recordGamePlay(input.userId).catch(() => {});
 *   await reportGameResult(input.userId, { ... }).catch(() => {});
 *   return { ok: true, ranked: eligibility.ranked };
 *
 * Skipping the adapter write rather than returning an error is the recommended
 * shape: the player finished a run and should keep their quest progress, their
 * arcade streak, and their coins — they simply do not appear on the board. A
 * rejection would teach players that accepting an assist voids the whole run,
 * which is how a well-meant feature ends up switched off by everyone who tries
 * it once.
 *
 * That does widen `SubmitScoreResult` from `{ ok: true }` to
 * `{ ok: true; ranked: boolean }`. Every existing caller destructures `ok`
 * only, so it is additive — but it is a change to a file another agent owns,
 * which is why it is written here rather than applied.
 * -------------------------------------------------------------------------- */
