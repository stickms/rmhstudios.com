import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { buildInitOptions, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { loadEnResources, LOCALE_LOADERS, type LocaleBundle } from '@/lib/i18n/resources';
import { localeCoreResources } from '@/lib/i18n/resources.server';

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
  // No English catalog, and only the CORE namespaces of another language (perf
  // audit §4.1). English renders from each call's defaultValue — exactly what
  // the client's first render uses, since the client bundles no English catalog
  // either — so hydration matches by construction; a non-en locale's core
  // namespaces are the same payload the root loader hands the client. The
  // client backfills the rest off the critical path (ensureClientLocale).
  const resources: Record<string, LocaleBundle> = {};
  if (locale !== DEFAULT_LOCALE) resources[locale] = localeCoreResources(locale);
  instance.use(initReactI18next).init(buildInitOptions(locale, resources));
  serverInstances.set(locale, instance);
  return instance;
}

/** Singleton client instance, initialized once. */
export const clientI18n: i18n = i18next.createInstance();
let clientReady = false;
let enBackfilled = false;

/**
 * Pull the English catalog in from its own chunk and register every namespace
 * not already present. The entry ships no catalog at all, so first paint stays
 * lean; every en key resolves synchronously from its defaultValue in the
 * meantime (held equal to the catalog by i18n-default-drift.test.ts), and this
 * makes the catalog available shortly after — off the critical path — as the
 * fallback other locales read. Idempotent.
 */
async function backfillEn(): Promise<void> {
  if (enBackfilled) return;
  enBackfilled = true;
  try {
    const full = await loadEnResources();
    for (const [ns, data] of Object.entries(full)) {
      if (!clientI18n.hasResourceBundle(DEFAULT_LOCALE, ns)) {
        clientI18n.addResourceBundle(DEFAULT_LOCALE, ns, data, true, true);
      }
    }
  } catch {
    // Left to a later locale switch to retry; per-call defaultValues keep the
    // UI correct regardless.
    enBackfilled = false;
  }
}

/**
 * Run `work` once the page has loaded and the main thread is idle.
 *
 * For the English backfill above. Its chunk is the whole catalog, and it used to be requested the moment the client i18n instance
 * initialised — i.e. in the middle of hydration, competing for the network
 * with the route's own JS on a slow connection and then re-rendering every
 * consumer of the namespaces it added. Nothing on screen depends on it: every
 * English `t()` call carries its `defaultValue`, and those are held identical
 * to the catalog (lib/__tests__/i18n-default-drift.test.ts). So it waits for
 * `load` plus an idle period instead (perf audit 2026-10-08, Lighthouse).
 */
function afterLoadIdle(work: () => void): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const idle = () =>
    w.requestIdleCallback ? w.requestIdleCallback(work, { timeout: 3000 }) : window.setTimeout(work, 1500);
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

const localeRestBackfilled = new Set<Locale>();

/**
 * Pull the non-core namespaces of the ACTIVE non-en locale in from its chunk and
 * register any not already present (perf audit §4.1). Mirrors backfillEn: the
 * server only hands down the core locale namespaces for a lean first paint, and
 * this fills in the game/app catalogs shortly after, off the critical path.
 * Idempotent. Does NOT change the active language (already set), just adds
 * bundles — i18next re-renders consumers of the newly-added namespaces.
 */
async function backfillLocaleRest(locale: Locale): Promise<void> {
  if (localeRestBackfilled.has(locale)) return;
  localeRestBackfilled.add(locale);
  try {
    const full = await LOCALE_LOADERS[locale]();
    for (const [ns, data] of Object.entries(full)) {
      if (!clientI18n.hasResourceBundle(locale, ns)) {
        clientI18n.addResourceBundle(locale, ns, data, true, true);
      }
    }
  } catch {
    localeRestBackfilled.delete(locale);
  }
}

/**
 * Pull a language's chunk in (if not already present) and switch to it. en
 * renders from its defaults immediately and backfills; every other language
 * resolves to its own dynamically-imported chunk.
 */
async function loadAndSwitch(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE) void backfillEn();
  else if (!clientI18n.hasResourceBundle(locale, 'common')) {
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
 * en renders from defaultValues and backfills its catalog at idle. Switching to a not-yet-loaded language later
 * fetches its chunk via loadAndSwitch().
 */
export function ensureClientLocale(locale: Locale, initialResources?: LocaleBundle | null): i18n {
  if (!clientReady) {
    const resources: Record<string, LocaleBundle> = {};
    if (locale !== DEFAULT_LOCALE && initialResources) resources[locale] = initialResources;
    clientI18n.use(initReactI18next).init(buildInitOptions(locale, resources));
    clientReady = true;
    // Backfill the English catalog from its own chunk, after load and idle (see
    // afterLoadIdle) — so it is available without bloating the entry OR
    // competing with hydration for the network.
    afterLoadIdle(() => void backfillEn());
    if (locale !== DEFAULT_LOCALE) {
      // The server now hands down only the CORE locale namespaces (perf audit
      // §4.1). With a core payload present, backfill the rest of THIS language
      // off the critical path; without one (client-only render path), load the
      // whole locale chunk and switch.
      if (initialResources) void backfillLocaleRest(locale);
      else void loadAndSwitch(locale);
    }
  } else if (clientI18n.language !== locale) {
    void loadAndSwitch(locale);
  }
  return clientI18n;
}

export { DEFAULT_LOCALE };
