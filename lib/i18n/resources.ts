// Client-facing i18n resource loading.
//
// Previously this file statically imported EVERY locale JSON for ALL languages
// (en + zh + ar ≈ 2.2 MB raw / ~866 KB minified) into a single eagerly-loaded
// chunk, so every visitor downloaded all three languages even though they render
// one. Then only the DEFAULT language (en) was bundled statically — but that was
// still the FULL ~290 KB catalog (all 66 namespaces, including ~20 games/apps the
// current route never renders) parsed on every page's critical path.
//
// Then only the CORE en namespaces (~136 KB minified) — still the largest single
// item in the entry chunk of every page (CSS/JS audit 2026-10-09).
//
// Now NO catalog is bundled:
//   - English renders from each `t()` call's `defaultValue`, on the server and on
//     the client's first render alike, so hydration matches by construction.
//     `lib/__tests__/i18n-default-drift.test.ts` holds every default equal to
//     `locales/en`, so the catalog arriving later changes nothing on screen.
//   - The full en catalog is its own chunk (resources.en.ts), backfilled on the
//     client after `load` + idle (instances.ts) — for other locales' fallback and
//     for any key read without a default.
//   - zh / ar / … are code-split: each is its own chunk, fetched on demand via
//     LOCALE_LOADERS only when that language becomes active (initial SSR carries
//     the active non-en language inline via the root loader; see instances.ts).
//
// Server-side rendering reads through resources.server.ts (stubbed out of the
// client bundle), which reuses the LOCALE_LOADERS below to load ONLY the active
// language on demand (no longer all 16 statically at boot — cold-start win) and
// caches it for the synchronous SSR i18n init.
import type { Locale } from '@/lib/i18n/config';

/** A JSON-serializable value — keeps LocaleBundle valid as TanStack loader/server-fn
 *  output (a bare `Record<string, unknown>` is rejected by its serializer checks). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A full resource bundle for one language: { [namespace]: translations }. */
export type LocaleBundle = Record<string, JsonValue>;

/** The full en catalog (all namespaces) as its own async chunk. Backfilled after
 *  init (lib/i18n/instances.ts) and backs the `en` LOCALE_LOADER. */
export const loadEnResources = (): Promise<LocaleBundle> =>
  import('@/lib/i18n/resources.en').then((m) => m.default as LocaleBundle);

/**
 * Lazy loader per language. `en` resolves to its full-catalog chunk (loaded once
 * and cached by the bundler/browser); every other language resolves to its own
 * dynamically-imported chunk so it only downloads when the user selects it.
 */
export const LOCALE_LOADERS: Record<Locale, () => Promise<LocaleBundle>> = {
  en: loadEnResources,
  zh: () => import('@/lib/i18n/resources.zh').then((m) => m.default as LocaleBundle),
  ar: () => import('@/lib/i18n/resources.ar').then((m) => m.default as LocaleBundle),
  hi: () => import('@/lib/i18n/resources.hi').then((m) => m.default as LocaleBundle),
  es: () => import('@/lib/i18n/resources.es').then((m) => m.default as LocaleBundle),
  fr: () => import('@/lib/i18n/resources.fr').then((m) => m.default as LocaleBundle),
  pt: () => import('@/lib/i18n/resources.pt').then((m) => m.default as LocaleBundle),
  ru: () => import('@/lib/i18n/resources.ru').then((m) => m.default as LocaleBundle),
  de: () => import('@/lib/i18n/resources.de').then((m) => m.default as LocaleBundle),
  ja: () => import('@/lib/i18n/resources.ja').then((m) => m.default as LocaleBundle),
  ko: () => import('@/lib/i18n/resources.ko').then((m) => m.default as LocaleBundle),
  it: () => import('@/lib/i18n/resources.it').then((m) => m.default as LocaleBundle),
  id: () => import('@/lib/i18n/resources.id').then((m) => m.default as LocaleBundle),
  vi: () => import('@/lib/i18n/resources.vi').then((m) => m.default as LocaleBundle),
  tr: () => import('@/lib/i18n/resources.tr').then((m) => m.default as LocaleBundle),
  ur: () => import('@/lib/i18n/resources.ur').then((m) => m.default as LocaleBundle),
};
