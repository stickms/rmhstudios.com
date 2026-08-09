/**
 * Bum's Rush — the single server-side persistence path (design doc §10.3).
 *
 * Every write to the database goes through the functions here: the two API
 * routes (`app/routes/api/bums-rush/{profile,clear,showdown}.ts`) call them,
 * and the socket handler (`server/socket-server/handlers/bums-rush.ts`, a
 * later ticket) is written to call the same ones — never re-implements the
 * upsert-keep-better logic or the §9.8 bounds check a second time. That is
 * the whole point of this file existing separately from the routes: "one
 * persistence path, not two that drift."
 *
 * ## The level-bounds seam
 *
 * §9.8's plausibility bounds (`minPlausibleSeconds`, `parSeconds`, which
 * objective is `clock`) are authored per level in `data/bums-rush/levels/**`,
 * owned by a different ticket that has not landed yet. This module cannot
 * import a level loader that does not exist, so it takes the bounds through
 * {@link setLevelBoundsResolver} instead — an injectable seam, not a hard
 * dependency. Until something calls it, every result is validated against
 * the level-*independent* bounds only (the 2h ceiling, the 3-bit objective
 * range) and is conservatively treated as unranked, which is the safe
 * default: an unrecognized level should never produce a ranked record.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { AppError } from '@/lib/errors/codes';
import type {
  LevelClear,
  LevelResult,
  ObjectiveKind,
  Profile,
  ShowdownResult,
} from '@/lib/bums-rush/types';
import { isCosmeticId, isValidCosmetics } from '@/lib/bums-rush/cosmetics';
import { clearKey } from './merge';
import { createDefaultProfile } from './save';
import { evaluateUnlocks, progressFromProfile } from './unlocks';

type Tx = Prisma.TransactionClient;

/* ══════════════════════════════════════════════════════════════════════════
   §9.8 — the level-bounds seam and the validator
   ══════════════════════════════════════════════════════════════════════════ */

export interface LevelPlausibilityBounds {
  /** `null` = the level authored no floor. */
  minPlausibleSeconds: number | null;
  parSeconds: number;
  /** Authored order — array index is the bit position in the stored bitmask. */
  objectives: readonly { id: string; kind: ObjectiveKind }[];
}

export type LevelBoundsResolver = (
  levelId: string,
) => LevelPlausibilityBounds | null | Promise<LevelPlausibilityBounds | null>;

let levelBoundsResolver: LevelBoundsResolver = () => null;

/** Wired up once the level catalog loads (see the module doc). Exported for the levels ticket and for tests. */
export function setLevelBoundsResolver(resolver: LevelBoundsResolver): void {
  levelBoundsResolver = resolver;
}

/** Test-only: put the resolver back to "no bounds known" between suites. */
export function resetLevelBoundsResolver(): void {
  levelBoundsResolver = () => null;
}

/** §9.8's hard ceiling — the only bound that never needs level data. */
const MAX_PLAUSIBLE_SECONDS = 2 * 60 * 60;
const ALL_OBJECTIVES_MASK = 0b111;

interface ClearValidation {
  ranked: boolean;
  reasons: string[];
  /** The objective bitmask actually trusted — 0 for any bit the bounds could not vouch for. */
  trustedObjectivesBitmask: number;
}

