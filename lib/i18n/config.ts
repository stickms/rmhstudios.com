import type { InitOptions } from "i18next";

export const LOCALES = [
  // Tier 1 — most widely spoken (fully translated).
  "en", "zh", "ar", "hi", "es", "fr", "pt", "ru",
  "de", "ja", "ko", "it", "id", "vi", "tr", "ur",
  // Tier 2 — next most widely spoken (translated on demand; English fallback
  // until the catalog files are generated).
  "bn", "pa", "ta", "te", "mr", "fa", "th", "pl",
  "uk", "nl", "fil", "ms", "ro", "el", "cs", "sv",
] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Right-to-left locales. dirFor() and the no-flash <html dir> guard read this,
 * so add a locale here (instead of a hardcoded `=== "ar"`) to make the whole
 * app render it RTL.
 */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar", "ur", "fa"]);

export const NAMESPACES = ["common", "nav", "admin", "builds", "feed", "groups", "library", "rideshare", "shared", "site", "user-builds", "v", "c-admin", "c-altair", "c-blog", "c-builds", "c-cursed-logic", "c-daily-puzzles", "c-doctrine", "c-dream-rift", "c-economy", "c-forest-explorer", "c-game", "c-house-always-wins", "c-kowloon-knockout", "c-laundry-sort", "c-library", "c-lights-out", "c-lockdown", "c-moderation", "c-neon-driftway", "c-news", "c-rideshare", "c-rmh-capital", "c-rmh-pmc", "c-rmhbox", "c-rmhcode", "c-rmhcoins", "c-rmhmusic", "c-rmhstudy", "c-rmhtech", "c-rmhtube", "c-rmhtype", "c-rmhvibe", "c-roadmap", "c-signal-forge", "c-studio", "c-synapse-storm", "c-temple-of-joy", "c-ui", "c-user-builds", "c-vega", "c-velum2099", "c-versecraft", "c-void-breaker", "pages", "r-altair", "r-discord", "r-forest-explorer", "r-kowloon-knockout", "r-rmhbox", "r-rmhcode", "r-secret", "r-slice-it", "r-strategies", "r-studio"] as const;
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
  bn: "বাংলা",
  pa: "ਪੰਜਾਬੀ",
  ta: "தமிழ்",
  te: "తెలుగు",
  mr: "मराठी",
  fa: "فارسی",
  th: "ไทย",
  pl: "Polski",
  uk: "Українська",
  nl: "Nederlands",
  fil: "Filipino",
  ms: "Bahasa Melayu",
  ro: "Română",
  el: "Ελληνικά",
  cs: "Čeština",
  sv: "Svenska",
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
  bn: "Bengali",
  pa: "Punjabi (Gurmukhi)",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  fa: "Persian (Farsi)",
  th: "Thai",
  pl: "Polish",
  uk: "Ukrainian",
  nl: "Dutch",
  fil: "Filipino",
  ms: "Malay",
  ro: "Romanian",
  el: "Greek",
  cs: "Czech",
  sv: "Swedish",
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
  bn: "Bengali",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  fa: "Persian",
  th: "Thai",
  pl: "Polish",
  uk: "Ukrainian",
  nl: "Dutch",
  fil: "Filipino",
  ms: "Malay",
  ro: "Romanian",
  el: "Greek",
  cs: "Czech",
  sv: "Swedish",
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
