/**
 * Reports of the games library's member text (sprint 14, feature 08), server half. The types and the registry of
 * readers are in `lib/games/moderation.ts`.
 *
 * - `gameContentOwner`: whose item a report is about, `null` for anything a member may not report (missing, an
 *   unpublished guide, one a moderator already removed), so the report flow never confirms a hidden item exists.
 * - `takeDownGameContent`: a moderator's removal. A review, a guide and a tip are stamped (`moderatedAt`) and no write
 *   clears it; a thread and a reply are deleted through the hub's own delete, which keeps the thread's reply count right.
 * - `gameContentPreviews`: what a moderator reads in the queue (the game, the kind of item, its text).
 * - `gameContentTargets`: what the reporter sees of their own report in Your reports.
 */
import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/catalog';
import { GAME_REPORT_PREVIEW_CHARS, type GameReportType } from '@/lib/games/moderation';
import { snippet } from '@/lib/games/hub-rules';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';

const gameTitle = (gameId: string): string => games.find((g) => g.id === gameId)?.title ?? gameId;
const achievementName = (id: string): string => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;

/** The member whose item a report is about, or `null` when the item may not be reported. */
export async function gameContentOwner(type: GameReportType, id: string): Promise<string | null> {
  switch (type) {
    case 'game-review': {
      const row = await prisma.gameReview.findUnique({ where: { id }, select: { userId: true, moderatedAt: true } });
      return row && !row.moderatedAt ? row.userId : null;
    }
    case 'game-guide': {
      // A draft is private to its author, so it cannot be reported: the same answer as for a missing guide.
      const row = await prisma.gameGuide.findUnique({
        where: { id },
        select: { authorId: true, published: true, moderatedAt: true },
      });
      return row && row.published && !row.moderatedAt ? row.authorId : null;
    }
    case 'game-thread': {
      const row = await prisma.gameThread.findUnique({ where: { id }, select: { authorId: true } });
      return row?.authorId ?? null;
    }
    case 'game-thread-post': {
      const row = await prisma.gameThreadPost.findUnique({ where: { id }, select: { authorId: true } });
      return row?.authorId ?? null;
    }
    case 'achievement-tip': {
      const row = await prisma.achievementTip.findUnique({
        where: { id },
        select: { userId: true, moderatedAt: true },
      });
      return row && !row.moderatedAt ? row.userId : null;
    }
  }
}

/**
 * A moderator's removal; idempotent (an item already removed keeps its first stamp, a thread or reply already gone
 * is left alone). Returns whether this call did it.
 */
export async function takeDownGameContent(type: GameReportType, id: string, now: Date = new Date()): Promise<boolean> {
  switch (type) {
    case 'game-review': {
      const done = await prisma.gameReview.updateMany({ where: { id, moderatedAt: null }, data: { moderatedAt: now } });
      if (done.count === 1) await invalidateRating(id);
      return done.count === 1;
    }
    case 'game-guide': {
      const done = await prisma.gameGuide.updateMany({ where: { id, moderatedAt: null }, data: { moderatedAt: now } });
      return done.count === 1;
    }
    case 'achievement-tip': {
      const done = await prisma.achievementTip.updateMany({
        where: { id, moderatedAt: null },
        data: { moderatedAt: now },
      });
      return done.count === 1;
    }
    case 'game-thread':
    case 'game-thread-post': {
      const hub = await import('@/lib/games/hub.server');
      try {
        // The admin path of the hub's own delete: it counts the thread's replies down (never below zero) in one transaction.
        if (type === 'game-thread') await hub.deleteThread({ userId: 'moderator', isAdmin: true, threadId: id });
        else await hub.deletePost({ userId: 'moderator', isAdmin: true, postId: id });
        return true;
      } catch (e) {
        if (e instanceof hub.HubError && e.code === 'NOT_FOUND') return false;
        // Two decisions at once: the other one deleted it between our read and our delete.
        if ((e as { code?: string } | null)?.code === 'P2025') return false;
        throw e;
      }
    }
  }
}

/** The 60-second rating cache of the review's game is dropped so the removal shows in the rating at once. */
async function invalidateRating(reviewId: string): Promise<void> {
  const row = await prisma.gameReview.findUnique({ where: { id: reviewId }, select: { gameId: true } });
  if (!row) return;
  const { invalidateRatingCache } = await import('@/lib/games/meta.server');
  invalidateRatingCache(row.gameId);
}

