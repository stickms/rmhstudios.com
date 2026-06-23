import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { buildInitOptions, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { RESOURCES } from "@/lib/i18n/resources";

/** Fresh instance per server request — never share mutable lng across requests. */
export function getServerI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init(buildInitOptions(locale, RESOURCES));
  return instance;
}

/** Singleton client instance, initialized once. */
export const clientI18n: i18n = i18next.createInstance();
let clientReady = false;

export function ensureClientLocale(locale: Locale): i18n {
  if (!clientReady) {
    clientI18n.use(initReactI18next).init(buildInitOptions(locale, RESOURCES));
    clientReady = true;
  } else if (clientI18n.language !== locale) {
    void clientI18n.changeLanguage(locale);
  }
  return clientI18n;
}

export { DEFAULT_LOCALE };
