// Client-facing i18n resource loading.
//
// Previously this file statically imported EVERY locale JSON for ALL languages
// (en + zh + ar ≈ 2.2 MB raw / ~866 KB minified) into a single eagerly-loaded
// chunk, so every visitor downloaded all three languages even though they render
// one. Then only the DEFAULT language (en) was bundled statically — but that was
// still the FULL ~290 KB catalog (all 66 namespaces, including ~20 games/apps the
// current route never renders) parsed on every page's critical path.
//
// Now the split is finer:
//   - Only the CORE en namespaces (site chrome, nav, feed, shared UI) are bundled
//     statically — the strings any route may paint. This is the eager entry cost.
//   - The rest of the en catalog is its own chunk (resources.en.ts), backfilled
//     on the client right after init (instances.ts) so every en key still resolves
//     but its ~210 KB no longer sits in the first-paint/hydration path.
//   - zh / ar / … are code-split: each is its own chunk, fetched on demand via
//     LOCALE_LOADERS only when that language becomes active (initial SSR carries
//     the active non-en language inline via the root loader; see instances.ts).
//
// Server-side rendering does NOT go through here — it reads every language
// synchronously from resources.server.ts (stubbed out of the client bundle).
import type { Locale } from "@/lib/i18n/config";
import enCore from "@/lib/i18n/resources.en-core";

/** A JSON-serializable value — keeps LocaleBundle valid as TanStack loader/server-fn
 *  output (a bare `Record<string, unknown>` is rejected by its serializer checks). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A full resource bundle for one language: { [namespace]: translations }. */
export type LocaleBundle = Record<string, JsonValue>;

/** The core en namespaces — always bundled (fallback + first-paint for every
 *  route). The remaining namespaces load via {@link loadEnResources}. */
export const EN_CORE_RESOURCES: LocaleBundle = enCore as LocaleBundle;

/** The full en catalog (all namespaces) as its own async chunk. Backfills the
 *  non-core namespaces after init and backs the `en` LOCALE_LOADER; rolldown
 *  dedupes the core JSON already in the entry, so this chunk carries only the
 *  extra (game/app) namespaces. */
export const loadEnResources = (): Promise<LocaleBundle> =>
  import("@/lib/i18n/resources.en").then((m) => m.default as LocaleBundle);

/**
 * Lazy loader per language. `en` resolves to its full-catalog chunk (loaded once
 * and cached by the bundler/browser); every other language resolves to its own
 * dynamically-imported chunk so it only downloads when the user selects it.
 */
export const LOCALE_LOADERS: Record<Locale, () => Promise<LocaleBundle>> = {
  en: loadEnResources,
  zh: () => import("@/lib/i18n/resources.zh").then((m) => m.default as LocaleBundle),
  ar: () => import("@/lib/i18n/resources.ar").then((m) => m.default as LocaleBundle),
  hi: () => import("@/lib/i18n/resources.hi").then((m) => m.default as LocaleBundle),
  es: () => import("@/lib/i18n/resources.es").then((m) => m.default as LocaleBundle),
  fr: () => import("@/lib/i18n/resources.fr").then((m) => m.default as LocaleBundle),
  pt: () => import("@/lib/i18n/resources.pt").then((m) => m.default as LocaleBundle),
  ru: () => import("@/lib/i18n/resources.ru").then((m) => m.default as LocaleBundle),
  de: () => import("@/lib/i18n/resources.de").then((m) => m.default as LocaleBundle),
  ja: () => import("@/lib/i18n/resources.ja").then((m) => m.default as LocaleBundle),
  ko: () => import("@/lib/i18n/resources.ko").then((m) => m.default as LocaleBundle),
  it: () => import("@/lib/i18n/resources.it").then((m) => m.default as LocaleBundle),
  id: () => import("@/lib/i18n/resources.id").then((m) => m.default as LocaleBundle),
  vi: () => import("@/lib/i18n/resources.vi").then((m) => m.default as LocaleBundle),
  tr: () => import("@/lib/i18n/resources.tr").then((m) => m.default as LocaleBundle),
  ur: () => import("@/lib/i18n/resources.ur").then((m) => m.default as LocaleBundle),
  bn: () => import("@/lib/i18n/resources.bn").then((m) => m.default as LocaleBundle),
  pa: () => import("@/lib/i18n/resources.pa").then((m) => m.default as LocaleBundle),
  ta: () => import("@/lib/i18n/resources.ta").then((m) => m.default as LocaleBundle),
  te: () => import("@/lib/i18n/resources.te").then((m) => m.default as LocaleBundle),
  mr: () => import("@/lib/i18n/resources.mr").then((m) => m.default as LocaleBundle),
  fa: () => import("@/lib/i18n/resources.fa").then((m) => m.default as LocaleBundle),
  th: () => import("@/lib/i18n/resources.th").then((m) => m.default as LocaleBundle),
  pl: () => import("@/lib/i18n/resources.pl").then((m) => m.default as LocaleBundle),
  uk: () => import("@/lib/i18n/resources.uk").then((m) => m.default as LocaleBundle),
  nl: () => import("@/lib/i18n/resources.nl").then((m) => m.default as LocaleBundle),
  fil: () => import("@/lib/i18n/resources.fil").then((m) => m.default as LocaleBundle),
  ms: () => import("@/lib/i18n/resources.ms").then((m) => m.default as LocaleBundle),
  ro: () => import("@/lib/i18n/resources.ro").then((m) => m.default as LocaleBundle),
  el: () => import("@/lib/i18n/resources.el").then((m) => m.default as LocaleBundle),
  cs: () => import("@/lib/i18n/resources.cs").then((m) => m.default as LocaleBundle),
  sv: () => import("@/lib/i18n/resources.sv").then((m) => m.default as LocaleBundle),
};