function validateAgainstBounds(
  durationMs: number,
  claimedObjectivesBitmask: number,
  bounds: LevelPlausibilityBounds | null,
): ClearValidation {
  const reasons: string[] = [];
  const seconds = durationMs / 1000;

  if (!Number.isFinite(durationMs) || durationMs <= 0) reasons.push('non-positive duration');
  if (seconds > MAX_PLAUSIBLE_SECONDS) reasons.push('duration exceeds the 2h ceiling');

  const claimed = claimedObjectivesBitmask & ALL_OBJECTIVES_MASK;

  if (!bounds) {
    // No level data to check the floor, the objective ids, or the clock
    // objective's par against — the safe default is "unranked", never a
    // guess. The claim is not dropped, only untrusted (see `recordLevelResult`,
    // which still logs it via `BumsRushRun`).
    reasons.push('level bounds unavailable');
    return { ranked: false, reasons, trustedObjectivesBitmask: 0 };
  }

  if (bounds.minPlausibleSeconds != null && seconds < bounds.minPlausibleSeconds) {
    reasons.push('duration below minPlausibleSeconds');
  }

  const levelBitRange =
    bounds.objectives.length >= 3 ? ALL_OBJECTIVES_MASK : (1 << bounds.objectives.length) - 1;
  if ((claimed & ~levelBitRange) !== 0)
    reasons.push("objective bit outside the level's authored three");
  let trusted = claimed & levelBitRange;

  const clockIndex = bounds.objectives.findIndex((o) => o.kind === 'clock');
  if (clockIndex >= 0 && (trusted & (1 << clockIndex)) !== 0 && seconds >= bounds.parSeconds) {
    reasons.push('clock objective claimed without beating par');
    trusted &= ~(1 << clockIndex);
  }

  return { ranked: reasons.length === 0, reasons, trustedObjectivesBitmask: trusted };
}

/** `LevelResult.objectiveIds` (strings) → the stored bitmask, using the level's authored order. `null` bounds → nothing can be trusted. */
function objectiveIdsToBitmask(
  objectiveIds: readonly string[],
  bounds: LevelPlausibilityBounds | null,
): number {
  if (!bounds) return 0;
  let mask = 0;
  bounds.objectives.forEach((objective, index) => {
    if (objectiveIds.includes(objective.id)) mask |= 1 << index;
  });
  return mask;
}

