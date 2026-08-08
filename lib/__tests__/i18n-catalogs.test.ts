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
  // ── The Next 100 (2026-08-05) ──────────────────────────────────────────
  // Badge-rarity tiers (F7), profile-completeness steps (B22) and the shared
  // Undo affordance (B1). English-only until `pnpm i18n:translate &&
  // pnpm i18n:resources` runs — the pipeline needs DEEPSEEK_API_KEY, which is
  // not available in this environment. Runtime falls back to English per key.
  common: [
    'profile-completeness',
    'profile-step-avatar',
    'profile-step-bio',
    'profile-step-follow',
    'profile-step-links',
    'profile-step-post',
    'profile-step-theme',
    'rarity-common',
    'rarity-epic',
    'rarity-legendary',
    'rarity-rare',
    'rarity-uncommon',
    'undo',
    // The 404's single discovery link, after Explore and Search became one
    // page (`notFound.explore` + `notFound.search` were two buttons to the
    // same destination). English-only until the translate pipeline runs.
    'notFound.explore-search',
  ],
  // ── 2026-07-28 UI audit fixes ──────────────────────────────────────────
  // New English strings from the audit remediation (empty states, a11y labels,
  // validation copy, the RMHLadder overview's first pass through t()). Runtime
  // falls back to English per key until `pnpm i18n:translate && pnpm
  // i18n:resources` has been run and the catalogs committed.
  'settings-appearance': ['browse-themes', 'custom-accent-none', 'theme', 'theme-desc'],
  pages: [
    'already-have-account-prompt',
    'no-account-prompt',
    'sign-in-action',
    'sign-up-action',
    'validation-display-name',
    'validation-email',
    'validation-password',
  ],
  library: ['no-books-hint', 'no-books-title', 'no-results-hint'],
  'games-hub': ['no-guides-hint', 'no-reviews-hint'],
  'c-rmhmusic': ['back-to-builds'],
  'c-rmhcalculator': ['back-to-builds'],
  'c-news': ['filters', 'no-articles-hint', 'no-articles-yet', 'no-articles-yet-hint'],
  'c-lights-out': ['cell-label', 'hint-described'],
  // ── Direct lobby links (2026-08-06) ────────────────────────────────────
  // The copy-the-invite-link affordance every multiplayer lobby grew beside
  // its join code. English-only until `pnpm i18n:translate &&
  // pnpm i18n:resources` runs — the pipeline needs DEEPSEEK_API_KEY, which is
  // not available in this environment. Runtime falls back to English per key.
  'c-gabriels-horn': ['copy-invite-link', 'copy-link-failed'],
  'c-kowloon-knockout': ['copy-link'],
  'c-laundry-sort': ['copy-invite-link', 'copy-link-failed', 'link-copied'],
  'c-massive-march': ['copy-link'],
  'c-neon-driftway': ['copy-code', 'copy-invite-link'],
  'c-rmhbox': ['copy-invite-link'],
  'c-rmhcoins': ['copy-invite-link'],
  'c-synapse-storm': ['copy-invite-link'],
  // SortableList reorder controls (commit 443451a, the §15 groundwork
  // primitives) landed in en/c-ui.json but weren't machine-translated. Runtime
  // falls back to English per key. Remove once `pnpm i18n:translate &&
  // pnpm i18n:resources` has been run and the catalogs committed.
  'c-ui': ['move-down', 'move-up'],
  feed: [
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
    'read-more',
    'buy-item-aria',
    'comment-count_one',
    'comment-count_other',
    'feed-empty-surface-title',
    'kicker.GAME_ANNOUNCEMENT',
    'like-count_one',
    'like-count_other',
    'loading-feed',
    'no-communities-found-hint',
    'no-communities-hint',
    'no-communities-title',
    'no-public-decks-hint',
    'repost-count_one',
    'repost-count_other',
    'settings-accent-selected',
    // Spatial-minimal redesign and 2026 interface rewrite. Runtime falls back to English until the
    // translation pipeline fills every locale catalog.
    'designed-for-focus',
    'design-system',
    'enter-new-rmh',
    'explore-arcade',
    'explore-new-ui',
    'feed-hero-body',
    'feed-hero-description-rewrite',
    'feed-hero-title',
    'feed-hero-title-rewrite',
    'feed-index-label',
    'feed-kicker',
    'feed-view-heading-rewrite',
    'home-studio-label',
    'nav-arcade',
    'nav-creator-studio',
    'nav-explore',
    'nav-home',
    'nav-library',
    'navigation-index',
    'rmh-digital-space',
    'spatial-feature-motion-body',
    'spatial-feature-motion-title',
    'spatial-feature-space-body',
    'spatial-feature-space-title',
    'spatial-feature-system-body',
    'spatial-feature-system-title',
    'spatial-rewrite-motion-copy',
    'spatial-rewrite-motion-title',
    'spatial-rewrite-navigation-copy',
    'spatial-rewrite-navigation-title',
    'spatial-rewrite-palette-copy',
    'spatial-rewrite-palette-title',
    'start-creating',
    'studio-wordmark',
    'whats-new',
    'whatsnew-kicker',
    'whatsnew-subtitle-spatial',
    'whatsnew-subtitle-spatial-rewrite',
    'whatsnew-title-spatial',
    'whatsnew-title-spatial-rewrite',
    'whatsnew-version',
    'menu-audience',
    'menu-content-warning',
    'menu-reply-control',
    // RightSidebar footer link to the standalone DIA site; awaiting the
    // DeepSeek translate pipeline. Runtime falls back to English per key.
    'internal-affairs',
    // Feed sidebar footer link to the standalone RMH Designs site (#610);
    // awaiting the DeepSeek translate pipeline. Runtime falls back to English.
    'designs',
    // Profile-customization page + settings strings added in #526; awaiting the
    // DeepSeek translate pipeline. Remove once `pnpm i18n:translate &&
    // pnpm i18n:resources` has been run and the catalogs committed.
    'profile-cosmetics-back',
    'profile-cosmetics-empty-cta',
    'profile-cosmetics-empty-desc',
    'profile-cosmetics-empty-title',
    'profile-cosmetics-equip',
    'profile-cosmetics-equip-failed',
    'profile-cosmetics-equip-label',
    'profile-cosmetics-equipped',
    'profile-cosmetics-equipped-toast',
    'profile-cosmetics-error',
    'profile-cosmetics-subtitle',
    'profile-cosmetics-title',
    'profile-cosmetics-unequip-label',
    'profile-cosmetics-unequipped-toast',
    // Desktop shell revamp: the top bar's quick panels, the nav / live rails and
    // the home deck's second feed. Runtime falls back to English until the
    // translate pipeline fills the other locale catalogs.
    'compose',
    'discover',
    'explore-more',
    'feed',
    'feed-empty-surface',
    'feed-games',
    'feed-news',
    'home-aria-label',
    'messages-empty',
    'messages-see-all',
    'more-feeds',
    'nav-wallet',
    'notifications-empty',
    'notifications-see-all',
    'online-now-count',
    'panel-failed',
    'search',
    'search-failed',
    'search-hint',
    'search-no-matches',
    'search-see-all',
    'search-sign-in',
    'view-full-profile',
    // Liquid-glass profile redesign strings; runtime falls back to English until
    // the translation pipeline fills the other locale catalogs.
    'add-profile-bio',
    'bio-preview-placeholder',
    'change-avatar',
    'change-cover',
    'copy-profile-link',
    'creator-membership',
    'creator-support',
    'creator-support-hint',
    'direct-messages',
    'direct-messages-hint',
    'discard-changes',
    'discard-profile-changes-body',
    'discard-profile-changes-title',
    'failed-remove-banner',
    'links-editor-hint',
    'live-preview',
    'live-preview-hint',
    'membership-price-short',
    'monthly-tip-goal',
    'pause-profile-song',
    'play-profile-song',
    'profile-cover',
    'profile-cover-hint',
    'profile-editor-creator',
    'profile-editor-description',
    'profile-editor-identity',
    'profile-editor-links',
    'profile-editor-privacy',
    'profile-editor-sections',
    'profile-links',
    'profile-look',
    'profile-look-hint',
    'profile-photo',
    'profile-showcase',
    'profile-soundtrack',
    'profile-soundtrack-hint',
    'profile-stats',
    'profile-up-to-date',
    'rmhark-count_one',
    'rmhark-count_other',
    'rmharks-label',
    'save-profile',
    'sign-in-to-follow',
    'tip-goal-name',
    'unknown',
    'unsaved-profile-changes',
    'upload-photo',
    'verified',
    'settings-back',
    'settings-premium-themes-equip-link',
    'settings-premium-themes-or',
  ],
  site: [
    // The accessible name of the Games ⇄ Apps catalog strip (2026-08-08). Same
    // pipeline caveat as the `feed` block above — English-only until
    // `pnpm i18n:translate && pnpm i18n:resources` runs.
    'catalog-tabs-aria-label',
    // 2026-07-28 UI audit fixes; see the note below.
    'get-started-free',
    'ladder-awaiting-first-run',
    'ladder-expiring-soon',
    'ladder-last-run',
    'ladder-no-expiring',
    'ladder-no-expiring-hint',
    'ladder-no-matches',
    'ladder-no-matches-hint',
    'ladder-open-review-queue',
    'ladder-stat-expiring',
    'ladder-stat-new',
    'ladder-stat-review',
    'ladder-stat-saved',
    'ladder-stat-verified',
    'ladder-top-matches',
    'ladder-top-opportunities',
    // Public spatial design-system story. Runtime falls back to English until
    // the translation pipeline fills every locale catalog.
    'built-for-everyone',
    'design-at-rmh',
    'design-cta',
    'design-cta-body',
    'design-statement',
    'make-it-yours',
    'new-foundation',
    'open-appearance',
    'operating-principles',
    'rmh-studios',
    'skip-to-content',
    'spatial-design-lede',
    'spatial-minimalism',
    'spatial-principle-focus-body',
    'spatial-principle-focus-title',
    'spatial-principle-motion-body',
    'spatial-principle-motion-title',
    'spatial-principle-system-body',
    'spatial-principle-system-title',
    'spatial-system-name',
    'spatial-system-version',
    'three-rules',
  ],
  // Daily Puzzles hub strings added with the non-3D /daily rewrite; awaiting the
  // DeepSeek translate pipeline. Runtime falls back to English per key. Remove
  // once `pnpm i18n:translate && pnpm i18n:resources` has been run and the
  // catalogs committed.
  'c-daily-puzzles': [
    'all-done-filter',
    'copy-failed',
    'filter-all',
    'filter-done',
    'filter-label',
    'filter-todo',
    'hub-footer',
    'hub-headline',
    'loading-puzzle',
    'mode-title-alibi',
    'mode-title-chainlink',
    'mode-title-impostor',
    'mode-title-lights-out',
    'mode-title-outcast',
    'mode-title-spectrum',
    'moves-suffix',
    'next-drop-in',
    'none-done-yet',
    'pts-suffix',
    'puzzle-number',
    'share-today',
    'stat-all-time',
    'stat-points-today',
    'stat-solved-today',
    'stat-streak',
    'view-results-short',
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
    'accessibility',
    // ── The multiplayer song picker's own verb (2026-08-08) ──────────────
    // The library's row action is labelled by its caller now: the lobby ADDs a
    // track, the solo menu PLAYs one. English-only until `pnpm i18n:translate
    // && pnpm i18n:resources` runs.
    'add-song',
    'library-add',
    'assist-tick',
    'assist-tick-hint',
    'combo-center',
    'combo-hidden',
    'combo-left',
    'combo-position',
    'combo-position-hint',
    'combo-right',
    'effect-intensity',
    'effect-intensity-hint',
    'extra-binds-add',
    'extra-binds-conflict',
    'extra-binds-hint',
    'extra-binds-lane-a',
    'extra-binds-lane-b',
    'extra-binds-listening',
    'extra-binds-remove',
    'gameplay',
    'health-gauge',
    'health-gauge-hint',
    'hud',
    'input-offset',
    'input-offset-hint',
    'judgement-floor',
    'judgement-floor-hint',
    'judgement-opacity',
    'judgement-scale',
    'lane-palette',
    'lane-palette-default',
    'lane-palette-deuteranopia',
    'lane-palette-hint',
    'lane-palette-monochrome',
    'lane-palette-tritanopia',
    'line-position',
    'line-position-hint',
    'metronome',
    'metronome-hint',
    'modifier-presets',
    'modifier-presets-hint',
    'practice-aids',
    'preset-delete',
    'preset-empty',
    'preset-name-label',
    'preset-name-placeholder',
    'preset-save',
    'quant-colors',
    'quant-colors-hint',
    'reduced-flash',
    'reduced-flash-hint',
  ],
  // Slice It's assist family (`A1`/`M5`) and the two challenge modifiers
  // (`M2` and Sudden Death) that the engine honoured with no toggle. Same
  // pipeline caveat as above.
  'c-game': [
    'assists',
    'assists-hint',
    'mod-assist',
    'mod-no-fail',
    'mod-s-random',
    'mod-tap-holds',
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
