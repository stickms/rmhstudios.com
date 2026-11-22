import { invalidateCached } from '@/lib/cached.server';
import { dailyStatsKey } from '@/lib/daily-puzzles/stats.server';
import { prisma } from '@/lib/prisma.server';

const DELETED_NAME = 'Deleted user';

/**
 * Sprint 08 erasure of per-game progress, saves and daily results. Account deletion anonymises the `User` row in
 * place, so none of the `onDelete: Cascade` relations fire. Prisma operations only, one statement per table, each
 * filtered on the member's id (the leading column of an index or key on every table except `SliceDailyEntry` and
 * `SongPlay`, which are scanned once per deletion; an index for them is a follow-up).
 *
 * Other players' data is never deleted:
 * - `RMHboxProfile` and `RmhTypeProfile` have `*MatchPlayer` children that cascade from them, so they are reset to
 *   their defaults with `updateMany` (never `deleteMany`); the RMHBox boards list only profiles with games played and
 *   the RMHType board only `bestWpm > 0`, so a reset profile is on neither.
 * - `AltairMatchPlayer`, `RMHboxMatchPlayer` and `RmhTypeMatchPlayer` are rows in a shared match: the copied display
 *   name becomes "Deleted user", the row stays.
 * - `RMHboxMatch.results` (rankings snapshot shown to co-players) has the member's name renamed by `scrubMatchSnapshots`, one raw
 *   UPDATE after the transaction (a jsonb rewrite has no Prisma operation).
 *   `RMHboxMatch.gameLog`, `RmhTypeMatch.results` and `AltairMatch.results` are scrubbed the same way (sprint 09 16).
 * - `SliceSetlist` goes only where private; public setlists are published lists (an open owner decision).
 * - Anonymous tallies on kept models (`ConnectionsGrid` plays and ratings, `Song.plays`) are not touched.
 *
 * No table here references another, and each references `User`, which stays: the order of the statements is free.
 */
export function gameProgressErasureOps(userId: string) {
  return [
    // Solo and board rows.
    prisma.altairCoopProfile.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.altairMetaProgress.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.altairSoloRun.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.arcadeSeedRun.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.canvasCooldown.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.connectionsPlay.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.dailyPuzzleScore.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.gabrielsHornTableRead.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.gamePlayStatus.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.huntProgress.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.ndwLivery.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.sliceDailyEntry.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.sliceRun.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.sliceSetlist.deleteMany({
      where: {
        ownerId: userId,
        isPublic: false,
      },
    }),
    prisma.songPlay.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.templeOfJoySave.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.tf2HudUserBlob.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.versecraftProgress.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.versecraftSave.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTypeDailyEntry.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTypeKeyStat.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTypeLessonProgress.deleteMany({
      where: {
        userId,
      },
    }),

    // Profiles with cascading children: reset, never delete.
    prisma.rMHboxProfile.updateMany({
      where: {
        userId,
      },
      data: {
        totalGamesPlayed: 0,
        totalWins: 0,
        totalScore: 0,
        totalPlayTimeMs: 0,
        minigameStats: {},
        currentWinStreak: 0,
        bestWinStreak: 0,
      },
    }),
    prisma.rmhTypeProfile.updateMany({
      where: {
        userId,
      },
      data: {
        totalGamesPlayed: 0,
        totalWins: 0,
        bestWpm: 0,
        bestWpmAccuracy: 0,
        avgWpm: 0,
        bestAccuracy: 0,
        avgAccuracy: 0,
        totalCharsTyped: 0,
        totalTimeMs: 0,
        currentStreak: 0,
        bestStreak: 0,
      },
    }),

    // Name copies in other players' matches.
    prisma.altairMatchPlayer.updateMany({
      where: {
        userId,
      },
      data: {
        userName: DELETED_NAME,
      },
    }),
    prisma.rMHboxMatchPlayer.updateMany({
      where: {
        userId,
      },
      data: {
        userName: DELETED_NAME,
      },
    }),
    prisma.rmhTypeMatchPlayer.updateMany({
      where: {
        userId,
      },
      data: {
        userName: DELETED_NAME,
      },
    }),
  ];
}

/**
 * After the transaction: the member's cached daily-puzzle statistics (keyed, never a scan). The 30 s arcade boards
 * expire on their own and hold no per-member key list.
 */
export async function dropGameBoardCaches(userId: string): Promise<void> {
  await invalidateCached(dailyStatsKey(userId));
}

/**
 * After the transaction: `RMHboxMatch.results` is a snapshot of the rankings (userId + userName) that the history
 * endpoint hands to the other players of the match, so the member's name is renamed inside it, in their own matches
 * only. Idempotent. Throws on failure so the caller (the after-erasure steps, `after-erasure-jobs.server.ts`) can
 * retry it; a failure never undoes the committed erasure.
 */