async function resolveBounds(levelId: string): Promise<LevelPlausibilityBounds | null> {
  return (await levelBoundsResolver(levelId)) ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Row ↔ contract mapping
   ══════════════════════════════════════════════════════════════════════════ */

type ProfileRow = Prisma.BumsRushProfileGetPayload<{ include: { clears: true } }>;

function toLevelClear(row: {
  levelId: string;
  playerCount: number;
  bestMs: number;
  objectives: number;
  assisted: boolean;
  clears: number;
}): LevelClear {
  return {
    levelId: row.levelId,
    playerCount: row.playerCount,
    bestMs: row.bestMs,
    objectives: row.objectives,
    assisted: row.assisted,
    clears: row.clears,
  };
}

function toProfile(row: ProfileRow): Profile {
  const clears: Record<string, LevelClear> = {};
  for (const c of row.clears) clears[clearKey(c.levelId, c.playerCount)] = toLevelClear(c);

  const defaults = createDefaultProfile();
  const settings =
    row.settings && typeof row.settings === 'object'
      ? { ...defaults.settings, ...(row.settings as object) }
      : defaults.settings;

  return {
    cosmetics: { head: row.head, hat: row.hat, gloves: row.gloves, ink: row.ink },
    unlockedCosmetics: row.unlockedCosmetics,
    parcelsFound: row.parcelsFound,
    posesFound: row.posesFound,
    recipesMade: row.recipesMade,
    clears,
    levelsCleared: row.levelsCleared,
    deaths: row.deaths,
    metresSwung: row.metresSwung,
    showdownRating: row.showdownRating,
    showdownWins: row.showdownWins,
    showdownLosses: row.showdownLosses,
    settings,
    updatedAt: row.updatedAt.getTime(),
  };
}

/** The signed-in player's profile — a freshly-created default (never written to the database) when they have no row yet. */
export async function getProfile(userId: string): Promise<Profile> {
  const row = await prisma.bumsRushProfile.findUnique({
    where: { userId },
    include: { clears: true },
  });
  return row ? toProfile(row) : createDefaultProfile();
}

function invalidateLeaderboardCache(levelId: string, playerCount: number): void {
  apiCache.invalidatePrefix(`bums-rush:leaderboard:${levelId}:${playerCount}:`);
}

/* ══════════════════════════════════════════════════════════════════════════
   The one clear-upsert (§10.3: "keeping the better time and the union of
   objectives"; called by every path below, and meant for the socket handler
   to call too)
   ══════════════════════════════════════════════════════════════════════════ */

interface ClearCandidate {
  levelId: string;
  playerCount: number;
  bestMs: number;
  objectivesBitmask: number;
  assisted: boolean;
  ranked: boolean;
}

/**
 * Upsert one `(userId, levelId, playerCount)` record, keeping the better time
 * and the union of objectives. Idempotent-ish by construction: calling it
 * again with an equal-or-worse candidate changes nothing (`changed: false`).
 *
 * An **unranked** candidate never touches this table at all — §9.8 says an
 * implausible result is "persisted as unranked", and this table is what the
 * leaderboard reads, so an implausible time cannot be allowed to reach it
 * even as a non-personal-best entry. It is still durably recorded by the
 * caller via `BumsRushRun`, which is the "never silently dropped" half of
 * that rule.
 */
async function applyClearForUser(
  tx: Tx,
  userId: string,
  profileId: string,
  candidate: ClearCandidate,
): Promise<{ changed: boolean; clear: LevelClear | null }> {
  if (!candidate.ranked) return { changed: false, clear: null };

  const where = {
    userId_levelId_playerCount: {
      userId,
      levelId: candidate.levelId,
      playerCount: candidate.playerCount,
    },
  };
  const existing = await tx.bumsRushLevelClear.findUnique({ where });

  const bestMs = existing ? Math.min(existing.bestMs, candidate.bestMs) : candidate.bestMs;
  // `assisted` describes whichever run's time survived, matching the
  // in-memory rule in `save.ts#applyLevelClear` — never a stale flag from a
  // worse run that happened to arrive first.
  const assisted =
    existing && existing.bestMs <= candidate.bestMs ? existing.assisted : candidate.assisted;
  const objectives = (existing?.objectives ?? 0) | candidate.objectivesBitmask;
  const clearsCount = (existing?.clears ?? 0) + 1;

  const changed =
    !existing ||
    bestMs !== existing.bestMs ||
    objectives !== existing.objectives ||
    assisted !== existing.assisted;

  const row = await tx.bumsRushLevelClear.upsert({
    where,
    create: {
      profileId,
      userId,
      levelId: candidate.levelId,
      playerCount: candidate.playerCount,
      bestMs: candidate.bestMs,
      objectives: candidate.objectivesBitmask,
      assisted: candidate.assisted,
      clears: 1,
    },
    update: { bestMs, objectives, assisted, clears: clearsCount },
  });

  return { changed, clear: toLevelClear(row) };
}

async function countDistinctLevelsCleared(tx: Tx, userId: string): Promise<number> {
  const rows = await tx.bumsRushLevelClear.findMany({
    where: { userId },
    select: { levelId: true },
    distinct: ['levelId'],
  });
  return rows.length;
}

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/bums-rush/clear — one level result, crediting every seat
   ══════════════════════════════════════════════════════════════════════════ */

export interface RecordResultOutcome {
  ranked: boolean;
  reasons: string[];
  /** One entry per credited signed-in user; `null` when the submission was unranked (nothing written to the ranked table for them). */
  perUser: Record<string, LevelClear | null>;
}

/**
 * Persist one level completion. §10.5: every signed-in seat present at the
 * goal is credited — this is why a single HTTP call can touch several
 * accounts' profiles. Guest seats (`userId: null`) are not persisted, per
 * §10.5 — their local storage already has the clear.
 *
 * Achievement/XP/quest progress for this clear is **not** granted here. It
 * goes through the existing engagement pipeline — `enqueueProgression` in
 * `lib/social/engagement-effects.server.ts`, backed by the pg-boss queue in
 * `server/jobs/` — once the twelve ids in `lib/achievements/catalog.ts`
 * (§11.4) exist. That wiring belongs to whichever ticket adds those ids;
 * nothing here writes an achievement, XP or quest row inline.
 */
export async function recordLevelResult(result: LevelResult): Promise<RecordResultOutcome> {
  const bounds = await resolveBounds(result.levelId);
  const claimedBitmask = objectiveIdsToBitmask(result.objectiveIds, bounds);
  const validation = validateAgainstBounds(result.durationMs, claimedBitmask, bounds);

  if (bounds) {
    const knownIds = new Set(bounds.objectives.map((o) => o.id));
    if (result.objectiveIds.some((id) => !knownIds.has(id))) {
      validation.reasons.push('objective id(s) not on this level');
    }
  }
  const ranked = validation.reasons.length === 0;

  const durationMs = Math.max(0, Math.round(result.durationMs));
  const deaths = Math.max(0, Math.round(result.deaths));
  const seatUserIds = [
    ...new Set(result.seats.map((s) => s.userId).filter((id): id is string => id != null)),
  ];

  const perUser: Record<string, LevelClear | null> = {};

  await prisma.$transaction(async (tx) => {
    // Always logged, ranked or not — §9.8: never silently dropped.
    await tx.bumsRushRun.create({
      data: {
        levelId: result.levelId,
        playerCount: result.playerCount,
        durationMs,
        deaths,
        objectives: validation.trustedObjectivesBitmask,
        assisted: result.assisted,
        catUsed: result.catUsed,
        userIds: seatUserIds,
      },
    });

    for (const userId of seatUserIds) {
      const profile = await tx.bumsRushProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });

      const { clear } = await applyClearForUser(tx, userId, profile.id, {
        levelId: result.levelId,
        playerCount: result.playerCount,
        bestMs: durationMs,
        objectivesBitmask: validation.trustedObjectivesBitmask,
        assisted: result.assisted,
        ranked,
      });
      perUser[userId] = clear;

      // Deaths accumulate regardless of ranked status — only the
      // leaderboard-facing bestMs/objectives pair is withheld from an
      // implausible submission (§9.8). Levels-cleared is only recomputed off
      // the ranked table, so an unranked-only submission does not yet grant
      // world progression until a ranked one lands (§9.8's "support ticket"
      // case is meant to be resolved by review, not silently granted).
      await tx.bumsRushProfile.update({
        where: { userId },
        data: {
          deaths: { increment: deaths },
          levelsCleared: await countDistinctLevelsCleared(tx, userId),
        },
      });
    }
  });

  if (ranked) invalidateLeaderboardCache(result.levelId, result.playerCount);

  return { ranked, reasons: validation.reasons, perUser };
}

