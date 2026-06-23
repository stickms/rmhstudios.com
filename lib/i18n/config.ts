import type { InitOptions } from "i18next";

export const LOCALES = ["en", "zh", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const NAMESPACES = ["common", "nav"] as const;
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
