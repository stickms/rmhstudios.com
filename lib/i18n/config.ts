import type { InitOptions } from "i18next";

export const LOCALES = ["en", "zh", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const NAMESPACES = ["common", "nav", "admin", "builds", "feed", "groups", "library", "research", "rideshare", "shared", "site", "user-builds", "v", "c-admin", "c-altair", "c-blog", "c-builds", "c-cursed-logic", "c-daily-puzzles", "c-doctrine", "c-dream-rift", "c-economy", "c-forest-explorer", "c-game", "c-house-always-wins", "c-kowloon-knockout", "c-laundry-sort", "c-library", "c-lights-out", "c-lockdown", "c-moderation", "c-neon-driftway", "c-news", "c-research", "c-rideshare", "c-rmh-capital", "c-rmh-eats", "c-rmh-jobs", "c-rmh-notes", "c-rmh-pmc", "c-rmh-weather", "c-rmhbox", "c-rmhcode", "c-rmhcoins", "c-rmhmusic", "c-rmhstudy", "c-rmhtech", "c-rmhtube", "c-rmhtype", "c-rmhvibe", "c-roadmap", "c-signal-forge", "c-studio", "c-synapse-storm", "c-temple-of-joy", "c-ui", "c-user-builds", "c-vega", "c-velum2099", "c-versecraft", "c-void-breaker", "pages", "r-altair", "r-discord", "r-forest-explorer", "r-kowloon-knockout", "r-rmhbox", "r-rmhcode", "r-secret", "r-slice-it", "r-strategies", "r-studio"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ar: "العربية",
};

/** Human-readable target names passed to the AI translate helper. */
export const TRANSLATE_TARGETS: Record<Exclude<Locale, "en">, string> = {
  zh: "Chinese (Simplified)",
  ar: "Arabic",
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
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
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