const cut = (text: string): string => snippet(text, GAME_REPORT_PREVIEW_CHARS);

/** First paragraph of a markdown guide body. */
function firstParagraph(body: string): string {
  return body.trim().split(/\n\s*\n/)[0] ?? '';
}

/**
 * What a moderator reads in the queue, keyed by id: the game's title, the kind of item and its text cut to 280
 * characters (a guide's title and first paragraph). Whatever the item's state.
 */
export async function gameContentPreviews(type: GameReportType, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const where = { id: { in: [...ids] } };
  switch (type) {
    case 'game-review': {
      const rows = await prisma.gameReview.findMany({
        where,
        select: { id: true, gameId: true, stars: true, body: true },
      });
      for (const r of rows) out.set(r.id, `${gameTitle(r.gameId)} · Review · ${r.stars}/5 · ${cut(r.body ?? '')}`);
      break;
    }
    case 'game-guide': {
      const rows = await prisma.gameGuide.findMany({
        where,
        select: { id: true, gameId: true, title: true, body: true },
      });
      for (const r of rows)
        out.set(r.id, `${gameTitle(r.gameId)} · Guide · ${cut(`${r.title}. ${firstParagraph(r.body)}`)}`);
      break;
    }
    case 'game-thread': {
      const rows = await prisma.gameThread.findMany({
        where,
        select: { id: true, gameId: true, title: true, body: true },
      });
      for (const r of rows) out.set(r.id, `${gameTitle(r.gameId)} · Discussion · ${cut(`${r.title}. ${r.body}`)}`);
      break;
    }
    case 'game-thread-post': {
      const rows = await prisma.gameThreadPost.findMany({
        where,
        select: { id: true, body: true, thread: { select: { gameId: true, title: true } } },
      });
      for (const r of rows)
        out.set(r.id, `${gameTitle(r.thread.gameId)} · Reply in "${snippet(r.thread.title, 60)}" · ${cut(r.body)}`);
      break;
    }
    case 'achievement-tip': {
      const rows = await prisma.achievementTip.findMany({
        where,
        select: { id: true, achievementId: true, body: true },
      });
      for (const r of rows) out.set(r.id, `${achievementName(r.achievementId)} · Achievement tip · ${cut(r.body)}`);
      break;
    }
  }
  return out;
}

/**
 * What a reporter may see of their own report of one of these items: the item's short label while it is still up
 * (a removed item reads "no longer available"). Blocked authors are left out by the caller.
 */
export async function gameContentTargets(
  type: GameReportType,
  ids: readonly string[],
): Promise<{ id: string; authorId: string; name: string }[]> {
  if (ids.length === 0) return [];
  const where = { id: { in: [...ids] } };
  switch (type) {
    case 'game-review': {
      const rows = await prisma.gameReview.findMany({
        where: { ...where, moderatedAt: null },
        select: { id: true, userId: true, gameId: true },
      });
      return rows.map((r) => ({ id: r.id, authorId: r.userId, name: gameTitle(r.gameId) }));
    }
    case 'game-guide': {
      const rows = await prisma.gameGuide.findMany({
        where: { ...where, published: true, moderatedAt: null },
        select: { id: true, authorId: true, title: true },
      });
      return rows.map((r) => ({ id: r.id, authorId: r.authorId, name: r.title }));
    }
    case 'game-thread': {
      const rows = await prisma.gameThread.findMany({ where, select: { id: true, authorId: true, title: true } });
      return rows.map((r) => ({ id: r.id, authorId: r.authorId, name: r.title }));
    }
    case 'game-thread-post': {
      const rows = await prisma.gameThreadPost.findMany({
        where,
        select: { id: true, authorId: true, body: true },
      });
      return rows.map((r) => ({ id: r.id, authorId: r.authorId, name: r.body }));
    }
    case 'achievement-tip': {
      const rows = await prisma.achievementTip.findMany({
        where: { ...where, moderatedAt: null },
        select: { id: true, userId: true, body: true },
      });
      return rows.map((r) => ({ id: r.id, authorId: r.userId, name: r.body }));
    }
  }
}
