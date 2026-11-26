/**
 * Reports of a guestbook entry and an announcement comment (sprint 15, feature 06).
 *
 * - `memberTextAuthor`: whose text a report is about, `null` for anything a member may not report (missing, hidden by
 *   the guestbook's owner, deleted). The reporter-independent half of eligibility, used by the shared member-item check.
 * - `memberTextReadableBy`: the reporter-dependent half. The reporter must be able to read the text where it is shown
 *   (the guestbook's own `readGuestbook` rules; a published announcement, an author they have not blocked or muted and
 *   who is not banned), so the report flow never confirms that text they cannot see exists.
 * - `takeDownMemberText`: a moderator's removal. A guestbook entry is deleted (the owner's hide is a different,
 *   reversible act); an announcement comment is soft-deleted, as the admin delete does. Idempotent.
 * - `memberTextPreviews` / `memberTextTargets`: what a moderator reads in the queue, and what the reporter sees of
 *   their own report in Your reports.
 */
import { prisma } from '@/lib/prisma.server';
import { getBlockedAuthorIds, getHiddenAuthorIds } from '@/lib/moderation.server';
import { publishedLogWhere } from '@/lib/blog/publication';
import { isGuestbookMode } from '@/lib/guestbook/schema';
import { notBannedWhere } from '@/lib/moderation/workshop-moderation';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';

export const MEMBER_TEXT_REPORT_TYPES = ['guestbook-entry', 'blog-comment'] as const;
export type MemberTextReportType = (typeof MEMBER_TEXT_REPORT_TYPES)[number];

/** The author of text a member may report, or `null` (missing, hidden by the owner, deleted). */
export async function memberTextAuthor(type: MemberTextReportType, id: string): Promise<string | null> {
  if (type === 'guestbook-entry') {
    const row = await prisma.guestbookEntry.findUnique({ where: { id }, select: { authorId: true, hiddenAt: true } });
    return row && !row.hiddenAt ? row.authorId : null;
  }
  const row = await prisma.blogComment.findUnique({ where: { id }, select: { userId: true, deletedAt: true } });
  return row && !row.deletedAt ? row.userId : null;
}

/** Whether `reporterId` can read the text where it is shown. */
export async function memberTextReadableBy(
  type: MemberTextReportType,
  id: string,
  reporterId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const hidden = await getHiddenAuthorIds(reporterId);
  if (type === 'guestbook-entry') {
    const entry = await prisma.guestbookEntry.findUnique({
      where: { id },
      select: { ownerId: true, authorId: true, hiddenAt: true },
    });
    if (!entry || entry.hiddenAt || hidden.includes(entry.authorId)) return false;
    // The owner reads their own guestbook whatever its mode; a visitor needs it open and no block either way.
    if (entry.ownerId === reporterId) return true;
    const profile = await prisma.userProfile.findUnique({
      where: { userId: entry.ownerId },
      select: { guestbookMode: true },
    });
    if (!isGuestbookMode(profile?.guestbookMode) || profile.guestbookMode === 'off') return false;
    return !(await getBlockedAuthorIds(reporterId)).includes(entry.ownerId);
  }
  const comment = await prisma.blogComment.findUnique({
    where: { id },
    select: { postId: true, userId: true, deletedAt: true, user: { select: { bannedUntil: true } } },
  });
  if (!comment || comment.deletedAt || hidden.includes(comment.userId)) return false;
  if (comment.user.bannedUntil && comment.user.bannedUntil > now) return false;
  const post = await prisma.blogPost.findFirst({
    where: { id: comment.postId, announcement: true, ...publishedLogWhere(now) },
    select: { id: true },
  });
  return !!post;
}

/** A moderator's removal; idempotent. Returns whether this call did it. */
export async function takeDownMemberText(
  type: MemberTextReportType,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (type === 'guestbook-entry') {
    const done = await prisma.guestbookEntry.deleteMany({ where: { id } });
    return done.count === 1;
  }
  const done = await prisma.blogComment.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } });
  return done.count === 1;
}

/** The moderator's view of each reported item, keyed by id, whatever the item's state. */
export async function memberTextPreviews(
  type: MemberTextReportType,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  if (type === 'guestbook-entry') {
    const rows = await prisma.guestbookEntry.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        body: true,
        hiddenAt: true,
        author: { select: userDisplaySelect },
        owner: { select: userDisplaySelect },
      },
    });
    for (const r of rows) {
      const head = `Guestbook entry by ${resolveUser(r.author).name ?? 'Unknown'} on ${resolveUser(r.owner).name ?? 'Unknown'}'s profile${r.hiddenAt ? ' (hidden by the owner)' : ''}`;
      out.set(r.id, `${head}: ${r.body}`);
    }
    return out;
  }
  const rows = await prisma.blogComment.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      content: true,
      deletedAt: true,
      user: { select: userDisplaySelect },
      post: { select: { title: true } },
    },
  });
  for (const r of rows) {
    const head = `Comment by ${resolveUser(r.user).name ?? 'Unknown'} on the announcement "${r.post.title}"${r.deletedAt ? ' (deleted)' : ''}`;
    out.set(r.id, `${head}: ${r.content}`);
  }
  return out;
}

export interface MemberTextTarget {
  type: MemberTextReportType;
  id: string;
  /** A short label for Your reports: the text itself. */
  text: string;
  /** Where the reporter can read it. */
  href: string | null;
}

/**
 * What the reporter may still see of their reported text: only text that is not hidden or deleted, whose author the
 * reporter has not blocked or muted and is not banned. Anything else reads as unavailable.
 */
export async function memberTextTargets(
  byType: Partial<Record<MemberTextReportType, readonly string[]>>,
  hiddenAuthorIds: readonly string[],
  now: Date = new Date(),
): Promise<MemberTextTarget[]> {
  const entryIds = byType['guestbook-entry'] ?? [];
  const commentIds = byType['blog-comment'] ?? [];
  const hidden = [...hiddenAuthorIds];
  const [entries, comments] = await Promise.all([
    entryIds.length
      ? prisma.guestbookEntry.findMany({
          where: { id: { in: [...entryIds] }, hiddenAt: null, authorId: { notIn: hidden }, ownerId: { notIn: hidden } },
          select: { id: true, body: true, ownerId: true },
        })
      : [],
    commentIds.length
      ? prisma.blogComment.findMany({
          where: {
            id: { in: [...commentIds] },
            deletedAt: null,
            userId: { notIn: hidden },
            user: notBannedWhere(now),
            post: { announcement: true, ...publishedLogWhere(now) },
          },
          select: { id: true, content: true, post: { select: { slug: true } } },
        })
      : [],
  ]);
  return [
    ...entries.map((r) => ({
      type: 'guestbook-entry' as const,
      id: r.id,
      text: r.body,
      href: `/u/${r.ownerId}#guestbook`,
    })),
    ...comments.map((r) => ({
      type: 'blog-comment' as const,
      id: r.id,
      text: r.content,
      href: `/blog/${r.post.slug}`,
    })),
  ];
}
