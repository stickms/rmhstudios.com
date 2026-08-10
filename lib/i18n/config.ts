import type { InitOptions } from "i18next";

export const LOCALES = [
  // The most widely spoken languages, fully translated and maintained.
  "en", "zh", "ar", "hi", "es", "fr", "pt", "ru",
  "de", "ja", "ko", "it", "id", "vi", "tr", "ur",
] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Locale directories that exist under `locales/` but are NOT shipped.
 *
 * These carry real, machine-translated catalogs and cost real pipeline time on
 * every `pnpm i18n:translate`, but nothing serves them: a locale reaches users
 * only through `LOCALES` above. They are listed here rather than left implicit
 * so the catalog test can hold `locales/` to `LOCALES ∪ PENDING_LOCALES` and a
 * seventeenth orphan can't appear unnoticed.
 *
 * Promoting one is a product decision, not a mechanical one — it commits us to
 * maintaining its catalog and needs a `LOCALE_LABELS` / `TRANSLATE_TARGETS` /
 * `LOCALE_TO_LANGUAGE_NAME` entry (the types below enforce all three). Note
 * that `fa` is RTL and would also need adding to `RTL_LOCALES`.
 */
export const PENDING_LOCALES = [
  "bn", "cs", "el", "fa", "fil", "mr", "ms", "nl",
  "pa", "pl", "ro", "sv", "ta", "te", "th", "uk",
] as const;

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Right-to-left locales. dirFor() and the no-flash <html dir> guard read this,
 * so add a locale here (instead of a hardcoded `=== "ar"`) to make the whole
 * app render it RTL.
 */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar", "ur"]);

/**
 * The namespace registry. A `locales/en/<ns>.json` file that is NOT listed here
 * is never loaded — i18next serves the `defaultValue` baked into each `t()`
 * call, so English looks correct and every other locale silently serves English
 * too. That failure is invisible at runtime and in CI unless something asserts
 * it, so `lib/__tests__/i18n-catalogs.test.ts` holds this list to exact set
 * equality with `locales/en/`. Add the namespace here in the same commit that
 * adds the file.
 */
export const NAMESPACES = [
  // Site-wide + section namespaces.
  "common", "nav", "admin", "builds", "errors", "feed", "games-hub", "groups",
  "library", "pages", "rideshare", "search", "settings-appearance",
  "settings-content", "settings-notifications", "shared", "site",
  "theme-studio", "user-builds", "v",
  // Component namespaces.
  "c-admin", "c-altair", "c-awards", "c-blog", "c-builds", "c-bums-rush", "c-circle",
  "c-creator", "c-cursed-logic", "c-daily-puzzles", "c-doctrine",
  "c-dream-rift", "c-economy", "c-forest-explorer", "c-gabriels-horn",
  "c-game", "c-history", "c-house-always-wins", "c-isleworks",
  "c-kaikai-debt",
  "c-kowloon-knockout", "c-laundry-sort", "c-layout", "c-library",
  "c-lights-out", "c-lists", "c-lockdown", "c-massive-march", "c-moderation", "c-neon-driftway",
  "c-news", "c-nightrail", "c-predictions", "c-profile-modules", "c-rideshare",
  "c-rmh-capital", "c-rmh-pmc", "c-rmhbox", "c-rmhcalculator", "c-rmhcode",
  "c-rmhcoins", "c-rmhmusic", "c-rmhstudy", "c-rmhtech", "c-rmhtube",
  "c-rmhtype", "c-rmhvibe", "c-roadmap", "c-saves", "c-signal-forge",
  "c-status", "c-studio", "c-synapse-storm", "c-temple-of-joy",
  "c-tournaments", "c-ui", "c-user-builds", "c-vega", "c-velum2099",
  "c-versecraft", "c-void-breaker", "c-wager", "c-wishlist",
  // Route namespaces.
  "r-altair", "r-discord", "r-forest-explorer", "r-kowloon-knockout",
  "r-pf2ecal",
  "r-rmhbox", "r-rmhcode", "r-secret", "r-slice-it", "r-sohumbum",
  "r-strategies", "r-studio",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/**
 * Namespaces fully translated for every locale. The remaining (game/experience)
 * namespaces are translated on demand; until then they are simply absent for a
 * newly-added locale and i18next falls back to English per key.
 */
export const CORE_NAMESPACES = [
  "common", "nav", "site", "pages", "shared", "feed",
  "builds", "library", "rideshare", "groups", "user-builds", "v",
] as const satisfies readonly Namespace[];

/** Native language name shown in the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ar: "العربية",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  pt: "Português",
  ru: "Русский",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  it: "Italiano",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  tr: "Türkçe",
  ur: "اردو",
};

/** Human-readable target names passed to the AI translate helper. */
export const TRANSLATE_TARGETS: Record<Exclude<Locale, "en">, string> = {
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese (Brazilian)",
  ru: "Russian",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  id: "Indonesian",
  vi: "Vietnamese",
  tr: "Turkish",
  ur: "Urdu",
};

/**
 * Maps a UI locale to the exact language name accepted by the post/comment
 * translate API (ALLOWED_LANGS in app/routes/api/.../translate.ts). Used by the
 * "Translate" button so user-generated content is translated into the currently
 * selected site language.
 */
export const LOCALE_TO_LANGUAGE_NAME: Record<Locale, string> = {
  en: "English",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  ru: "Russian",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  id: "Indonesian",
  vi: "Vietnamese",
  tr: "Turkish",
  ur: "Urdu",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function buildInitOptions(
  locale: Locale,
  resources: Record<string, any>,
): InitOptions {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    ns: [...NAMESPACES],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
    returnNull: false,
  };
}
