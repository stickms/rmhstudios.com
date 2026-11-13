/**
 * Sitewide announcements — server logic (prisma, cache). Server-only.
 * Shared contract: ./sitewide-announcement.ts
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma.server';
import { cached, invalidateCached } from './cached.server';
import { getBusiness, type BusinessId } from './businesses';
import {
  announcementExpiry,
  type SaveAnnouncementFields,
  type SitewideAnnouncementSummary,
} from './sitewide-announcement';

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
    },
  });
  for (const row of rows) {
    if (!row.announcedAt) continue;
    const expires = announcementExpiry(row.announcedAt, row.announcementExpiresAt);
    if (expires.getTime() <= now) continue;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      image: row.image,
      business: getBusiness(row.business).id as BusinessId,
      announcedAt: row.announcedAt.toISOString(),
      expiresAt: expires.toISOString(),
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