/* ══════════════════════════════════════════════════════════════════════════
   PUT /api/bums-rush/profile — the whole profile, as `createCloudSave`'s
   custom transport writes it
   ══════════════════════════════════════════════════════════════════════════ */

function assertServerTrustworthy(profile: Profile): void {
  if (!isValidCosmetics(profile.cosmetics)) {
    throw new AppError('INVALID_INPUT', { field: 'cosmetics' });
  }
  for (const id of profile.unlockedCosmetics) {
    if (!isCosmeticId(id)) throw new AppError('INVALID_INPUT', { field: 'unlockedCosmetics' });
  }
}

/**
 * Write the whole profile back — the "commit the resolved merge" step of
 * `save.ts#mergeOnSignIn`, and every ordinary autosave while signed in.
 *
 * Three fields are deliberately **not** taken from the client, no matter what
 * the body contains: `showdownRating`, `showdownWins` and `showdownLosses`
 * are ladder data and only ever move through `recordShowdownResult`, and
 * `levelsCleared` is recomputed from the ranked clears table below rather
 * than trusted. A full-profile write is exactly the shape a forged "I have a
 * 9999 rating" request would take, so this is the one place that forgery has
 * to be closed, not just the showdown route.
 *
 * `deaths`/`metresSwung` take the max of what is already stored and what the
 * client sent, for the same reason `merge.ts` uses max: it is idempotent
 * under a repeated identical write and can never regress, at the cost of not
 * trusting a client-reported decrease (which should never happen honestly
 * anyway — these only ever grow).
 *
 * Every clear in `profile.clears` goes through the exact same §9.8 validation
 * and keep-better upsert as `recordLevelResult` — a bulk sync is not a
 * trusted shortcut around the checks a single clear submission gets.
 */
