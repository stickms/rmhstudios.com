// Server-only access to every language's i18n resources.
//
// This module is stubbed out of the CLIENT bundle by the stubServerFiles() Vite
// plugin (its name matches *.server.ts), so statically importing all three
// per-language bundles here does NOT pull zh/ar into the client — the server
// build gets them (size is irrelevant there), the client never sees this file.
// On the client, languages are loaded per-chunk via resources.ts's LOCALE_LOADERS.
import type { Locale } from "@/lib/i18n/config";
import type { LocaleBundle } from "@/lib/i18n/resources";
import en from "@/lib/i18n/resources.en";
import zh from "@/lib/i18n/resources.zh";
import ar from "@/lib/i18n/resources.ar";

const ALL: Record<Locale, LocaleBundle> = {
  en: en as LocaleBundle,
  zh: zh as LocaleBundle,
  ar: ar as LocaleBundle,
};

/** The full resource bundle (all namespaces) for one language. Server use only. */
export function localeResources(locale: Locale): LocaleBundle {
  return ALL[locale] ?? ALL.en;
}
