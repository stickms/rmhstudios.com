import i18next, { type BackendModule, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { buildInitOptions, CORE_NAMESPACES, DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config';
import { loadNamespace, loadNamespaces, type LocaleBundle } from '@/lib/i18n/resources';
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
  // client loads every other namespace on demand (clientI18nBackend).
  const resources: Record<string, LocaleBundle> = {};
  if (locale !== DEFAULT_LOCALE) resources[locale] = localeCoreResources(locale);
  instance.use(initReactI18next).init(buildInitOptions(locale, resources));
  serverInstances.set(locale, instance);
  return instance;
}

/** Singleton client instance, initialized once. */
export const clientI18n: i18n = i18next.createInstance();
let clientReady = false;

/**
 * Run `work` once the page has loaded and the main thread is idle.
 *
 * For English namespace loads (below). English renders from each `t()` call's
 * `defaultValue`, held identical to the catalog by
 * lib/__tests__/i18n-default-drift.test.ts, so nothing on screen depends on the
 * catalog arriving — it only has to be there for computed keys and as the
 * fallback. It therefore waits for `load` plus an idle period instead of
 * competing with hydration for the network (perf audit 2026-10-08). Outside a
 * browser there is nothing to wait for and it runs immediately.
 */
function afterLoadIdle(work: () => void): void {
  if (typeof window === 'undefined') return work();
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const idle = () =>
    w.requestIdleCallback ? w.requestIdleCallback(work, { timeout: 3000 }) : window.setTimeout(work, 1500);
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

/**
 * The client's i18next backend: i18next asks for a (language, namespace) pair
 * and gets exactly that one JSON chunk (resources.ts#loadNamespace) — never a
 * whole locale and never the whole English catalog (perf audit B6).
 *
 * Who asks, and when:
 *  - `useTranslation(ns)` calls `loadNamespaces(ns)` for a namespace that is not
 *    loaded yet (the instance runs with `useSuspense: false`, so the component
 *    renders meanwhile — `t()` returns each call's `defaultValue` — and
 *    re-renders when the namespace lands). i18next then reads that namespace for
 *    the active language AND for the fallback language (`en`).
 *  - a language switch reads every namespace already in use for the new language.
 *  - the active non-en language's CORE namespaces are never read here: they
 *    arrive synchronously as bundled resources from the root loader
 *    (`partialBundledLanguages` keeps those and still allows the rest to load).
 *
 * An unknown language or a namespace the locale has no file for resolves to an
 * empty bundle (untranslated -> the call's `defaultValue`).
 */
export const clientI18nBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    if (!isLocale(language)) return callback(null, {});
    const run = () =>
      loadNamespace(language, namespace).then(
        (data) => callback(null, (data ?? {}) as Record<string, unknown>),
        (error) => callback(error instanceof Error ? error : new Error(String(error)), null),
      );
    // English while English is the active language is pure catalog backfill (the
    // page already shows the same text from defaultValues): do it off the
    // critical path. As the fallback of another language, or while switching
    // languages, something waits on it — load at once.
    if (language === DEFAULT_LOCALE && clientI18n.language === DEFAULT_LOCALE && switchesInFlight === 0) {
      afterLoadIdle(() => void run());
    } else {
      void run();
    }
  },
};

const requestedNamespaces = new Set<string>();

/**
 * `t('key', { ns: 'other' })` / `t('other:key')` read a namespace the calling
 * component never declared to `useTranslation`, so nothing would ever load it.
 * i18next reports every key it had to answer from a `defaultValue` to
 * `missingKeyHandler` (that is all `saveMissing` is used for here — nothing is
 * saved anywhere); on the first miss in a namespace that is not loaded yet, load
 * that namespace. The hook bindings re-render consumers when it lands
 * (`bindI18n: 'languageChanged loaded'`). Deferred a microtask: this fires
 * during render.
 */