export async function upsertProfile(userId: string, incoming: Profile): Promise<Profile> {
  assertServerTrustworthy(incoming);

  const progress = progressFromProfile(incoming);
  const earned = evaluateUnlocks(progress);
  const unlockedCosmetics = Array.from(new Set([...incoming.unlockedCosmetics, ...earned])).sort();

  const touchedLevels: { levelId: string; playerCount: number }[] = [];

  await prisma.$transaction(async (tx) => {
    const existing = await tx.bumsRushProfile.findUnique({ where: { userId } });

    const profile = await tx.bumsRushProfile.upsert({
      where: { userId },
      create: {
        userId,
        head: incoming.cosmetics.head,
        hat: incoming.cosmetics.hat,
        gloves: incoming.cosmetics.gloves,
        ink: incoming.cosmetics.ink,
        unlockedCosmetics,
        parcelsFound: [...new Set(incoming.parcelsFound)],
        posesFound: [...new Set(incoming.posesFound)],
        recipesMade: [...new Set(incoming.recipesMade)],
        settings: incoming.settings as unknown as Prisma.InputJsonValue,
        deaths: Math.max(0, Math.round(incoming.deaths)),
        metresSwung: Math.max(0, Math.round(incoming.metresSwung)),
      },
      update: {
        head: incoming.cosmetics.head,
        hat: incoming.cosmetics.hat,
        gloves: incoming.cosmetics.gloves,
        ink: incoming.cosmetics.ink,
        unlockedCosmetics,
        parcelsFound: [...new Set(incoming.parcelsFound)],
        posesFound: [...new Set(incoming.posesFound)],
        recipesMade: [...new Set(incoming.recipesMade)],
        settings: incoming.settings as unknown as Prisma.InputJsonValue,
        deaths: Math.max(0, Math.round(incoming.deaths), existing?.deaths ?? 0),
        metresSwung: Math.max(0, Math.round(incoming.metresSwung), existing?.metresSwung ?? 0),
      },
    });

    for (const clear of Object.values(incoming.clears)) {
      const bounds = await resolveBounds(clear.levelId);
      const durationMs = Math.max(0, Math.round(clear.bestMs));
      const validation = validateAgainstBounds(durationMs, clear.objectives, bounds);

      await applyClearForUser(tx, userId, profile.id, {
        levelId: clear.levelId,
        playerCount: clear.playerCount,
        bestMs: durationMs,
        objectivesBitmask: validation.trustedObjectivesBitmask,
        assisted: clear.assisted,
        ranked: validation.reasons.length === 0,
      });
      touchedLevels.push({ levelId: clear.levelId, playerCount: clear.playerCount });
    }

    await tx.bumsRushProfile.update({
      where: { userId },
      data: { levelsCleared: await countDistinctLevelsCleared(tx, userId) },
    });
  });

  for (const { levelId, playerCount } of touchedLevels)
    invalidateLeaderboardCache(levelId, playerCount);

  return getProfile(userId);
}

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/bums-rush/showdown
   ══════════════════════════════════════════════════════════════════════════ */

export interface RecordShowdownOutcome {
  matchId: string;
  flagged: boolean;
}

