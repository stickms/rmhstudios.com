import { z } from 'zod';

import { MAX_FEED_KEYWORDS, MAX_FEED_PEOPLE, MAX_FEED_TAGS, MAX_FEEDS_PER_USER } from './limits';

// Re-exported for the API routes; client code imports `./limits` directly.
export { MAX_FEED_KEYWORDS, MAX_FEED_PEOPLE, MAX_FEED_TAGS, MAX_FEEDS_PER_USER };

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#?[\p{L}\p{N}_]{1,50}$/u)
  .transform((s) => s.replace(/^#/, ''));

export const customFeedSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  tags: z.array(tagSchema).max(MAX_FEED_TAGS).default([]),
  /** @handles or user ids; resolved to ids on save. */
  people: z.array(z.string().trim().min(1).max(64)).max(MAX_FEED_PEOPLE).default([]),
  keywords: z.array(z.string().trim().min(2).max(40)).max(MAX_FEED_KEYWORDS).default([]),
  isPublic: z.boolean().default(false),
});
export type CustomFeedInput = z.infer<typeof customFeedSchema>;

export const feedViewQuery = z.object({
  cursor: z.string().max(80).optional(),
});

export const alertCreateSchema = z.object({ query: z.string().trim().min(2).max(80) });
export const alertDeleteQuery = z.object({ id: z.string().min(1).max(40) });

export const WATCH_KINDS = ['community', 'build', 'market'] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];
export const WATCH_LEVELS = ['all', 'important', 'nothing'] as const;
export type WatchLevel = (typeof WATCH_LEVELS)[number];

export const watchSchema = z.object({
  kind: z.enum(WATCH_KINDS),
  targetId: z.string().trim().min(1).max(200),
  level: z.enum(WATCH_LEVELS),
});
export const watchQuery = z.object({
  kind: z.enum(WATCH_KINDS),
  targetId: z.string().trim().min(1).max(200),
});

export const surpriseQuery = z.object({
  /** Kinds the caller has just been shown, to avoid an immediate repeat. */
  not: z.string().max(80).optional(),
});

export const memoriesSchema = z.object({ enabled: z.boolean() });

/** `YYYY-MM-DD` in UTC. */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface TrendingWhy {
  tag: string;
  firstSeen: string;
  last24h: number;
  baselinePerDay: number;
  /** last24h relative to the baseline; null when there is no baseline yet. */
  growthPct: number | null;
  starters: { id: string; snippet: string; author: string; href: string; createdAt: string }[];
}

export interface DigestLink {
  title: string;
  href: string;
  meta?: string;
}

export interface DigestPayload {
  day: string;
  builtAt: string;
  topPosts: DigestLink[];
  newBuilds: DigestLink[];
  newLibrary: DigestLink[];
  news: DigestLink[];
  trendingTags: DigestLink[];
}
