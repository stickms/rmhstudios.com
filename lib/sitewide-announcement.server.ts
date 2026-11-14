/**
 * Sitewide announcements — server logic (prisma, cache). Server-only.
 * Shared contract: ./sitewide-announcement.ts
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { randomUUID } from 'node:crypto';
import { getBusiness, type BusinessId } from '@/lib/businesses';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { SITE_URL } from '@/lib/seo';
import { feedEventBus } from '@/lib/feed-sse';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import type { FeedItem } from '@/lib/feed-types';
import { announcementExpiry, type SitewideAnnouncementSummary } from '@/lib/sitewide-announcement';
import type { SaveAnnouncementFields } from '@/lib/sitewide-announcement-schema';

export const CURRENT_ANNOUNCEMENT_CACHE_KEY = 'sitewide-announcement:current';
const CURRENT_ANNOUNCEMENT_TTL = 60_000;
const CANDIDATE_LIMIT = 10;

export type CurrentAnnouncement = SitewideAnnouncementSummary & { content: string };

async function loadCurrentAnnouncement(): Promise<CurrentAnnouncement | null> {
  const now = Date.now();
  const rows = await prisma.blogPost.findMany({
    where: { announcement: true, announcedAt: { not: null } },
    orderBy: { announcedAt: 'desc' },
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      image: true,
      content: true,
      business: true,
      announcedAt: true,
      announcementExpiresAt: true,
      announcementPostId: true,
    },
  });
  for (const row of rows) {
    if (!row.announcedAt) continue;
    const expires = announcementExpiry(row.announcedAt, row.announcementExpiresAt);
    if (expires.getTime() <= now) continue;
    // One cheap lookup per cache load: a deleted discussion post is no discussion.
    let discussionPostId: string | null = null;
    if (row.announcementPostId) {
      const live = await prisma.rMHark.findFirst({
        where: { id: row.announcementPostId, deletedAt: null },
        select: { id: true },
      });
      discussionPostId = live?.id ?? null;
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      image: row.image,
      business: getBusiness(row.business).id as BusinessId,
      announcedAt: row.announcedAt.toISOString(),
      expiresAt: expires.toISOString(),
      discussionPostId,
      content: row.content,
    };
  }
  return null;
}

/** Newest live announcement (cached ~60s), or null. */
export async function getCurrentAnnouncement(): Promise<CurrentAnnouncement | null> {
  const value = await cached<CurrentAnnouncement | null>(
    CURRENT_ANNOUNCEMENT_CACHE_KEY,
    CURRENT_ANNOUNCEMENT_TTL,
    loadCurrentAnnouncement,
  );
  // The cache can outlive the expiry by up to the TTL; re-check cheaply.
  if (value && Date.parse(value.expiresAt) <= Date.now()) return null;
  return value ?? null;
}

export async function invalidateCurrentAnnouncement(): Promise<void> {
  await invalidateCached(CURRENT_ANNOUNCEMENT_CACHE_KEY);
}

export async function hasSeenAnnouncement(userId: string, postId: string): Promise<boolean> {
  const row = await prisma.blogAnnouncementSeen.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { userId: true },
  });
  return row !== null;
}

/** Record that a member dismissed the announcement. No-op if the post vanished. */
export async function markAnnouncementSeen(userId: string, postId: string): Promise<void> {
  try {
    await prisma.blogAnnouncementSeen.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: { seenAt: new Date() },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') return;
    throw e;
  }
}

export interface AnnouncementFieldsResult {
  data: {
    announcement: boolean;
    business: string;
    announcedAt: Date | null;
    announcementExpiresAt: Date | null;
  };
  /** True when the post is (re-)announced now: callers must clear seen rows. */
  reannounced: boolean;
}

/** Pure: compute the announcement columns to persist for a save. */
export function applyAnnouncementFields(
  existing: { announcement: boolean; announcedAt: Date | null } | null,
  input: SaveAnnouncementFields,
  now: Date,
): AnnouncementFieldsResult {
  const wasOn = existing?.announcement === true;
  const reannounced = input.announcement && !wasOn;
  const announcedAt = reannounced ? now : (existing?.announcedAt ?? null);
  // Stays on but never had a timestamp (legacy row): stamp it so it can go live.
  const stamped = input.announcement && announcedAt === null ? now : announcedAt;
  return {
    data: {
      announcement: input.announcement,
      business: input.business,
      announcedAt: stamped,
      announcementExpiresAt: input.announcementExpiresAt ? new Date(input.announcementExpiresAt) : null,
    },
    reannounced,
  };
}

