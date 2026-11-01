import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, NAMESPACES, CORE_NAMESPACES, PENDING_LOCALES } from '@/lib/i18n/config';

function pathFor(locale: string, ns: string): string {
  return join(process.cwd(), 'locales', locale, `${ns}.json`);
}
function load(locale: string, ns: string): Record<string, string> {
  return JSON.parse(readFileSync(pathFor(locale, ns), 'utf8'));
}

// ─── Plural-aware key comparison ────────────────────────────────────────────
//
// i18next suffixes plural keys with a CLDR plural category (`count_one`,
// `count_other`, …), and *which* categories exist is a property of the
// language, not of the string. English has two (one, other); Chinese and
// Japanese have one (other); Russian and Polish have four; Arabic has six.
//
// So a raw key-set comparison against English is wrong in both directions: ru
// legitimately carries `_few`/`_many` that English lacks, and zh legitimately
// lacks the `_one` that English has. Comparing coverage on the *base* key and
// checking the categories separately (below) tests what actually matters.

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

function splitPlural(key: string): { base: string; category: string } | null {
  const i = key.lastIndexOf('_');
  if (i <= 0) return null;
  const category = key.slice(i + 1);
  return (PLURAL_CATEGORIES as readonly string[]).includes(category)
    ? { base: key.slice(0, i), category }
    : null;
}

/** Base keys English declares as plural groups — the authority for what counts
 *  as a plural suffix, so a non-plural key merely ending in `_one` is safe. */
function pluralBases(englishKeys: string[]): Set<string> {
  const bases = new Set<string>();
  for (const k of englishKeys) {
    const p = splitPlural(k);
    if (p) bases.add(p.base);
  }
  return bases;
}

/** Collapse plural variants to their base key; leave everything else alone. */
function collapsePlurals(keys: string[], bases: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const p = splitPlural(k);
    out.add(p && bases.has(p.base) ? p.base : k);
  }
  return out;
}

/** The plural categories a language actually requires, per CLDR. */
function requiredCategories(locale: string): string[] {
  return [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories].sort();
}

// Plural groups the translate pipeline emitted with English's shape (one/other)
// instead of the target language's categories. i18next selects the missing
// category, misses, and falls back to English — so e.g. a Russian player sees
// "2 continue" mid-sentence. Verified against i18next 26 with fallbackLng 'en'.
//
// Not filled in by hand here: picking the right Russian or Arabic plural stem is
// a translator's job, not a mechanical one, and duplicating the `_other` string
// into `_few` would replace a visible gap with a silently wrong one. Remove
// entries as `pnpm i18n:translate && pnpm i18n:resources` regenerates them.
const KNOWN_PARTIAL_PLURALS: Record<string, string[]> = {
  'c-dream-rift': ['continues-count'],
};

