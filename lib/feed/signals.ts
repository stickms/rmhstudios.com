/**
 * Feed controls — client-safe types + zod (§17 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 */
import { z } from 'zod';

export const FEED_SIGNAL_KINDS = ['less_author', 'mute_tag', 'follow_tag'] as const;
export type FeedSignalKind = (typeof FEED_SIGNAL_KINDS)[number];

export const feedSignalSchema = z.object({
  kind: z.enum(FEED_SIGNAL_KINDS),
  // authorId (cuid) or a hashtag (normalized lowercase, no '#').
  targetId: z.string().trim().min(1).max(64),
});

export type FeedSignalInput = z.infer<typeof feedSignalSchema>;

/** Normalize a hashtag target (strip '#', lowercase). */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase().slice(0, 64);
}

export interface FeedSignalsView {
  lessAuthors: string[];
  mutedTags: string[];
  followedTags: string[];
}

/** The muted-tag Prisma `where` fragment for feed queries, or `{}` when none. */
export function mutedTagWhere(mutedTags: string[]) {
  if (mutedTags.length === 0) return {};
  return {
    NOT: { hashtags: { some: { hashtag: { tag: { in: mutedTags } } } } },
  };
}