function requestNamespace(namespace: string): void {
  if (requestedNamespaces.has(namespace)) return;
  if (!clientI18n.isInitialized || clientI18n.hasLoadedNamespace(namespace)) return;
  requestedNamespaces.add(namespace);
  queueMicrotask(() => {
    void clientI18n.loadNamespaces(namespace).catch(() => requestedNamespaces.delete(namespace));
  });
}

/**
 * The latest requested switch. A switch A→B made while A's namespaces are still
 * in flight must not be undone when they land: only the newest request may call
 * `changeLanguage`.
 */
let switchGen = 0;
/** Switches currently running: while one is, English reads are awaited by it. */
let switchesInFlight = 0;

/**
 * Switch to a language, loading only the namespaces that are in use. The
 * target's namespaces already requested on this instance (`options.ns`, grown by
 * every `useTranslation(ns)`) plus the core set are fetched per namespace and
 * registered, then the language flips — so the switch never repaints half in
 * the old language and never downloads a namespace nothing rendered. en needs
 * no pre-load: it renders from defaults and loads per namespace through the
 * backend as usual. A failed load keeps the current language (and is retried by
 * the next switch) instead of surfacing as an unhandled rejection.
 */
async function loadAndSwitch(locale: Locale, gen: number): Promise<void> {
  switchesInFlight++;
  try {
    if (locale !== DEFAULT_LOCALE) {
      const inUse = (clientI18n.options.ns as string[] | undefined) ?? [];
      const wanted = [...new Set<string>([...CORE_NAMESPACES, ...inUse])];
      const missing = wanted.filter((ns) => !clientI18n.hasResourceBundle(locale, ns));
      const bundle = await loadNamespaces(locale, missing);
      // Registering a superseded locale's bundles is harmless (cached for a
      // later switch); switching to it is not.
      for (const [ns, data] of Object.entries(bundle)) {
        clientI18n.addResourceBundle(locale, ns, data, true, true);
      }
    }
    if (gen !== switchGen) return;
    if (clientI18n.language !== locale) await clientI18n.changeLanguage(locale);
  } catch (error) {
    console.warn(`[i18n] Could not load locale "${locale}"`, error);
  } finally {
    switchesInFlight--;
  }
}

/**
 * Initialize (once) or switch the client instance to `locale`.
 *
 * `initialResources` is the active language's CORE namespaces handed down from
 * the server for the very first render (the root loader serializes them for
 * non-en locales so hydration is synchronous and matches the SSR markup). For en
 * it's omitted — en renders from defaultValues. Every other namespace, of any
 * language, loads on demand through {@link clientI18nBackend}.
 */
export function ensureClientLocale(locale: Locale, initialResources?: LocaleBundle | null): i18n {
  if (!clientReady) {
    const resources: Record<string, LocaleBundle> = {};
    if (locale !== DEFAULT_LOCALE && initialResources) resources[locale] = initialResources;
    // Without the server's core payload (client-only render path) start in
    // English and switch once the locale's namespaces have landed.
    const startLocale = locale === DEFAULT_LOCALE || initialResources ? locale : DEFAULT_LOCALE;
    clientI18n
      .use(clientI18nBackend)
      .use(initReactI18next)
      .init({
        ...buildInitOptions(startLocale, resources),
        // Load nothing at init: `ns` grows as components ask (useTranslation ->
        // loadNamespaces). The default is every registered namespace, which with
        // a backend would fetch all of them.
        ns: [],
        // The core bundle above is supplied inline, yet other namespaces still
        // load through the backend.
        partialBundledLanguages: true,
        saveMissing: true,
        missingKeyHandler: (_languages, namespace) => requestNamespace(namespace),
      });
    clientReady = true;
    if (startLocale !== locale) void loadAndSwitch(locale, ++switchGen);
  } else {
    // Every request supersedes any switch still in flight — including a switch
    // back to the language already active (A→B→A while B's namespaces load).
    const gen = ++switchGen;
    if (clientI18n.language !== locale) void loadAndSwitch(locale, gen);
  }
  return clientI18n;
}

export { DEFAULT_LOCALE };
