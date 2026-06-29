// Client-facing i18n resource loading.
//
// Previously this file statically imported EVERY locale JSON for ALL languages
// (en + zh + ar ≈ 2.2 MB raw / ~866 KB minified) into a single eagerly-loaded
// chunk, so every visitor downloaded all three languages even though they render
// one. Now:
//   - The DEFAULT language (en) is the only one bundled statically — a single
//     cacheable chunk, also the i18next fallback, so it must always be present.
//   - zh / ar are code-split: each is its own chunk, fetched on demand via
//     LOCALE_LOADERS only when that language becomes active (initial SSR carries
//     the active non-en language inline via the root loader; see instances.ts).
//
// Server-side rendering does NOT go through here — it reads every language
// synchronously from resources.server.ts (stubbed out of the client bundle).
import type { Locale } from "@/lib/i18n/config";
import en from "@/lib/i18n/resources.en";

/** A JSON-serializable value — keeps LocaleBundle valid as TanStack loader/server-fn
 *  output (a bare `Record<string, unknown>` is rejected by its serializer checks). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A full resource bundle for one language: { [namespace]: translations }. */
export type LocaleBundle = Record<string, JsonValue>;

/** The default language's resources — always bundled (fallback + en first paint). */
export const EN_RESOURCES: LocaleBundle = en as LocaleBundle;

/**
 * Lazy loader per language. `en` resolves to the already-bundled copy; every
 * other language resolves to its own dynamically-imported chunk so it only
 * downloads when the user actually selects that language.
 */
export const LOCALE_LOADERS: Record<Locale, () => Promise<LocaleBundle>> = {
  en: async () => en as LocaleBundle,
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
};
