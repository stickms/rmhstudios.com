/**
 * Game updates — server only.
 *
 * Every patch note of a game on its updates page, following a game, editing and deleting a note, and the fan-out
 * that tells followers about a new note or a newly published guide (run by the `games.update-fanout` work queue,
 * `updates-jobs.server.ts`, never in the request that published it).
 *
 * The fan-out is safe to run twice: it reads followers by id cursor, skips members whose system notifications are
 * off and members who already have a notification for that note or guide, and writes the rest with one `createMany`
 * per batch. A retried job therefore notifies nobody twice.
 */
import { notice, noticeColumns, type NoticePreview } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { games } from '@/lib/catalog';
import { isOffSite } from '@/lib/games/library';
import { adjustNotifUnread } from '@/lib/notifications.server';
import {
  decodeUpdatesCursor,
  FANOUT_BATCH,
  GAME_GUIDE_ENTITY,
  GAME_UPDATE_ENTITY,
  gameGuideLink,
  gameUpdateLink,
  pageOf,
  UPDATES_PAGE_SIZE,
  type FanoutJob,
  type PatchNoteItem,
} from '@/lib/arcade/updates';
import type { FollowState } from '@/lib/arcade/updates.contract';

/** The cache key of a game's latest note (the launch prompt reads it); editing or deleting a note drops it. */
export const latestPatchNoteKey = (gameId: string) => `arcade:patch:${gameId}`;

/** A game with an updates page: a catalogue game played on this site. Apps and off-site titles have none. */
export function updatesGame(gameId: string) {
  const game = games.find((g) => g.id === gameId);
  return game && !isOffSite(game.href) ? game : null;
}

const noteSelect = {
  id: true,
  gameId: true,
  version: true,
  title: true,
  body: true,
  createdAt: true,
} as const;

