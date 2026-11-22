/**
 * Log publication (s03-05, server-only): publishing the Logs whose time has come, the revision history, and the
 * admin-side reads of Logs that are not live. Everything public reads Logs through `publishedLogWhere`
 * (`lib/blog/publication.ts`); this file and the admin module are the only places allowed to see a draft.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { pingIndexNow } from '@/lib/seo/indexnow.server';
import { invalidateCurrentAnnouncement } from '@/lib/sitewide-announcement.server';
import { invalidateCached, invalidateCachedPrefix } from '@/lib/cached.server';
import { MAX_REVISIONS_PER_LOG, wordCount, type LogStatus } from '@/lib/blog/publication';

/**
 * Drop every cached public read of the Logs (announcement pop-up, sidebar list, feed announcements, the RSS feed).
 * Called after any change of what is live (publish, unpublish, delete, edit) so an unpublished Log does not linger
 * in a cache for its TTL. Keys must match their owners in `sidebar-data.ts`, `feed/timeline.ts` and `blog.rss[.]xml.ts`
 * (asserted in log-publication.test.ts).
 */
export async function invalidateLogCaches(): Promise<void> {
  await Promise.all([
    invalidateCurrentAnnouncement(),
    invalidateCached('sidebar:blogPosts'),
    invalidateCached('blog:rss'),
    invalidateCachedPrefix('feed:announcements:'),
  ]);
}

const PUBLISH_LOCK = 'blog-publish-due';

/** `YYYY-MM-DD` (UTC): the day a Log with no date goes out under. */
export function publishDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Publish every scheduled Log whose time has come; returns the slugs published. Safe to run twice and from two
 * workers: a transaction-level advisory lock makes a second run return at once, and each Log is claimed by an
 * `updateMany` that only matches while it is still `scheduled`, so it is published exactly once.
 *
 * `publishedAt` is set to the moment of publication (not the wanted time) so the subscription fan-out, which reads
 * Logs by that date from its own cursor, sees the Log as new; `announcedAt` is stamped the same way so a scheduled
 * announcement pops up only once it is live.
 */
export async function publishDueLogs(now: Date = new Date()): Promise<string[]> {
  const published = await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<
      {
        locked: boolean;
      }[]
    >`
      SELECT pg_try_advisory_xact_lock(hashtext(${PUBLISH_LOCK})) AS locked`;
    if (!lock[0]?.locked) return [] as string[];

    const due = await tx.blogPost.findMany({
      where: {
        status: 'scheduled',
        publishAt: {
          lte: now,
        },
      },
      orderBy: [
        {
          publishAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      select: {
        id: true,
        slug: true,
        announcement: true,
      },
    });
    const slugs: string[] = [];
    for (const post of due) {
      const claimed = await tx.blogPost.updateMany({
        where: {
          id: post.id,
          status: 'scheduled',
          publishAt: {
            lte: now,
          },
        },
        data: {
          status: 'published',
          publishedAt: now,
          publishAt: null,
          ...(post.announcement
            ? {
                announcedAt: now,
              }
            : {}),
        },
      });
      if (claimed.count !== 1) continue;
      // A Log written without a date goes out under the day it is published (FR-7).
      await tx.blogPost.updateMany({
        where: {
          id: post.id,
          date: '',
        },
        data: {
          date: publishDay(now),
        },
      });
      if (post.announcement)
        await tx.blogAnnouncementSeen.deleteMany({
          where: {
            postId: post.id,
          },
        });
      slugs.push(post.slug);
    }
    return slugs;
  });

  if (published.length > 0) {
    await invalidateLogCaches();
    pingIndexNow(published.map((slug) => `/blog/${slug}`));
  }
  return published;
}

export interface RevisionInput {
  postId: string;
  authorId: string | null;
  title: string;
  description: string;
  tags: string[];
  content: string;
}

type RevisionDb = Pick<Prisma.TransactionClient, 'blogPostRevision'>;

