/**
 * Shareable stat cards (§13) — the card behind every brag-worthy moment.
 *
 * This used to be a 350-line renderer with its own layout engine and a seven-way
 * accent palette (amber, violet, rose, sky, emerald, pink, cyan). Both are gone:
 *
 * - **The layout is the generic page card.** A moment is a kicker, a hero value,
 *   a supporting line and a user — which is exactly what `page-card.server`
 *   renders for every other page on the site. Keeping a second engine for it
 *   meant two places to fix whenever the card design moved.
 * - **The accents are gone because the design is monochrome.** The default theme
 *   is strict high-contrast monochrome glass and "restraint in the palette is
 *   what lets the optics be loud" (design.md §1). Seven hard-coded hues were a
 *   different product's branding. What each kind *is* still reads, because the
 *   kicker says so in words — which is also the rule that colour may never be
 *   the only carrier of meaning (design.md §7).
 *
 * Two outputs, unchanged:
 *   - 'landscape' → 1200×630 (OG unfurl)
 *   - 'story'     → 1080×1920 (share-to-stories / download)
 */

import { renderPageCard } from '@/lib/og/page-card.server';

export type StatCardKind =
  | 'achievement'
  | 'rank'
  | 'streak'
  | 'pass_tier'
  | 'arcade'
  | 'wrapped_stat'
  | 'market';

export type StatCardVariant = 'landscape' | 'story';

/** What each kind is called. The kicker is the card's only kind indicator. */
const KIND_LABEL: Record<StatCardKind, string> = {
  achievement: 'Achievement unlocked',
  rank: 'Rank up',
  streak: 'Streak milestone',
  pass_tier: 'Battle pass',
  arcade: 'Arcade clear',
  wrapped_stat: 'RMH Wrapped',
  market: 'Marketplace',
};

export interface StatCardUser {
  name?: string | null;
  handle?: string | null;
  image?: string | null;
}

export interface StatCardData {
  kind: StatCardKind;
  /** Eyebrow/context line. Falls back to the kind's label when omitted. */
  title?: string;
  /** The hero value — the big centerpiece (e.g. "Diamond II", "30-day streak"). */
  value: string;
  /** Supporting line under the hero. */
  subtitle?: string;
  user?: StatCardUser | null;
  variant?: StatCardVariant;
  /** Where the moment lives, for the footer. */
  path?: string;
}

export async function renderStatCard(data: StatCardData): Promise<Buffer> {
  const label = KIND_LABEL[data.kind] ?? KIND_LABEL.achievement;
  const name = data.user?.name || data.user?.handle || '';

  return renderPageCard({
    // A moment's content is an immutable snapshot, so everything drawn is in the
    // key and a hit is always correct.
    cacheKey: [
      'moment',
      data.path ?? '',
      data.kind,
      data.title ?? '',
      data.value,
      data.subtitle ?? '',
      name,
      data.user?.handle ?? '',
      data.user?.image ?? '',
    ].join('|'),
    eyebrow: data.title || label,
    title: data.value || 'RMH Studios',
    subtitle: data.subtitle,
    byline: name ? { name, handle: data.user?.handle, image: data.user?.image } : null,
    path: data.path,
    variant: data.variant ?? 'landscape',
  });
}