// Keys that exist in the English source but are not yet machine-translated into
// the other locales. Production fills these at build time via the DeepSeek i18n
// pipeline (Dockerfile `vite-builder` stage), and the runtime falls back to
// English per-key, so an untranslated key is NOT a shipping blocker — but the
// repo's committed catalogs lag behind until someone runs
// `pnpm i18n:translate && pnpm i18n:resources` and commits the result.
//
// List those known-lagging keys here so the exact-key-set check tolerates ONLY
// these specific gaps. ANY other drift — a different untranslated key, or an
// orphan key a locale has that English does not — still fails the suite. Shrink
// this map (ideally to {}) the moment the translate pipeline is run.
const KNOWN_UNTRANSLATED: Record<string, string[]> = {
  // Games library detail pane + playtime notice (2026-10-30). English-only until the
  // translate pipeline runs on build; remove with it.
  'games-hub': [
    // Gems and booster packs (2026-10-30)
    'steam-gems-opened',
    'steam-gems-option',
    'steam-gems-pack',
    'steam-gems-pack-note',
    'steam-gems-title',
    'steam-gems-units',
    'steam-gems-unpack',
    'steam-gems-unpacked',
    // Profile customization and emoticons (2026-10-30)
    'steam-emotes',
    'steam-look-background',
    'steam-look-edit',
    'steam-look-err',
    'steam-look-frame',
    'steam-look-level',
    'steam-look-locked',
    'steam-look-none',
    'steam-look-saved',
    // Profile showcases (2026-10-30)
    'steam-showcase-achievements',
    'steam-showcase-badges',
    'steam-showcase-edit',
    'steam-showcase-err',
    'steam-showcase-reset',
    'steam-showcase-save',
    'steam-showcase-saved',
    // Friend activity and in-game status (2026-10-30)
    'steam-act-achievement',
    'steam-act-badge',
    'steam-act-badge-tail',
    'steam-act-played',
    'steam-act-played-tail',
    'steam-act-review',
    'steam-act-thread',
    'steam-friend-activity',
    'steam-friend-activity-empty',
    'steam-in-game',
    'steam-in-game-empty',
    'steam-status-playing',
    // Library collections (2026-10-30)
    'steam-collections-add',
    'steam-collections-create',
    'steam-collections-err',
    'steam-collections-err-many',
    'steam-collections-err-name',
    'steam-collections-new',
    // Market depth: card page, price history, buy orders (2026-10-30)
    'steam-chart-empty',
    'steam-chart-label',
    'steam-cm-bid',
    'steam-cm-my-order',
    'steam-cm-no-listings',
    'steam-cm-no-orders',
    'steam-cm-order-canceled',
    'steam-cm-order-filled',
    'steam-cm-order-note',
    'steam-cm-order-placed',
    'steam-cm-orders',
    'steam-cm-place-order',
    'steam-cm-sell',
    'steam-cm-your-bid',
    'steam-cm-yours',
    'steam-market-back',
    'steam-price-high',
    'steam-price-history',
    'steam-price-low',
    'steam-price-median',
    'steam-price-volume',
    // Trade and hub notifications, pending count (2026-10-30)
    'steam-pending-trades',
    'guide-body-guide-view',
    'detail-achievements',
    'detail-activity',
    'detail-community',
    'detail-community-none',
    'detail-days-ago-n',
    'detail-friends-none',
    'detail-friends-play',
    'detail-friends-signin',
    'detail-friends-use',
    'detail-last-2-weeks',
    'detail-last-2-weeks-short',
    'detail-last-played',
    'detail-members-count',
    'detail-never',
    'detail-player',
    'detail-playtime',
    'detail-signin-track',
    'detail-time-used',
    'detail-today',
    'detail-top-players',
    'detail-unlocked',
    'detail-yesterday',
    'playtime-notice-body',
    'playtime-notice-change',
    'playtime-notice-dismiss',
    'playtime-notice-label',
    // Per-game Community Hub (2026-10-30).
    'steam-hub-back',
    'steam-hub-body',
    'steam-hub-cards-on-sale',
    'steam-hub-delete',
    'steam-hub-deleted',
    'steam-hub-discussions',
    'steam-hub-empty',
    'steam-hub-guides',
    'steam-hub-heading',
    'steam-hub-library',
    'steam-hub-lock',
    'steam-hub-locked',
    'steam-hub-locked-note',
    'steam-hub-new',
    'steam-hub-newer',
    'steam-hub-no-guides',
    'steam-hub-no-reviews',
    'steam-hub-older',
    'steam-hub-pages',
    'steam-hub-pin',
    'steam-hub-pinned',
    'steam-hub-post',
    'steam-hub-replies',
    'steam-hub-replies-n',
    'steam-hub-reply',
    'steam-hub-signin-hint',
    'steam-hub-signin-reply',
    'steam-hub-title',
    'steam-hub-unlock',
    'steam-hub-unpin',
    // Card trade offers (2026-10-30).
    'steam-trade',
    'steam-trade-accept',
    'steam-trade-accepted',
    'steam-trade-cancel',
    'steam-trade-canceled',
    'steam-trade-decline',
    'steam-trade-declined',
    'steam-trade-less',
    'steam-trade-more',
    'steam-trade-no-cards',
    'steam-trade-note',
    'steam-trade-nothing',
    'steam-trade-send',
    'steam-trade-sent',
    'steam-trade-status-accepted',
    'steam-trade-status-canceled',
    'steam-trade-status-declined',
    'steam-trade-status-expired',
    'steam-trade-with',
    'steam-trade-you-get',
    'steam-trade-you-give',
    'steam-trades',
    'steam-trades-blurb',
    'steam-trades-history',
    'steam-trades-incoming',
    'steam-trades-none-in',
    'steam-trades-none-out',
    'steam-trades-outgoing',
    // Community Market for trading cards (2026-10-30).
    'steam-market',
    'steam-market-all',
    'steam-market-ask',
    'steam-market-ask-ph',
    'steam-market-balance',
    'steam-market-blurb',
    'steam-market-bought',
    'steam-market-buy',
    'steam-market-cancel',
    'steam-market-canceled',
    'steam-market-empty',
    'steam-market-filter',
    'steam-market-foil',
    'steam-market-for-sale',
    'steam-market-from',
    'steam-market-list',
    'steam-market-listed',
    'steam-market-price',
    'steam-market-qty',
    'steam-market-range',
    'steam-market-receive',
    'steam-market-sell',
    'steam-my-listings',
    // Trading cards, badges and inventory (2026-10-30).
    'steam-badge-foil',
    'steam-badge-level',
    'steam-badge-level-n',
    'steam-badges',
    'steam-card-drop',
    'steam-card-drop-foil',
    'steam-card-drop-view',
    'steam-cards-have',
    'steam-craft-badge',
    'steam-craft-done',
    'steam-craft-failed',
    'steam-craft-foil',
    'steam-drops-done',
    'steam-drops-left',
    'steam-inventory',
    'steam-inventory-empty',
    'steam-inventory-total',
    'steam-no-badge',
    'steam-no-badges',
    'steam-trading-cards',
    'steam-view-inventory',
    // Steam-style community pages (2026-10-30).
    'steam-ach-of',
    'steam-achievement-showcase',
    'steam-all-groups',
    'steam-browse-groups',
    'steam-community-home',
    'steam-community-nav',
    'steam-edit-profile',
    'steam-friends',
    'steam-friends-add',
    'steam-friends-already',
    'steam-group-about',
    'steam-group-founded',
    'steam-group-game',
    'steam-group-join',
    'steam-group-members',
    'steam-group-no-desc',
    'steam-group-no-members',
    'steam-group-open',
    'steam-groups',
    'steam-hours-two-weeks',
    'steam-last-days',
    'steam-last-today',
    'steam-last-yesterday',
    'steam-latest-reviews',
    'steam-latest-reviews-empty',
    'steam-level',
    'steam-level-progress',
    'steam-member-since',
    'steam-members-n',
    'steam-no-achievements',
    'steam-no-friends',
    'steam-no-games',
    'steam-no-groups',
    'steam-playtime-hidden',
    'steam-playtime-signin',
    'steam-popular-groups',
    'steam-profile-stats',
    'steam-recent-activity',
    'steam-role-admin',
    'steam-role-mod',
    'steam-stat-followers',
    'steam-stat-games',
    'steam-stat-hours',
    'steam-stat-reviews',
    'steam-status-offline',
    'steam-status-online',
    'steam-trending',
    'steam-trending-empty',
    'steam-trending-line',
    'steam-your-groups',
    'steam-your-groups-empty',
    // Steam-style library skin (2026-10-30).
    'steam-library-home',
    'steam-about',
    'steam-ach-locked',
    'steam-ach-signin',
    'steam-ach-summary',
    'steam-ach-unlocked',
    'steam-achievements',
    'steam-add-game',
    'steam-all-apps',
    'steam-all-games',
    'steam-all-titles',
    'steam-back',
    'steam-back-library',
    'steam-back-to-library',
    'steam-community',
    'steam-community-none',
    'steam-days-ago',
    'steam-empty',
    'steam-error',
    'steam-error-hint',
    'steam-favorite',
    'steam-filter-all',
    'steam-filter-apps',
    'steam-filter-games',
    'steam-filter-label',
    'steam-friends-chat',
    'steam-friends-none',
    'steam-friends-play',
    'steam-friends-short',
    'steam-friends-signin',
    'steam-friends-use',
    'steam-home',
    'steam-home-title',
    'steam-hub-nav',
    'steam-last-played',
    'steam-list-label',
    'steam-members',
    'steam-menu',
    'steam-menu-close',
    'steam-most-played-by',
    'steam-nav',
    'steam-nav-arcade',
    'steam-nav-community',
    'steam-nav-library',
    'steam-nav-store',
    'steam-never',
    'steam-not-found',
    'steam-not-found-hint',
    'steam-on-record',
    'steam-past-two-weeks',
    'steam-play-time',
    'steam-player',
    'steam-playtime-settings',
    'steam-recent-games',
    'steam-retry',
    'steam-search',
    'steam-section-all',
    'steam-section-apps',
    'steam-section-favorites',
    'steam-section-games',
    'steam-section-recent',
    'steam-sign-in',
    'steam-signin-track',
    'steam-sort-az',
    'steam-tags',
    'steam-time-used',
    'steam-today',
    'steam-unfavorite',
    'steam-yesterday',
  ],
  'c-rmhmusic': [
    // UX/QoL batch (plan U1–U15, 2026-10-11) — English-only until the translate pipeline runs.
    'mini-pop-in',
    'mini-pop-out',
  ],
  'c-news': [
    'read-our-take-news-card',
  ],
  'c-rmhcoins': [
    'copy-invite-link',
    'bet-amount-holdem-table',
    'hosted-by-baccarat-lobby',
    'insurance-lost-blackjack-controls',
    'natural-baccarat-controls',
    'result-blackjack-blackjack-controls',
    'result-lose-blackjack-controls',
    'result-push-blackjack-controls',
    'result-win-blackjack-controls',
    'sitting-out-holdem-session-stats',
    'waiting-for-player-blackjack-controls',
    'waiting-for-players-holdem-controls',
    'waiting-next-round-baccarat-controls',
  ],
  // SortableList reorder controls (commit 443451a, the §15 groundwork
  // primitives) landed in en/c-ui.json but weren't machine-translated. Runtime
  // falls back to English per key. Remove once `pnpm i18n:translate &&
  // pnpm i18n:resources` has been run and the catalogs committed.
  'c-ui': [
    // Extract backlog, 2026-09-15 — see the block at the end of this map.
    'cancel-scheduling',
    'clear-selection',
    'doc-body-label',
    'doc-body-placeholder',
    'doc-cancel',
    'doc-preview',
    'doc-save',
    'doc-summary-label',
    'doc-summary-placeholder',
    'doc-title-label',
    'doc-title-placeholder',
    'doc-write',
    'schedule-button',
    'schedule-past-error',
    'schedule-publish-at',
    'schedule-timezone',
    'select-all',
    'selection-actions',
    'selection-count_one',
    'selection-count_other',
  ],
  // ── The RMH family of cars (2026-09-06) ────────────────────────────────
  // Copy for the fleet showcase on /services?tab=cars. English-only until
  // `pnpm i18n:translate && pnpm i18n:resources` runs — the pipeline needs
  // DEEPSEEK_API_KEY, which is not available in this environment. Runtime falls
  // back to English per key.
  'c-rideshare': [
    // Extract backlog, 2026-09-15 — see the block at the end of this map.
    'all-time',
    'distance-driven',
    'earnings',
    'fare-amount',
    'how-your-pay-adds-up',
    'insurance-safety',
    'n-ratings_one',
    'n-ratings_other',
    'n-this-week_one',
    'n-this-week_other',
    'paid-out-in-full',
    'recent-trips',
    'rmh-studios-fee',
    'take-home',
    'this-week',
    'tip-amount',
    'tips',
    'tips-earned',
    'total-take-home',
    'trip-fares',
    'trips-completed',
    'your-rating',
    'cars-bike-blurb',
    'cars-bike-drivetrain',
    'cars-bike-tagline',
    'cars-black-blurb',
    'cars-black-drivetrain',
    'cars-black-tagline',
    'cars-comfort-blurb',
    'cars-comfort-drivetrain',
    'cars-comfort-tagline',
    'cars-cta',
    'cars-fleet-heading',
    'cars-green-blurb',
    'cars-green-drivetrain',
    'cars-green-tagline',
    'cars-heli-blurb',
    'cars-heli-drivetrain',
    'cars-heli-tagline',
    'cars-hint',
    'cars-hint-reduced',
    'cars-hint-static',
    'cars-lede',
    'cars-lineup-heading',
    'cars-lineup-note',
    'cars-loading',
    'cars-reset-view',
    'cars-spec-fare',
    'cars-spec-fare-value',
    'cars-spec-length',
    'cars-spec-length-value',
    'cars-spec-pickup',
    'cars-spec-pickup-value',
    'cars-spec-seats',
    'cars-stage-description',
    'cars-stage-label',
    'cars-title',
    'cars-turn-left',
    'cars-turn-right',
    'cars-x-blurb',
    'cars-x-drivetrain',
    'cars-x-tagline',
    'cars-xl-blurb',
    'cars-xl-drivetrain',
    'cars-xl-tagline',
  ],
  feed: [
    // Wrapped: games year (2026-10-30)
    'home-aria-label',
    'studio-wordmark',
    'tile-badges-crafted',
    'tile-cards-dropped',
    'tile-time-played',
    'wrapped-top-games',
    // Globe eversion Settings > Preview on a device that cannot run it (Fix E1,
    // 2026-10-17). English-only until the translate pipeline runs; remove with it.
    'eversion-preview-unavailable',
    // UI minimalism audit (2026-10-09): the live rail's footer link, renamed
    // from "Explore everything" under a new key. Same pipeline caveat.
    'explore-more-link',
    // Search audit (2026-10-09): what a signed-out search covers, now that
    // /api/search answers signed-out visitors from the static catalog.
    'search-no-matches-signed-out',
    'search-signed-out-cta',
    'search-signed-out-scope',
    // Extract backlog, 2026-09-15 — see the block at the end of this map.
    'drop-images-here',
    'edit-history-added',
    'edit-history-current',
    'edit-history-description',
    'edit-history-open',
    'edit-history-original',
    'edit-history-removed',
    'edit-history-revision',
    'edit-history-stat',
    'edit-history-title',
    'edit-history-unavailable',
    'edit-history-unavailable-detail',
    'image-over-limit_one',
    'image-over-limit_other',
    'image-too-large',
    'image-unsupported',
    'post-queued',
    'tag-post-count_one',
    'tag-post-count_other',
    // ── Explore's Library and Games & Apps discovery (2026-08-08) ────────
    // Section headings for the two Explore tabs that had no discovery content
    // and fell back to the Top mix. English-only until `pnpm i18n:translate &&
    // pnpm i18n:resources` runs — the pipeline needs DEEPSEEK_API_KEY, which is
    // not available in this environment. Runtime falls back to English per key.
    'apps-heading',
    'games-heading',
    'library-book',
    'library-heading',
    'search-library-hint',
    'see-all',
    // ── The Next 100 (2026-08-05) ────────────────────────────────────────
    // Resume-rail strings (B2). English-only until the DeepSeek translate
    // pipeline runs; the runtime falls back to English per key.
    'resume-day',
    'resume-due',
    'resume-level',
    'resume-percent',
    'resume-progress',
    'resume-rail-label',
    'resume-scheduled',
    'resume-score',
    'resume-time-left',
    'resume-title',
    'resume-wave',
    'resume-words',
    // 2026-07-28 UI audit fixes; see the note below.
    'comment-count_one',
    'like-count_one',
    'repost-count_one',
    // Spatial-minimal redesign and 2026 interface rewrite. Runtime falls back to English until the
    // translation pipeline fills every locale catalog.
    'studio-wordmark',
    // ── Home deck + Explore empty states (2026-08-11) ────────────────────
    // The home deck's three surfaces used to share one "Nothing here yet"
    // string, and Explore's Posts/People tabs had no empty branch at all — the
    // sections are `length > 0` guards, so an empty payload rendered an empty
    // column. Each surface now says what it collects, and a signed-out visitor
    // is told why "Following" is missing from the strip. English-only until
    // `pnpm i18n:translate && pnpm i18n:resources` runs — that pipeline needs
    // DEEPSEEK_API_KEY, which is not available here. Runtime falls back to
    // English per key.
    'deck-empty-following',
    'deck-empty-following-title',
    'deck-empty-games',
    'deck-empty-games-title',
    'deck-empty-news',
    'deck-empty-news-title',
    'deck-signed-out',
    'deck-signed-out-cta',
    'deck-signed-out-tail',
    'explore-empty-people',
    'explore-empty-posts',
    // Desktop shell revamp: the top bar's quick panels, the nav / live rails and
    // the home deck's second feed. Runtime falls back to English until the
    // translate pipeline fills the other locale catalogs.
    'home-aria-label',
    // Liquid-glass profile redesign strings; runtime falls back to English until
    // the translation pipeline fills the other locale catalogs.
    'rmhark-count_one',
    // UX/QoL batch (plan U1–U15, 2026-10-11) — English-only until the translate pipeline runs.
    'dm-reply',
    'remind-later',
    'remind-me',
    'remind-post-label',
    'snooze',
    'guestbook-tab',
  ],
  site: [
    // Arcade page (the old /games Home sections), 2026-10-30.
    'arcade-page-subtitle',
    'arcade-page-title',
    // Feature batch (2026-10-12) — English-only until the translate pipeline runs.
    'ladder.pay',
    // UI minimalism audit (2026-10-09): one-line descriptions for the two 3D
    // showcases now listed on the /services hub. Same pipeline caveat.
    'services-cars-desc',
    'services-fashion-desc',
    // /help's title, which was a hardcoded English "Help" in a bespoke header.
    'help-title',
    // The accessible name of the Games ⇄ Apps catalog strip (2026-08-08). Same
    // pipeline caveat as the `feed` block above — English-only until
    // `pnpm i18n:translate && pnpm i18n:resources` runs.
    'catalog-tabs-aria-label',
    // The Services hub's fourth and fifth tabs — the fleet showcase and the
    // fashion studio (2026-09-06). Same pipeline caveat.
    'services-cars-tab',
    'services-fashion-tab',
    // Games library rail, home and playtime privacy (2026-10-30).
    'library-back',
    'library-empty',
    'library-favorite',
    'library-filter-all',
    'library-filter-apps',
    'library-filter-games',
    'library-filter-label',
    'library-home',
    'library-rail-label',
    'library-search',
    'library-section-all',
    'library-section-apps',
    'library-section-favorites',
    'library-section-games',
    'library-section-recent',
    'library-shelf-recent',
    'library-shelf-start',
    'library-unfavorite',
    'playtime-privacy-followers',
    'playtime-privacy-followers-hint',
    'playtime-privacy-private',
    'playtime-privacy-private-hint',
    'playtime-privacy-public',
    'playtime-privacy-public-hint',
    'playtime-privacy-save-error',
    'playtime-privacy-subtitle',
    'playtime-privacy-title',
    'playtime-privacy-who',
  ],
  // ── Slice It settings that had no control (2026-08-08) ─────────────────
  // The accessibility (`A2`/`A3`/`A7`), HUD (`H9`), practice-aid (`P4`),
  // input (`I1`/`A6`), judgement-line (`G11`) and modifier-preset (`M7`)
  // controls, plus the assist and challenge modifiers below. English-only
  // until `pnpm i18n:translate && pnpm i18n:resources` runs — the pipeline
  // needs DEEPSEEK_API_KEY, which is not available in this environment.
  // Runtime falls back to English per key.
  //
  // `gameplay`, `health-gauge`, `health-gauge-hint`, `quant-colors` and
  // `quant-colors-hint` are here despite having shipped in `MainMenu.tsx`
  // months ago: they were written as `ts('…')` behind a renamed `t`, which
  // `i18next-parser` does not recognise as a translation call, so they never
  // reached ANY catalog — including English. Moving them into
  // `SettingsPanel.tsx` under a plain `t` is what finally extracted them.
  'r-slice-it': [
    // Extract backlog, 2026-09-15 — see the block at the end of this map.
    'artist-play-count_one',
    'pack-track-count_one',
    'plus-more-tracks_one',
    'ranked-charts-chip_one',
    'ranked-charts-tooltip_one',
    'setlist-liked-count_one',
    'setlist-missing_one',
  ],
  // ── Extract backlog flushed (2026-09-15) ───────────────────────────────
  // 369 English strings that were live in the source but had never been
  // through `pnpm i18n:extract`, so they existed only as inline
  // `defaultValue`s and never reached locales/ at all. Extracting them is
  // the fix; these are the resulting gaps in the fifteen shipped
  // non-English catalogs.
  //
  // They are listed here rather than filled with English on purpose. The
  // extractor writes the English default into EVERY locale for a new key,
  // and `keysToTranslate` (lib/i18n/diff.ts) only picks up keys MISSING
  // from the target — so an English-filled key is one the translator can
  // never revisit. Leaving the gap is what lets `i18n-translate` (which
  // fires on any push touching locales/en/**) actually translate them.
  // Expect this whole block to come back out in that workflow's PR.
  admin: [
    'security-reports',
    // FOUC audit (2026-10-07) split keys — see that block below.
    'action-failed-appeals',
    'announcements-title-announcements',
    'moderation-queue-description-index',
    'user-builds-description-index',
  ],
  'c-economy': ['tip-invalid'],
  'c-moderation': ['toast-invalid'],
  'c-profile-modules': [
    'lamp-cleared_one',
    'lamp-cleared_other',
    'lamp-fc_one',
    'lamp-fc_other',
    'lamp-perfect_one',
    'lamp-perfect_other',
    'remove-selected',
    // UX/QoL batch (plan U1–U15, 2026-10-11) — English-only until the translate pipeline runs.
    'guestbook-closed',
    'guestbook-delete',
    'guestbook-delete-error',
    'guestbook-empty',
    'guestbook-hide',
    'guestbook-mode-error',
    'guestbook-mode-everyone',
    'guestbook-mode-following',
    'guestbook-mode-off',
    'guestbook-more',
    'guestbook-open-hint',
    'guestbook-placeholder',
    'guestbook-sign',
    'guestbook-sign-error',
    'guestbook-signed',
    'guestbook-unhide',
    'guestbook-who',
    'guestbook-who-desc',
    'someone',
  ],
  'c-roadmap': [
    'request-board-lede',
    'request-board-title',
    'request-body-label',
    'request-body-placeholder',
    'request-by',
    'request-cancel',
    'request-create-failed',
    'request-created',
    'request-empty-description',
    'request-empty-title',
    'request-filter-all',
    'request-filter-label',
    'request-manage',
    'request-merged-into',
    'request-new',
    'request-new-description',
    'request-new-title',
    'request-note-label',
    'request-note-placeholder',
    'request-note-required',
    'request-note-too-long',
    'request-note-too-short',
    'request-official-reply',
    'request-save',
    'request-save-failed',
    'request-saved',
    'request-search-label',
    'request-search-placeholder',
    'request-sign-in',
    'request-sign-in-hint',
    'request-sort-label',
    'request-sort-new',
    'request-sort-status',
    'request-sort-top',
    'request-status',
    'request-status-declined',
    'request-status-in-progress',
    'request-status-open',
    'request-status-planned',
    'request-status-shipped',
    'request-submit',
    'request-title-label',
    'request-title-placeholder',
    'request-unvote',
    'request-vote',
    'request-vote-failed',
  ],
  // ── FOUC audit (2026-10-07) ─────────────────────────────────────────────
  // Keys split off a key that two call sites were sharing with DIFFERENT text.
  // The English catalog held one of the two, so once the non-core catalog
  // loaded, the other page's copy flipped to it after first paint — and, when
  // the catalog won the race with hydration, failed hydration outright
  // (docs/fouc-audit-2026-10-06.md §21). English-only until
  // `pnpm i18n:translate && pnpm i18n:resources` runs, as above. (The
  // admin keys sit in the `admin` list of the backlog block above — an
  // object literal cannot name a namespace twice.)
  'c-library': ['status-analyzing-upload-modal'],
  'c-lists': ['error-add-to-list-sheet'],
  'c-rmh-capital': [
    'businesses-lede-businesses-page',
    'cta-body-firm-page',
    'cta-eyebrow-businesses-page',
    'cta-heading-firm-page',
    'cta-link-businesses-page',
    'hero-heading-firm-page',
    'hero-lede-firm-page',
    'insights-eyebrow-home-page',
    'insights-lede-home-page',
    'value-long-term-body-careers-page',
  ],
  'c-rmh-pmc': [
    'cta-body-capabilities-page',
    'cta-body-command-page',
    'cta-body-home-page',
    'cta-body-intelligence-page',
    'cta-desig-capabilities-page',
    'cta-desig-command-page',
    'cta-desig-intelligence-page',
    'cta-heading-capabilities-page',
    'cta-heading-command-page',
    'cta-heading-home-page',
    'hero-lede-capabilities-page',
    's01-desig-command-page',
    's01-heading-command-page',
    's01-lede-command-page',
    's02-desig-command-page',
    's02-heading-command-page',
    's03-desig-command-page',
    's03-heading-command-page',
    's04-desig-command-page',
    's04-heading-command-page',
    's04-lede-command-page',
  ],
  'c-rmhstudy': [
    'long-break-rmh-study-landing',
    'phase-long-break-rmh-study-landing',
    'phase-short-break-rmh-study-landing',
    'sessions-before-long-break-rmh-study-landing',
    'short-break-rmh-study-landing',
  ],
  'c-rmhtype': ['rounds-rmh-type-multiplayer-page', 'start-typing-rmh-type-room-page'],
  'c-signal-forge': ['tempo-label-collection-modal', 'leech-label-deck-viewer'],
  'c-tournaments': [
    'bracket-tournaments-id',
    'cancel-tournaments-id',
    'done-tournaments-id',
    'host-tournaments-index',
    'single-elim-tournaments-index',
    'title-tournaments-id',
  ],
  'c-user-builds': [
    'view-source-build-card',
    // Workshop (2026-10-30)
    'label-made-for',
    'made-for-hint',
    'made-for-none',
  ],
  'r-strategies': ['leaderboards-index'],
  'settings-notifications': [
    // UX/QoL batch (plan U1–U15, 2026-10-11) — English-only until the translate pipeline runs.
    'tab-badge',
    'tab-badge-desc',
  ],
  'c-saves': [
    // UX/QoL batch (plan U1–U15, 2026-10-11) — English-only until the translate pipeline runs.
    'remind-cancel',
    'remind-cancel-error',
    'remind-error',
    'remind-hour',
    'remind-pick',
    'remind-presets',
    'remind-save',
    'remind-set',
    'remind-title',
    'remind-tomorrow',
    'remind-tonight',
    'remind-week',
    'reminders',
    'reminders-empty-desc',
    'reminders-empty-title',
  ],
  'c-rmhtube': [
    // UX/QoL batch (plan U1–U15, 2026-10-11) — English-only until the translate pipeline runs.
    'bring-back',
    'popped-out',
    'raw-link-check',
    'back-10',
    'control-requested',
    'forward-10',
    'make-leader-named',
    'request-control',
    'seek-bar',
    'seek-bar-readonly',
    'take-control',
    'wants-control',
    // RMHTube features (2026-10-11): start offsets, multi-link add, sync status.
    'pause',
    'play',
    'add-batch-to-queue_one',
    'add-batch-to-queue_other',
    'batch-cancel',
    'batch-count_one',
    'batch-count_other',
    'error-start-time',
    'start-at-label',
    'sync-buffering',
    'sync-catching-up',
    'sync-idle',
    'sync-jump-live',
    'sync-leader',
    'sync-paused-local',
    'sync-resync',
    'sync-stat-clock',
    'sync-stat-offset',
    'sync-stat-rate',
    'sync-stat-rtt',
    'sync-stat-seek-cost',
    'sync-stat-seeks',
    'sync-status-title',
    'sync-synced',
  ],
};

