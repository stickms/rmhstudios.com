import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { buildInitOptions, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { EN_RESOURCES, LOCALE_LOADERS, type LocaleBundle } from "@/lib/i18n/resources";
import { localeResources } from "@/lib/i18n/resources.server";

/**
 * Fresh instance per server request — never share a mutable lng across requests.
 * The server can read every language synchronously (resources.server.ts), so it
 * always has the active language plus the en fallback available for SSR.
 */
export function getServerI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();
  const resources: Record<string, LocaleBundle> = { [DEFAULT_LOCALE]: localeResources(DEFAULT_LOCALE) };
  if (locale !== DEFAULT_LOCALE) resources[locale] = localeResources(locale);
  instance.use(initReactI18next).init(buildInitOptions(locale, resources));
  return instance;
}

/** Singleton client instance, initialized once. */
export const clientI18n: i18n = i18next.createInstance();
let clientReady = false;

/**
 * Pull a language's chunk in (if not already present) and switch to it. en is
 * always bundled; zh/ar resolve to their own dynamically-imported chunks.
 */
async function loadAndSwitch(locale: Locale): Promise<void> {
  if (locale !== DEFAULT_LOCALE && !clientI18n.hasResourceBundle(locale, "common")) {
    const bundle = await LOCALE_LOADERS[locale]();
    for (const [ns, data] of Object.entries(bundle)) {
      clientI18n.addResourceBundle(locale, ns, data, true, true);
    }
  }
  if (clientI18n.language !== locale) await clientI18n.changeLanguage(locale);
}

/**
 * Initialize (once) or switch the client instance to `locale`.
 *
 * `initialResources` is the active language's bundle handed down from the server
 * for the very first render (the root loader serializes it for non-en locales so
 * hydration is synchronous and matches the SSR markup). For en it's omitted —
 * en is always statically bundled. Switching to a not-yet-loaded language later
 * fetches its chunk via loadAndSwitch().
 */
export function ensureClientLocale(locale: Locale, initialResources?: LocaleBundle | null): i18n {
  if (!clientReady) {
    const resources: Record<string, LocaleBundle> = { [DEFAULT_LOCALE]: EN_RESOURCES };
    if (locale !== DEFAULT_LOCALE && initialResources) resources[locale] = initialResources;
    clientI18n.use(initReactI18next).init(buildInitOptions(locale, resources));
    clientReady = true;
    // Active non-en locale without server-provided resources (e.g. a client-only
    // render path): fetch its chunk and switch once it's in.
    if (locale !== DEFAULT_LOCALE && !initialResources) void loadAndSwitch(locale);
  } else if (clientI18n.language !== locale) {
    void loadAndSwitch(locale);
  }
  return clientI18n;
}

export { DEFAULT_LOCALE };
