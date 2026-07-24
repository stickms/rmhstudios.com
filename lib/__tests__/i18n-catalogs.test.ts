import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, NAMESPACES, CORE_NAMESPACES } from '@/lib/i18n/config';

function pathFor(locale: string, ns: string): string {
  return join(process.cwd(), 'locales', locale, `${ns}.json`);
}
function load(locale: string, ns: string): Record<string, string> {
  return JSON.parse(readFileSync(pathFor(locale, ns), 'utf8'));
}

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
  // SortableList reorder controls (commit 443451a, the §15 groundwork
  // primitives) landed in en/c-ui.json but weren't machine-translated. Runtime
  // falls back to English per key. Remove once `pnpm i18n:translate &&
  // pnpm i18n:resources` has been run and the catalogs committed.
  'c-ui': ['move-down', 'move-up'],
  feed: [
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
};

describe('catalog integrity', () => {
  // Any namespace a locale provides must cover the English key set — minus the
  // KNOWN_UNTRANSLATED allowlist above — and must NOT carry keys English lacks.
  // Namespaces a locale has not started translating are simply absent and fall
  // back to English per key, so they are skipped here.
  for (const ns of NAMESPACES) {
    const enKeys = Object.keys(load('en', ns));
    const enSet = new Set(enKeys);
    const tolerated = new Set(KNOWN_UNTRANSLATED[ns] ?? []);
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      if (!existsSync(pathFor(locale, ns))) continue;
      it(`${locale}/${ns} covers the English key set (no orphans, no unexpected gaps)`, () => {
        const localeSet = new Set(Object.keys(load(locale, ns)));
        // Orphans: keys the locale has that English does not — always a bug.
        const orphans = [...localeSet].filter((k) => !enSet.has(k)).sort();
        expect(orphans).toEqual([]);
        // Missing: English keys the locale lacks, excluding the tolerated
        // (not-yet-translated) allowlist for this namespace.
        const missing = enKeys.filter((k) => !localeSet.has(k) && !tolerated.has(k)).sort();
        expect(missing).toEqual([]);
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