// ─── Registry parity ────────────────────────────────────────────────────────
//
// The checks below guard the two silent failures that catalog *content* tests
// structurally cannot see, because both make a file invisible rather than wrong:
//
//   1. A namespace file that is not in NAMESPACES is never loaded. i18next
//      serves the `defaultValue` from each t() call instead, so English renders
//      correctly and every other locale renders English. Nothing throws.
//   2. A locale directory that is not in LOCALES is translated by the pipeline
//      and served to nobody.
//
// Both had actually happened when these were written: 18 namespaces (every one
// of them a shipped feature — awards, circle, creator, history, lists,
// predictions, saves, tournaments, wager, wishlists, theme studio, three
// settings pages) and 16 locale directories.
describe('registry parity', () => {
  const localesDir = join(process.cwd(), 'locales');

  it('NAMESPACES matches locales/en/ exactly', () => {
    const files = readdirSync(join(localesDir, 'en'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    const registered: string[] = [...NAMESPACES].sort();

    // Unregistered: the file exists, ships in every locale, and is dead weight.
    expect(files.filter((f) => !registered.includes(f))).toEqual([]);
    // Unbacked: registered but no English source — i18next requests a 404 chunk.
    expect(registered.filter((n) => !files.includes(n))).toEqual([]);
  });

  it('every locales/ directory is either shipped or explicitly pending', () => {
    const dirs = readdirSync(localesDir)
      .filter((d) => statSync(join(localesDir, d)).isDirectory())
      .sort();
    const known = [...LOCALES, ...PENDING_LOCALES] as readonly string[];
    expect(dirs.filter((d) => !known.includes(d))).toEqual([]);
  });

  it('no locale is both shipped and pending', () => {
    const shipped = LOCALES as readonly string[];
    expect(PENDING_LOCALES.filter((l) => shipped.includes(l))).toEqual([]);
  });

  it('CORE_NAMESPACES is a subset of NAMESPACES', () => {
    const registered = NAMESPACES as readonly string[];
    expect(CORE_NAMESPACES.filter((ns) => !registered.includes(ns))).toEqual([]);
  });
});

describe('catalog integrity', () => {
  // Any namespace a locale provides must cover the English key set — minus the
  // KNOWN_UNTRANSLATED allowlist above — and must NOT carry keys English lacks.
  // Namespaces a locale has not started translating are simply absent and fall
  // back to English per key, so they are skipped here.
  for (const ns of NAMESPACES) {
    const enKeys = Object.keys(load('en', ns));
    const bases = pluralBases(enKeys);
    const enSet = collapsePlurals(enKeys, bases);
    const tolerated = collapsePlurals(KNOWN_UNTRANSLATED[ns] ?? [], bases);
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      if (!existsSync(pathFor(locale, ns))) continue;

      it(`${locale}/${ns} covers the English key set (no orphans, no unexpected gaps)`, () => {
        const localeSet = collapsePlurals(Object.keys(load(locale, ns)), bases);
        // Orphans: keys the locale has that English does not — always a bug.
        const orphans = [...localeSet].filter((k) => !enSet.has(k)).sort();
        expect(orphans).toEqual([]);
        // Missing: English keys the locale lacks, excluding the tolerated
        // (not-yet-translated) allowlist for this namespace.
        const missing = [...enSet].filter((k) => !localeSet.has(k) && !tolerated.has(k)).sort();
        expect(missing).toEqual([]);
      });

      // The check the collapsed comparison above gives up: every plural group a
      // locale has translated must carry exactly the categories its language
      // requires — no more (dead keys i18next can never select) and no fewer
      // (the count falls back to English mid-sentence).
      it(`${locale}/${ns} uses the CLDR plural categories for its language`, () => {
        const required = requiredCategories(locale);
        const partial = new Set(KNOWN_PARTIAL_PLURALS[ns] ?? []);
        const byBase = new Map<string, string[]>();
        for (const key of Object.keys(load(locale, ns))) {
          const p = splitPlural(key);
          if (!p || !bases.has(p.base)) continue;
          byBase.set(p.base, [...(byBase.get(p.base) ?? []), p.category]);
        }
        const wrong = [...byBase.entries()]
          .filter(([base]) => !tolerated.has(base) && !partial.has(base))
          .map(([base, cats]) => ({ base, got: [...cats].sort() }))
          .filter(({ got }) => got.join(',') !== required.join(','));
        expect(wrong).toEqual([]);
      });
    }
  }

  // Every locale that has STARTED translating must provide the FULL core set
  // (so a partial catalog can't silently ship). A brand-new locale with no core
  // files yet is skipped — it falls back to English until its catalog exists.
  for (const locale of LOCALES) {
    if (locale === 'en') continue;
    const started = CORE_NAMESPACES.some((ns) => existsSync(pathFor(locale, ns)));
    if (!started) continue;
    for (const ns of CORE_NAMESPACES) {
      it(`${locale} provides core namespace ${ns}`, () => {
        expect(existsSync(pathFor(locale, ns))).toBe(true);
      });
    }
  }
});
