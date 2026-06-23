import { type ReactNode, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import type { Locale } from "@/lib/i18n/config";
import { getServerI18n, ensureClientLocale } from "@/lib/i18n/instances";

/**
 * Provides an i18next instance to the tree. On the server a fresh per-request
 * instance is created (useMemo runs once per render = per request); on the
 * client the singleton is reused and switched to `locale`.
 */
export function AppI18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const instance = useMemo(
    () => (typeof window === "undefined" ? getServerI18n(locale) : ensureClientLocale(locale)),
    [locale],
  );
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
