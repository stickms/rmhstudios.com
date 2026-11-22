/**
 * Version history for cloud saves.
 *
 * Every function that replaces or removes the live blob keeps the old one first, in the same transaction, so there
 * is never a moment when a save exists in neither place. At most ten snapshots are kept per member and game; the
 * oldest are pruned in the transaction that adds the newest. List and metadata reads never select `saveData`.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  SNAPSHOT_KEEP,
  saveSize,
  shouldSnapshot,
  validateBackup,
  type BackupError,
  type SnapshotReason,
} from '@/lib/game-saves/backup';
import { SHARED_SAVE_GAMES } from '@/lib/game-saves/registry';
import type { SaveSummary, SnapshotSummary } from '@/lib/game-saves/saves.contract';

/** The slice of a Prisma transaction these functions use. */
export type SaveTx = Pick<Prisma.TransactionClient, 'gameSave' | 'gameSaveSnapshot'>;

/** Keep a copy of the live blob, if there is one, and prune beyond `SNAPSHOT_KEEP`. Returns whether one was kept. */
export async function snapshotBeforeWrite(
  tx: SaveTx,
  userId: string,
  gameId: string,
  reason: SnapshotReason,
): Promise<boolean> {
  const current = await tx.gameSave.findUnique({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
    select: {
      saveData: true,
    },
  });
  if (!current) return false;

  await tx.gameSaveSnapshot.create({
    data: {
      userId,
      gameId,
      saveData: current.saveData as Prisma.InputJsonValue,
      sizeBytes: saveSize(current.saveData),
      reason,
    },
  });

  const stale = await tx.gameSaveSnapshot.findMany({
    where: {
      userId,
      gameId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    skip: SNAPSHOT_KEEP,
    select: {
      id: true,
    },
  });
  if (stale.length > 0) {
    await tx.gameSaveSnapshot.deleteMany({
      where: {
        id: {
          in: stale.map((s) => s.id),
        },
      },
    });
  }
  return true;
}

/**
 * The autosave path: keep the blob about to be overwritten only when the newest snapshot is six hours old or more.
 * One indexed `findFirst` decides, so the common save costs one extra read and no insert.
 */
export async function snapshotIfDue(tx: SaveTx, userId: string, gameId: string, now = new Date()): Promise<boolean> {
  const newest = await tx.gameSaveSnapshot.findFirst({
    where: {
      userId,
      gameId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      createdAt: true,
    },
  });
  if (!shouldSnapshot(newest?.createdAt ?? null, now)) return false;
  return snapshotBeforeWrite(tx, userId, gameId, 'auto');
}

/**
 * One row per game the page shows: every listed game, plus an unlisted one only when it has a save. `sizeBytes` is
 * the UTF-8 length of the jsonb text form (Postgres pads separators), a few percent above the compact JSON length
 * stored on snapshots; both are display-only, and the upload cap uses the compact length (`saveSize`).
 */
export async function listSaves(userId: string): Promise<SaveSummary[]> {
  const [saves, counts] = await Promise.all([
    prisma.$queryRaw<
      {
        gameId: string;
        updatedAt: Date;
        sizeBytes: number;
      }[]
    >`
      SELECT "gameId", "updatedAt", octet_length("saveData"::text) AS "sizeBytes"
      FROM "game_save" WHERE "userId" = ${userId}`,
    prisma.gameSaveSnapshot.groupBy({
      by: ['gameId'],
      where: {
        userId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);
  const saveByGame = new Map(saves.map((s) => [s.gameId, s]));
  const countByGame = new Map(counts.map((c) => [c.gameId, c._count._all]));

  const ids = [...(SHARED_SAVE_GAMES as readonly string[])];
  for (const id of saveByGame.keys()) if (!ids.includes(id)) ids.push(id);

  return ids.map((gameId) => {
    const save = saveByGame.get(gameId);
    return {
      gameId,
      savedAt: save ? save.updatedAt.toISOString() : null,
      sizeBytes: save ? Number(save.sizeBytes) : null,
      snapshotCount: countByGame.get(gameId) ?? 0,
    };
  });
}

export async function listSnapshots(userId: string, gameId: string): Promise<SnapshotSummary[]> {
  const rows = await prisma.gameSaveSnapshot.findMany({
    where: {
      userId,
      gameId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: SNAPSHOT_KEEP,
    select: {
      id: true,
      reason: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    reason: r.reason as SnapshotReason,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** One snapshot with its blob, scoped to the member and game; `null` for anyone else's. */
export async function getSnapshot(userId: string, gameId: string, id: string) {
  return prisma.gameSaveSnapshot.findFirst({
    where: {
      id: BigInt(id),
      userId,
      gameId,
    },
    select: {
      id: true,
      saveData: true,
      createdAt: true,
    },
  });
}

export type RestoreSource =
  | {
      snapshotId: string;
    }
  | {
      backup: unknown;
    };

export type RestoreResult =
  | {
      ok: true;
      updatedAt: Date;
    }
  | {
      ok: false;
      error: 'not-found';
    }
  | {
      ok: false;
      error: BackupError;
    };

/** Replace the live save with a snapshot or a backup, keeping what it replaces as `before-restore`. */
export async function restore(userId: string, gameId: string, source: RestoreSource): Promise<RestoreResult> {
  let backupData: Record<string, unknown> | null = null;
  if ('backup' in source) {
    const checked = validateBackup(source.backup, gameId);
    if (!checked.ok) return checked;
    backupData = checked.backup.saveData;
  }

  return prisma.$transaction(async (tx): Promise<RestoreResult> => {
    let saveData: Prisma.InputJsonValue;
    if (backupData) {
      saveData = backupData as Prisma.InputJsonValue;
    } else {
      const snapshot = await tx.gameSaveSnapshot.findFirst({
        where: {
          id: BigInt(
            (
              source as {
                snapshotId: string;
              }
            ).snapshotId,
          ),
          userId,
          gameId,
        },
        select: {
          saveData: true,
        },
      });
      if (!snapshot)
        return {
          ok: false,
          error: 'not-found',
        };
      saveData = snapshot.saveData as Prisma.InputJsonValue;
    }

    await snapshotBeforeWrite(tx, userId, gameId, 'before-restore');
    // `updatedAt` is stamped now, newer than any local copy, so the game's conflict logic prefers the restored save.
    const save = await tx.gameSave.upsert({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
      create: {
        userId,
        gameId,
        saveData,
      },
      update: {
        saveData,
      },
    });
    return {
      ok: true,
      updatedAt: save.updatedAt,
    };
  });
}

/** Remove the live save, keeping it as `before-delete` so it can be restored. */
export async function deleteSave(userId: string, gameId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await snapshotBeforeWrite(tx, userId, gameId, 'before-delete');
    await tx.gameSave.deleteMany({
      where: {
        userId,
        gameId,
      },
    });
  });
}

/** Account export: snapshot metadata only, never a save blob. */
export async function exportCloudSaveSnapshots(userId: string) {
  const rows = await prisma.gameSaveSnapshot.findMany({
    where: {
      userId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    select: {
      id: true,
      gameId: true,
      reason: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    gameId: r.gameId,
    reason: r.reason,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt.toISOString(),
  }));
}
