/**
 * Feed controls — client-safe types (§17 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * zod-free on purpose — the home feed imports this via `lib/feed/timeline.ts`.
 * The API input schema is in `./signals-schema`.
 */

export const FEED_SIGNAL_KINDS = ['less_author', 'mute_tag', 'follow_tag'] as const;
export type FeedSignalKind = (typeof FEED_SIGNAL_KINDS)[number];

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
