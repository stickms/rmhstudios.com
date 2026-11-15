// Server-only access to each language's i18n resources — loaded LAZILY.
//
// This module is stubbed out of the CLIENT bundle by the stubServerFiles() Vite
// plugin (its name matches *.server.ts), so the dynamic per-locale imports below
// never reach the browser — on the client, languages load per-chunk via
// resources.ts's LOCALE_LOADERS.
//
// COLD-START: previously this file STATICALLY imported all 16 per-language
// bundles (each of which statically imports its ~66 namespace JSON files). Since
// __root.tsx imports this module on every render, that forced the entire
// translation catalog to be parsed into the heap the first
// time the SSR root module evaluated — a large, pure cold-boot cost paid even by
// English visitors who never use the other 15 languages.
//
// Now each locale's CORE namespaces are loaded on demand via dynamic imports (one
// chunk per namespace, reusing the same per-namespace loaders the client uses) and cached. The SSR entry
// (app/routes/__root.tsx `getInitialI18n`) awaits `preloadLocale(locale)` BEFORE
// render, so the *synchronous* getServerI18n → localeCoreResources path
// (lib/i18n/instances.ts) still reads a warm bundle. English needs nothing here:
// SSR renders it from each call's defaultValue (the client bundles no English
// catalog either), and getServerI18n only calls localeCoreResources for non-en
// locales.
import { CORE_NAMESPACES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { loadNamespaces, type LocaleBundle } from '@/lib/i18n/resources';

/** Per-locale bundle cache, populated on first preloadLocale()/access and kept
 *  for the life of the process (the bundles are immutable static objects). */
const cache = new Map<Locale, LocaleBundle>();
/** In-flight loads, so concurrent preloads of the same locale share one import. */
const inflight = new Map<Locale, Promise<LocaleBundle>>();

function loadLocale(locale: Locale): Promise<LocaleBundle> {
  const hit = cache.get(locale);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(locale);
  if (pending) return pending;
  // Only the CORE namespaces are ever read synchronously during SSR
  // (localeCoreResources), so only those namespace chunks are imported — not
  // the whole locale. The client loads the rest per namespace on demand.
  const p = loadNamespaces(locale, CORE_NAMESPACES)
    .then((bundle) => {
      cache.set(locale, bundle);
      inflight.delete(locale);
      return bundle;
    })
    .catch((err) => {
      inflight.delete(locale);
      throw err;
    });
  inflight.set(locale, p);
  return p;
}

/**
 * Load a language's core namespaces (their own async chunks) and cache them, so the
 * synchronous {@link localeResources}/{@link localeCoreResources} accessors below
 * can serve it during render. Call this in an async context (the root loader)
 * BEFORE the synchronous SSR i18n init runs. Idempotent; no-op once cached.
 */
export async function preloadLocale(locale: Locale): Promise<void> {
  await loadLocale(locale);
}

/** Cached bundle for `locale`, else the cached default, else empty. Never throws
 *  — a not-yet-preloaded locale degrades to English `defaultValue` resolution. */
function cachedBundle(locale: Locale): LocaleBundle {
  return cache.get(locale) ?? cache.get(DEFAULT_LOCALE) ?? {};
}

/** The cached bundle for one language — the core namespaces {@link preloadLocale}
 *  warmed. Server use only; call {@link preloadLocale} first. */
export function localeResources(locale: Locale): LocaleBundle {
  return cachedBundle(locale);
}

/**
 * Only the CORE namespaces (shell + feed) for one language. This is what SSR
 * renders with and what the root loader dehydrates into the HTML — instead of the
 * full ~66-namespace catalog (~250-300 KB per non-en page view). Non-core
 * (game/app) namespaces resolve to their English `defaultValue` until the client
 * loads them per namespace on demand (see
 * lib/i18n/instances.ts). Because BOTH the server render and the client hydrate
 * from this same core set, there is no hydration mismatch. Returns the cached
 * bundle — call {@link preloadLocale} first (the root loader does).
 */
export function localeCoreResources(locale: Locale): LocaleBundle {
  const full = cachedBundle(locale);
  const core: LocaleBundle = {};
  for (const ns of CORE_NAMESPACES) {
    const v = (full as Record<string, unknown>)[ns];
    if (v !== undefined) core[ns] = v as LocaleBundle[string];
  }
  return core;
}