const RANKED_WINDOW = 20;
const RANKED_WIN_RATE_CEILING = 0.85;
/**
 * Nominal Elo-shaped movement, not the real thing. `showdown-rating.test.ts`
 * (design doc §19) — team averaging, ranked-assist lockout, real K-factor
 * maths — is a follow-up ticket's job; this keeps `showdownWins`/`Losses` and
 * `showdownRating` moving honestly (never a no-op) in the meantime rather
 * than leaving ranked play with no visible consequence at all.
 */
const PLACEHOLDER_RATING_DELTA = 8;

/**
 * §9.8's round-duration bound ("no round shorter than 3s") cannot be checked
 * here: `ShowdownResult` (the shared contract, `lib/bums-rush/types.ts`) has
 * no per-round timing, only the final tally. What IS checkable from the given
 * shape is applied below; the rest is a known gap for whichever ticket adds
 * per-round telemetry to the result payload.
 */
export async function recordShowdownResult(
  result: ShowdownResult,
  reportingUserId: string | null,
): Promise<RecordShowdownOutcome> {
  const reasons: string[] = [];
  if (!Number.isInteger(result.rounds) || result.rounds < 1 || result.rounds > 99) {
    reasons.push('implausible round count');
  }
  for (const player of result.players) {
    if (player.roundsWon < 0 || player.roundsWon > result.rounds)
      reasons.push('roundsWon exceeds rounds played');
  }

  let winRateFlag = false;
  if (result.ranked && reportingUserId) {
    const reportingWon = result.players.some((p) => p.userId === reportingUserId && p.won);
    winRateFlag = await exceedsRankedWinRateWindow(reportingUserId, reportingWon);
  }

  const flagged = reasons.length > 0 || winRateFlag;

  const matchId = await prisma.$transaction(async (tx) => {
    const match = await tx.bumsRushShowdownMatch.create({
      data: {
        mode: result.ranked ? 'ranked' : 'casual',
        teams: result.teams,
        rounds: result.rounds,
        flagged,
      },
    });

    for (const player of result.players) {
      let ratingBefore: number | null = null;
      let ratingAfter: number | null = null;

      if (player.userId) {
        const profile = await tx.bumsRushProfile.upsert({
          where: { userId: player.userId },
          create: { userId: player.userId },
          update: {},
        });
        ratingBefore = profile.showdownRating;
        // A flagged match never moves the rating — it is not trusted enough
        // to feed the ladder, only recorded (§9.8: never silently dropped).
        const delta =
          !result.ranked || flagged
            ? 0
            : player.won
              ? PLACEHOLDER_RATING_DELTA
              : -PLACEHOLDER_RATING_DELTA;
        ratingAfter = ratingBefore + delta;

        await tx.bumsRushProfile.update({
          where: { userId: player.userId },
          data: {
            showdownRating: ratingAfter,
            showdownWins: { increment: player.won ? 1 : 0 },
            showdownLosses: { increment: player.won ? 0 : 1 },
          },
        });
      }

      await tx.bumsRushShowdownPlayer.create({
        data: {
          matchId: match.id,
          userId: player.userId,
          seatIndex: player.seat,
          roundsWon: player.roundsWon,
          won: player.won,
          ratingBefore,
          ratingAfter,
        },
      });
    }

    return match.id;
  });

  return { matchId, flagged };
}

/** §9.8: "the host not winning > 85% of ranked rounds [matches] over a 20-match window". */
async function exceedsRankedWinRateWindow(userId: string, wonThisMatch: boolean): Promise<boolean> {
  const recent = await prisma.bumsRushShowdownPlayer.findMany({
    where: { userId, match: { mode: 'ranked' } },
    orderBy: { match: { endedAt: 'desc' } },
    take: RANKED_WINDOW - 1,
    select: { won: true },
  });
  const total = recent.length + 1;
  if (total < RANKED_WINDOW) return false;
  const wins = recent.filter((r) => r.won).length + (wonThisMatch ? 1 : 0);
  return wins / total > RANKED_WIN_RATE_CEILING;
}
