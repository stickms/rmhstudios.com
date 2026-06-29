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
 * Lazy loader per language. `en` resolves to the already-bundled copy; zh / ar
 * resolve to their own dynamically-imported chunks so they only download when
 * the user actually uses that language.
 */
export const LOCALE_LOADERS: Record<Locale, () => Promise<LocaleBundle>> = {
  en: async () => en as LocaleBundle,
  zh: () => import("@/lib/i18n/resources.zh").then((m) => m.default as LocaleBundle),
  ar: () => import("@/lib/i18n/resources.ar").then((m) => m.default as LocaleBundle),
};