export async function scrubMatchSnapshots(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rmhbox_match" m
    SET "results" = (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN e.value->>'userId' = ${userId}
          THEN CASE WHEN e.value->'avatarUrl' IS NOT NULL AND e.value->'avatarUrl' <> 'null'::jsonb
              THEN jsonb_set(jsonb_set(e.value, '{userName}', to_jsonb(${DELETED_NAME}::text)), '{avatarUrl}', 'null'::jsonb)
              ELSE jsonb_set(e.value, '{userName}', to_jsonb(${DELETED_NAME}::text)) END
          ELSE e.value END ORDER BY e.ord), '[]'::jsonb)
      FROM jsonb_array_elements(m."results") WITH ORDINALITY AS e(value, ord))
    WHERE jsonb_typeof(m."results") = 'array'
      AND m."id" IN (SELECT p."matchId" FROM "rmhbox_match_player" p WHERE p."userId" = ${userId})`;
}

/** The fields that hold a person's name in a match snapshot (`avatarUrl` is set to null). Free text inside a log line is out of scope. */
const NAME_FIELDS = ['name', 'userName', 'displayName', 'handle'] as const;

/**
 * Pure: returns `value` with the name fields of every object whose `userId` is the member set to "Deleted user" and `avatarUrl` nulled,
 * at any depth (a game log nests entries inside `actions`, `players`, `roundResults`, ...). Numbers and every other
 * field are kept, and an array keeps its order. Returns the same reference when nothing changed, so a caller can
 * tell a re-run is a no-op.
 */
export function scrubNamesInJson(value: unknown, userId: string): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = scrubNamesInJson(v, userId);
      if (r !== v) changed = true;
      return r;
    });
    return changed ? next : value;
  }
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const own = obj.userId === userId;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(obj)) {
    let r = scrubNamesInJson(v, userId);
    if (own && (NAME_FIELDS as readonly string[]).includes(k) && typeof v === 'string' && v !== DELETED_NAME) {
      r = DELETED_NAME;
    } else if (own && k === 'avatarUrl' && v != null) {
      r = null; // an avatar URL identifies the member as much as the name does
    }
    if (r !== v) {
      out ??= { ...obj };
      out[k] = r;
    }
  }
  return out ?? value;
}

interface JsonRow {
  id: string;
  doc: unknown;
}

const BATCH = 50;

/** Read a batch of the member's matches, scrub the JSON, write back only the rows that changed. */
async function scrubRows(
  userId: string,
  ids: string[],
  read: (ids: string[]) => Promise<JsonRow[]>,
  write: (id: string, doc: string) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH) {
    const rows = await read(ids.slice(i, i + BATCH));
    for (const row of Array.isArray(rows) ? rows : []) {
      const next = scrubNamesInJson(row.doc, userId);
      if (next !== row.doc) await write(row.id, JSON.stringify(next));
    }
  }
}

function idsOf(rows: unknown): string[] {
  return Array.isArray(rows) ? (rows as Array<{ matchId: string }>).map((r) => r.matchId) : [];
}

/**
 * After the transaction: `RMHboxMatch.gameLog` (free-form, shown only to the match's participants) keeps the member's
 * name and handle in entries whose `userId` is theirs; those fields read "Deleted user". Driven by the member's rows
 * in `rmhbox_match_player` (indexed on `userId`). Idempotent; throws on failure so the job retries.
 */
export async function scrubMatchGameLogs(userId: string): Promise<void> {
  const ids = idsOf(
    await prisma.$queryRaw`
    SELECT p."matchId" AS "matchId" FROM "rmhbox_match_player" p WHERE p."userId" = ${userId}`,
  );
  await scrubRows(
    userId,
    ids,
    (batch) => prisma.$queryRaw<JsonRow[]>`
      SELECT m."id" AS "id", m."gameLog" AS "doc" FROM "rmhbox_match" m
      WHERE m."id" = ANY(${batch}::text[]) AND m."gameLog" IS NOT NULL`,
    (id, doc) => prisma.$executeRaw`UPDATE "rmhbox_match" SET "gameLog" = ${doc}::jsonb WHERE "id" = ${id}`,
  );
}

/**
 * After the transaction: `RmhTypeMatch.results` (standings and per-round rankings, with the numbers) keeps its
 * numbers and loses the member's name. Only the member's own matches, found through `rmhtype_match_player`.
 */
export async function scrubTypeMatchResults(userId: string): Promise<void> {
  const ids = idsOf(
    await prisma.$queryRaw`
    SELECT p."matchId" AS "matchId" FROM "rmhtype_match_player" p WHERE p."userId" = ${userId}`,
  );
  await scrubRows(
    userId,
    ids,
    (batch) => prisma.$queryRaw<JsonRow[]>`
      SELECT m."id" AS "id", m."results" AS "doc" FROM "rmhtype_match" m WHERE m."id" = ANY(${batch}::text[])`,
    (id, doc) => prisma.$executeRaw`UPDATE "rmhtype_match" SET "results" = ${doc}::jsonb WHERE "id" = ${id}`,
  );
}

/** After the transaction: the same for `AltairMatch.results`, through `altair_match_player`. */
export async function scrubAltairMatchResults(userId: string): Promise<void> {
  const ids = idsOf(
    await prisma.$queryRaw`
    SELECT p."matchId" AS "matchId" FROM "altair_match_player" p WHERE p."userId" = ${userId}`,
  );
  await scrubRows(
    userId,
    ids,
    (batch) => prisma.$queryRaw<JsonRow[]>`
      SELECT m."id" AS "id", m."results" AS "doc" FROM "altair_match" m
      WHERE m."id" = ANY(${batch}::text[]) AND m."results" IS NOT NULL`,
    (id, doc) => prisma.$executeRaw`UPDATE "altair_match" SET "results" = ${doc}::jsonb WHERE "id" = ${id}`,
  );
}
