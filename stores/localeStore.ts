import { create } from "zustand";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { LOCALE_COOKIE } from "@/lib/i18n/resolve";
import { ensureClientLocale } from "@/lib/i18n/instances";
import { applyHtmlLangDir } from "@/lib/i18n/dom";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function writeLocaleCookie(locale: Locale, doc: { cookie: string } = document) {
  doc.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: DEFAULT_LOCALE,
  setLocale: (locale) => {
    if (typeof window !== "undefined") {
      writeLocaleCookie(locale);
      ensureClientLocale(locale);
      applyHtmlLangDir(locale, document.documentElement);
    }
    set({ locale });
  },
}));
