import { type ReactNode, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import type { Locale } from "@/lib/i18n/config";
import type { LocaleBundle } from "@/lib/i18n/resources";
import { getServerI18n, ensureClientLocale } from "@/lib/i18n/instances";

/**
 * Provides an i18next instance to the tree. On the server a fresh per-request
 * instance is created (useMemo runs once per render = per request); on the
 * client the singleton is reused and switched to `locale`.
 *
 * `resources` is the active language's bundle handed down from the server for the
 * first render (non-en only — en is always bundled), so the client initializes
 * synchronously with the same translations the server rendered and hydration
 * matches. Subsequent language switches load their chunk on demand.
 */
export function AppI18nProvider({
  locale,
  resources,
  children,
}: {
  locale: Locale;
  resources?: LocaleBundle | null;
  children: ReactNode;
}) {
  const instance = useMemo(
    () => (typeof window === "undefined" ? getServerI18n(locale) : ensureClientLocale(locale, resources)),
    [locale, resources],
  );
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