/**
 * The text of the feed post that carries an announcement: "<Business> announcement: <title>", the description when it
 * fits, then the absolute link to the blog post (a bare URL is what the feed renders as a link). The link is never
 * cut; the title and then the description shrink to keep the whole under the RMHark limit.
 */
export function announcementPostContent(args: {
  title: string;
  description: string;
  slug: string;
  business: BusinessId | string;
}): string {
  const link = `${SITE_URL}/blog/${args.slug}`;
  const clip = (text: string, max: number): string =>
    text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
  const squash = (text: string): string => text.replace(/\s+/g, ' ').replace(/!/g, '').trim();
  const lead = `${getBusiness(args.business).name} announcement: `;
  const linkRoom = link.length + 2; // ".\n" separator before the link
  const titleRoom = Math.max(1, MAX_RMHARK_LENGTH - linkRoom - lead.length);
  const title = clip(squash(args.title), titleRoom);
  const first = `${lead}${title}`;
  const descRoom = MAX_RMHARK_LENGTH - linkRoom - first.length - 2; // ". " before the description
  const description = squash(args.description);
  const showDesc = description.length > 0 && descRoom >= 24;
  const body = showDesc ? `${first.replace(/[.]$/, '')}. ${clip(description, descRoom)}` : first;
  return `${body}\n${link}`;
}

async function isLivePost(id: string): Promise<boolean> {
  const row = await prisma.rMHark.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  return row !== null;
}

/**
 * Make sure an announced blog post has one live feed post to discuss it under. Idempotent and race-safe: the id is
 * claimed on the blog row with a conditional update (which takes the row lock) inside the same transaction that
 * creates the post, so concurrent saves create exactly one. Returns the post id, or null if the blog post is not
 * an announcement (or is gone).
 */
export async function ensureAnnouncementPost(opts: {
  blogPostId: string;
  authorId: string;
  now?: Date;
}): Promise<string | null> {
  const row = await prisma.blogPost.findUnique({
    where: { id: opts.blogPostId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      business: true,
      announcement: true,
      announcementPostId: true,
    },
  });
  if (!row || !row.announcement) return null;
  if (row.announcementPostId && (await isLivePost(row.announcementPostId))) return row.announcementPostId;

  const newId = randomUUID();
  const content = announcementPostContent(row);
  const created = await prisma.$transaction(async (tx) => {
    const claim = await tx.blogPost.updateMany({
      where: { id: row.id, announcement: true, announcementPostId: row.announcementPostId },
      data: { announcementPostId: newId },
    });
    if (claim.count === 0) return null; // lost the race (or the flag went off)
    const post = await tx.rMHark.create({
      data: { id: newId, content, userId: opts.authorId, audience: 'PUBLIC', createdAt: opts.now },
      include: { user: { select: userDisplaySelect } },
    });
    await tx.user.update({ where: { id: opts.authorId }, data: { postCount: { increment: 1 } } });
    return post;
  });

  if (!created) {
    const latest = await prisma.blogPost.findUnique({
      where: { id: row.id },
      select: { announcementPostId: true },
    });
    return latest?.announcementPostId ?? null;
  }

  const item: FeedItem = {
    id: created.id,
    type: 'rmhark',
    createdAt: created.createdAt.toISOString(),
    content: created.content,
    user: resolveUser(created.user),
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    liked: false,
    reposted: false,
    imageUrls: [],
    imageAlts: [],
    isSensitive: false,
    replyControl: created.replyControl,
    reactions: [],
  };
  try {
    feedEventBus.publishCreatedPost(
      {
        type: 'rmhark.created',
        rmharkId: item.id,
        payload: item,
        timestamp: item.createdAt,
        authorId: opts.authorId,
      },
      { audience: 'PUBLIC', communityId: null },
    );
  } catch (e) {
    console.error('announcement post broadcast failed:', e);
  }
  return created.id;
}
