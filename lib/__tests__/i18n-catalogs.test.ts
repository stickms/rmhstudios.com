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
  feed: [
    'menu-audience',
    'menu-content-warning',
    'menu-reply-control',
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
    'settings-back',
    'settings-premium-themes-equip-link',
    'settings-premium-themes-or',
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
