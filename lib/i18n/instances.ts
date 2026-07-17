import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { buildInitOptions, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { EN_CORE_RESOURCES, loadEnResources, LOCALE_LOADERS, type LocaleBundle } from "@/lib/i18n/resources";
import { localeResources } from "@/lib/i18n/resources.server";

/**
 * One initialized instance PER LOCALE, cached at module scope (perf audit §4.3).
 * Previously this created a fresh i18next instance and ran a 66-namespace init on
 * EVERY SSR render. That's safe to share instead: each instance's `lng` is fixed
 * (keyed by locale) and the server only ever *reads* (t()) — it never calls
 * changeLanguage — so there is no cross-request mutable state. The resource
 * bundles are the same static objects regardless of request. At most one instance
 * per active locale is ever built (≤32), versus one per request under load.
 */
const serverInstances = new Map<Locale, i18n>();

export function getServerI18n(locale: Locale): i18n {
  const existing = serverInstances.get(locale);
  if (existing) return existing;
  const instance = i18next.createInstance();
  const resources: Record<string, LocaleBundle> = { [DEFAULT_LOCALE]: localeResources(DEFAULT_LOCALE) };
  if (locale !== DEFAULT_LOCALE) resources[locale] = localeResources(locale);
  instance.use(initReactI18next).init(buildInitOptions(locale, resources));
  serverInstances.set(locale, instance);
  return instance;
}

/** Singleton client instance, initialized once. */
export const clientI18n: i18n = i18next.createInstance();
let clientReady = false;
let enRestBackfilled = false;

/**
 * Pull the non-core English namespaces (game/app catalogs) in from their own
 * chunk and register any not already present. The entry only ships the core en
 * namespaces (resources.en-core.ts) so first paint stays lean; every en key
 * still resolves synchronously via defaultValue in the meantime, and this makes
 * the full catalog available shortly after — off the critical path. Idempotent.
 */
async function backfillEnRest(): Promise<void> {
  if (enRestBackfilled) return;
  enRestBackfilled = true;
  try {
    const full = await loadEnResources();
    for (const [ns, data] of Object.entries(full)) {
      if (!clientI18n.hasResourceBundle(DEFAULT_LOCALE, ns)) {
        clientI18n.addResourceBundle(DEFAULT_LOCALE, ns, data, true, true);
      }
    }
  } catch {
    // Left to a later locale switch (LOCALE_LOADERS.en) to retry; core keys and
    // per-call defaultValues keep the UI correct regardless.
    enRestBackfilled = false;
  }
}

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
    const resources: Record<string, LocaleBundle> = { [DEFAULT_LOCALE]: EN_CORE_RESOURCES };
    if (locale !== DEFAULT_LOCALE && initialResources) resources[locale] = initialResources;
    clientI18n.use(initReactI18next).init(buildInitOptions(locale, resources));
    clientReady = true;
    // Backfill the non-core en namespaces from their own chunk (off the critical
    // path) so the full English catalog is available without bloating the entry.
    void backfillEnRest();
    // Active non-en locale without server-provided resources (e.g. a client-only
    // render path): fetch its chunk and switch once it's in.
    if (locale !== DEFAULT_LOCALE && !initialResources) void loadAndSwitch(locale);
  } else if (clientI18n.language !== locale) {
    void loadAndSwitch(locale);
  }
  return clientI18n;
}

export { DEFAULT_LOCALE };