function toItem(row: { id: string; version: string; title: string; body: string; createdAt: Date }): PatchNoteItem {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/* ── Reading ────────────────────────────────────────────────────────────── */

/** One page of a game's patch notes, newest first. */
export async function listPatchNotes(
  gameId: string,
  cursor: string | undefined,
): Promise<{
  notes: PatchNoteItem[];
  nextCursor: string | null;
}> {
  const at = decodeUpdatesCursor(cursor);
  const rows = await prisma.gamePatchNote.findMany({
    where: {
      gameId,
      ...(at
        ? {
            OR: [
              {
                createdAt: {
                  lt: new Date(at.at),
                },
              },
              {
                createdAt: new Date(at.at),
                id: {
                  lt: at.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: UPDATES_PAGE_SIZE + 1,
    select: noteSelect,
  });
  const { items, nextCursor } = pageOf(rows);
  return {
    notes: items.map(toItem),
    nextCursor,
  };
}

/** The newest `n` notes (the game page's Updates section). */
export async function latestPatchNotes(gameId: string, n: number): Promise<PatchNoteItem[]> {
  const rows = await prisma.gamePatchNote.findMany({
    where: {
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
    take: n,
    select: noteSelect,
  });
  return rows.map(toItem);
}

/* ── Following ──────────────────────────────────────────────────────────── */

export async function getFollowState(userId: string | null, gameId: string): Promise<FollowState> {
  const [followers, mine] = await Promise.all([
    prisma.gameFollow.count({
      where: {
        gameId,
      },
    }),
    userId
      ? prisma.gameFollow.findUnique({
          where: {
            userId_gameId: {
              userId,
              gameId,
            },
          },
          select: {
            gameId: true,
          },
        })
      : null,
  ]);
  return {
    following: mine !== null,
    followers,
  };
}

/** Follow a game. Writes only the caller's row; following twice is one row. */
export async function followGame(userId: string, gameId: string): Promise<FollowState> {
  await prisma.gameFollow.upsert({
    where: {
      userId_gameId: {
        userId,
        gameId,
      },
    },
    create: {
      userId,
      gameId,
    },
    update: {},
  });
  return getFollowState(userId, gameId);
}

export async function unfollowGame(userId: string, gameId: string): Promise<FollowState> {
  await prisma.gameFollow.deleteMany({
    where: {
      userId,
      gameId,
    },
  });
  return getFollowState(userId, gameId);
}

/** The games a member follows, most recently followed first. */
export async function listFollowedGameIds(userId: string): Promise<string[]> {
  const rows = await prisma.gameFollow.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      gameId: true,
    },
  });
  return rows.map((r) => r.gameId);
}

/** Everything the member's account export holds about game follows. */
export async function exportGameFollows(userId: string): Promise<
  {
    gameId: string;
    followedAt: string;
  }[]
> {
  const rows = await prisma.gameFollow.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      gameId: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    gameId: r.gameId,
    followedAt: r.createdAt.toISOString(),
  }));
}

/* ── Editing (admin) ────────────────────────────────────────────────────── */

/** Change a note's title and body. The version is immutable: launch prompts compare it. Null for an unknown id. */
export async function editPatchNote(
  id: string,
  data: {
    title: string;
    body: string;
  },
): Promise<{
  gameId: string;
  note: PatchNoteItem;
} | null> {
  const existing = await prisma.gamePatchNote.findUnique({
    where: {
      id,
    },
    select: {
      gameId: true,
    },
  });
  if (!existing) return null;
  const row = await prisma.gamePatchNote.update({
    where: {
      id,
    },
    data,
    select: noteSelect,
  });
  await invalidateCached(latestPatchNoteKey(row.gameId));
  return {
    gameId: row.gameId,
    note: toItem(row),
  };
}

/** Delete a note; the game id it belonged to, or null for an unknown id. */
export async function deletePatchNote(id: string): Promise<string | null> {
  const existing = await prisma.gamePatchNote.findUnique({
    where: {
      id,
    },
    select: {
      gameId: true,
    },
  });
  if (!existing) return null;
  await prisma.gamePatchNote.deleteMany({
    where: {
      id,
    },
  });
  await invalidateCached(latestPatchNoteKey(existing.gameId));
  return existing.gameId;
}

/** The newest note of a game, cached for the launch prompt. */
export function latestForLaunch(gameId: string) {
  return cached(latestPatchNoteKey(gameId), 300_000, () =>
    prisma.gamePatchNote
      .findFirst({
        where: {
          gameId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          version: true,
          title: true,
          body: true,
        },
      })
      .then((r) => r ?? null),
  );
}

/* ── Fan-out ────────────────────────────────────────────────────────────── */

/** What one notification of a job says and where it leads, or null when its subject is gone (deleted, unpublished). */
async function describeJob(job: FanoutJob): Promise<{
  entityType: string;
  entityId: string;
  preview: NoticePreview;
  link: string;
  exceptUserId: string | null;
} | null> {
  const game = games.find((g) => g.id === job.gameId);
  if (!game) return null;
  if (job.kind === 'update') {
    const note = await prisma.gamePatchNote.findUnique({
      where: {
        id: job.noteId,
      },
      select: {
        gameId: true,
        version: true,
        title: true,
      },
    });
    if (!note || note.gameId !== job.gameId) return null;
    return {
      entityType: GAME_UPDATE_ENTITY,
      entityId: job.noteId,
      preview: notice('game-updated', { game: game.title, version: note.version, title: note.title }),
      link: gameUpdateLink(job.gameId),
      exceptUserId: null,
    };
  }
  // A guide a moderator removed tells nobody (s14-08).
  const guide = await prisma.gameGuide.findUnique({
    where: {
      id: job.guideId,
      moderatedAt: null,
    },
    select: {
      gameId: true,
      title: true,
      published: true,
      authorId: true,
    },
  });
  if (!guide || !guide.published || guide.gameId !== job.gameId) return null;
  return {
    entityType: GAME_GUIDE_ENTITY,
    entityId: job.guideId,
    preview: notice('game-guide-new', { game: game.title, title: guide.title }),
    link: gameGuideLink(job.gameId, job.guideId),
    exceptUserId: guide.authorId,
  };
}

/**
 * Tell every follower of the job's game. Returns how many notifications were written. A guide's author is never
 * told about their own guide.
 */
export async function fanOutGameUpdate(job: FanoutJob): Promise<number> {
  const what = await describeJob(job);
  if (!what) return 0;
  let written = 0;
  let after: string | undefined;
  for (;;) {
    const followers = await prisma.gameFollow.findMany({
      where: {
        gameId: job.gameId,
        ...(after
          ? {
              userId: {
                gt: after,
              },
            }
          : {}),
      },
      orderBy: {
        userId: 'asc',
      },
      take: FANOUT_BATCH,
      select: {
        userId: true,
      },
    });
    if (followers.length === 0) break;
    after = followers[followers.length - 1]!.userId;
    const ids = followers.map((f) => f.userId).filter((id) => id !== what.exceptUserId);

    const [muted, already] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: {
          userId: {
            in: ids,
          },
          system: false,
        },
        select: {
          userId: true,
        },
      }),
      prisma.notification.findMany({
        where: {
          userId: {
            in: ids,
          },
          type: 'SYSTEM',
          entityType: what.entityType,
          entityId: what.entityId,
        },
        select: {
          userId: true,
        },
      }),
    ]);
    const skip = new Set([...muted, ...already].map((r) => r.userId));
    const recipients = ids.filter((id) => !skip.has(id));
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          type: 'SYSTEM' as const,
          entityType: what.entityType,
          entityId: what.entityId,
          ...noticeColumns(what.preview),
          link: what.link,
        })),
      });
      await Promise.all(recipients.map((userId) => adjustNotifUnread(userId, 1)));
      written += recipients.length;
    }
    if (followers.length < FANOUT_BATCH) break;
  }
  return written;
}