/** Record one saved version of a Log and prune the oldest beyond {@link MAX_REVISIONS_PER_LOG}. */
export async function saveRevision(db: RevisionDb, input: RevisionInput): Promise<void> {
  await db.blogPostRevision.create({
    data: {
      postId: input.postId,
      authorId: input.authorId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      content: input.content,
    },
  });
  const stale = await db.blogPostRevision.findMany({
    where: {
      postId: input.postId,
    },
    orderBy: {
      id: 'desc',
    },
    skip: MAX_REVISIONS_PER_LOG,
    select: {
      id: true,
    },
  });
  if (stale.length > 0) {
    await db.blogPostRevision.deleteMany({
      where: {
        id: {
          in: stale.map((r) => r.id),
        },
      },
    });
  }
}

export interface RevisionSummary {
  id: string;
  /** ISO timestamp. */
  createdAt: string;
  authorName: string | null;
  title: string;
  /** Words added (positive) or removed (negative) against the version saved just before it. */
  wordDelta: number;
}

export interface RevisionDetail {
  id: string;
  createdAt: string;
  authorName: string | null;
  title: string;
  description: string;
  tags: string[];
  content: string;
}

async function authorNames(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: unique,
      },
    },
    select: userChipSelect,
  });
  return new Map(users.map((u) => [u.id, u.name ?? '']));
}

/** A Log's saved versions, newest first, with each one's word-count change; null when the Log does not exist. */
export async function listRevisions(slug: string): Promise<RevisionSummary[] | null> {
  const post = await prisma.blogPost.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });
  if (!post) return null;
  const rows = await prisma.blogPostRevision.findMany({
    where: {
      postId: post.id,
    },
    orderBy: {
      id: 'desc',
    },
    take: MAX_REVISIONS_PER_LOG,
    select: {
      id: true,
      createdAt: true,
      authorId: true,
      title: true,
      content: true,
    },
  });
  const names = await authorNames(rows.map((r) => r.authorId));
  return rows.map((row, i) => {
    const before = rows[i + 1];
    return {
      id: String(row.id),
      createdAt: row.createdAt.toISOString(),
      authorName: row.authorId ? (names.get(row.authorId) ?? null) : null,
      title: row.title,
      wordDelta: wordCount(row.content) - (before ? wordCount(before.content) : 0),
    };
  });
}

/** One saved version in full, or null when it is not a version of this Log. */
export async function getRevision(slug: string, id: bigint): Promise<RevisionDetail | null> {
  const post = await prisma.blogPost.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });
  if (!post) return null;
  const row = await prisma.blogPostRevision.findFirst({
    where: {
      id,
      postId: post.id,
    },
  });
  if (!row) return null;
  const names = await authorNames([row.authorId]);
  return {
    id: String(row.id),
    createdAt: row.createdAt.toISOString(),
    authorName: row.authorId ? (names.get(row.authorId) ?? null) : null,
    title: row.title,
    description: row.description,
    tags: row.tags,
    content: row.content,
  };
}

/** A Log in any state, for the admin list. */
export interface AdminLogRow {
  slug: string;
  title: string;
  date: string;
  status: LogStatus;
  publishAt: string | null;
  publishedAt: string | null;
  announcement: boolean;
  business: string;
}

export async function listLogsForAdmin(): Promise<AdminLogRow[]> {
  const rows = await prisma.blogPost.findMany({
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    select: {
      slug: true,
      title: true,
      date: true,
      status: true,
      publishAt: true,
      publishedAt: true,
      announcement: true,
      business: true,
    },
  });
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    date: r.date,
    status: r.status === 'scheduled' || r.status === 'draft' ? r.status : 'published',
    publishAt: r.publishAt?.toISOString() ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    announcement: r.announcement,
    business: r.business,
  }));
}

/** A Log in any state (the editor, and an admin previewing a draft), or null. */
export async function findLogForAdmin(slug: string) {
  return prisma.blogPost.findUnique({
    where: {
      slug,
    },
  });
}
