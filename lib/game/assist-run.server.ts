/**
 * Run-start claims for assisted runs (P7, sprint 07 02). Server-only.
 *
 * The same pattern as the difficulty director's claims: the SERVER decides at
 * run start that a run is assisted and records it in Redis, and
 * `submitGameScore` reads that record rather than trusting anything the client
 * sends. A member who switches assists off in another tab mid-run therefore
 * never puts an assisted run on the board.
 */

import {
  redisDel,
  redisGetJSON,
  redisSetJSON,
} from '@/lib/redis.server';
import {
  assistProfileFor,
  getAssists,
} from '@/lib/game/assist.server';
import {
  ASSIST_CAPABLE,
  profileFor,
  type AssistProfile,
} from '@/lib/game/assist';
import { prisma } from '@/lib/prisma.server';

/**
 * How long a claim survives. Longer than any plausible run of a solo arcade
 * title; an expiry mid-run would rank an assisted run, so this errs long.
 */
const CLAIM_TTL_MS =
  2 *
  60 *
  60 *
  1000;

/**
 * Boards that belong to an adopting game but have an id of their own. Void
 * Breaker's Boss Rush board is separate from the main board, and a run on it is
 * assisted exactly when the player's Void Breaker run is, so it shares that
 * game's profile and claim rather than becoming an unassisted back door.
 */
const ASSIST_GAME_ALIASES: Readonly<
  Record<
    string,
    string
  >
> =
  {
    'void-breaker-boss-rush':
      'void-breaker',
  };

/** The game whose assist profile governs `gameId`. */
export function assistGameFor(
  gameId: string,
): string {
  return (
    ASSIST_GAME_ALIASES[
      gameId
    ] ??
    gameId
  );
}

interface AssistClaim {
  at: number;
}

export const assistRunKey =
  (
    gameId: string,
    userId: string,
  ) =>
    `assist-run:${gameId}:${userId}`;

/**
 * Compute the profile for a run about to start and, when it is not ranked,
 * record the claim. A ranked start clears any stale claim: a new run supersedes
 * the abandoned one. Redis trouble never fails the start.
 */
export async function startAssistRun(
  userId: string,
  requestedGameId: string,
): Promise<AssistProfile> {
  const gameId =
    assistGameFor(
      requestedGameId,
    );
  const profile =
    await assistProfileFor(
      userId,
      gameId,
    );
  const key =
    assistRunKey(
      gameId,
      userId,
    );
  try {
    if (
      profile.ranked
    ) {
      if (
        ASSIST_CAPABLE.has(
          gameId,
        )
      )
        await redisDel(
          key,
        );
    } else {
      await redisSetJSON(
        key,
        {
          at: Date.now(),
        } satisfies AssistClaim,
        CLAIM_TTL_MS,
      );
    }
  } catch (err) {
    console.error(
      '[assist-run] claim write failed:',
      (
        err as Error
      )
        ?.message,
    );
  }
  return profile;
}

/**
 * Is the finishing run assisted? True when a claim exists (read and cleared, so
 * one assisted run does not unrank the next) OR the stored settings are
 * assisted for this game right now. A game outside `ASSIST_CAPABLE` is never
 * assisted and pays nothing. A Redis read failure falls back to the settings
 * check alone.
 */
export async function consumeAssistRun(
  userId: string,
  requestedGameId: string,
): Promise<boolean> {
  const gameId =
    assistGameFor(
      requestedGameId,
    );
  if (
    !ASSIST_CAPABLE.has(
      gameId,
    )
  )
    return false;
  const key =
    assistRunKey(
      gameId,
      userId,
    );
  let claimed = false;
  try {
    claimed =
      (await redisGetJSON<AssistClaim>(
        key,
      )) !=
      null;
    if (
      claimed
    )
      await redisDel(
        key,
      ).catch(
        () => {},
      );
  } catch (err) {
    console.warn(
      '[assist-run] claim read failed:',
      (
        err as Error
      )
        ?.message,
    );
  }
  if (
    claimed
  )
    return true;
  try {
    return !profileFor(
      gameId,
      await getAssists(
        userId,
      ),
    )
      .ranked;
  } catch (err) {
    console.warn(
      '[assist-run] settings read failed:',
      (
        err as Error
      )
        ?.message,
    );
    // Fail safe: if the stored settings cannot be read, the run is treated as unranked.
    return true;
  }
}

/** Account deletion: the member's assist preference goes with them. */
export function assistErasureOps(
  userId: string,
) {
  return [
    prisma.gameAssistPreference.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
  ];
}
