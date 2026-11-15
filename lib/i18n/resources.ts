// Client-facing i18n resource loading — PER NAMESPACE.
//
// History: every locale used to be ONE chunk (`resources.<locale>.ts`) that
// statically imported all ~130 namespace JSONs, and every client (English
// included) backfilled the whole 1.3 MB English catalog at idle. A German
// visitor therefore downloaded every game's strings, and so did an English one.
//
// Now NO catalog is bundled and nothing loads a whole locale on the client:
//   - English renders from each `t()` call's `defaultValue`, on the server and on
//     the client's first render alike, so hydration matches by construction.
//     `lib/__tests__/i18n-default-drift.test.ts` holds every default equal to
//     `locales/en`, so a catalog arriving later changes nothing on screen.
//   - `resources.<locale>.ts` (generated) is only a MAP: namespace -> a dynamic
//     `import()` of that namespace's JSON. Vite emits one small chunk per JSON,
//     and the map itself is a few KB.
//   - The client i18next instance reads through `clientI18nBackend`
//     (lib/i18n/instances.ts), which calls {@link loadNamespace} for exactly the
//     (language, namespace) pairs i18next asks for — i.e. the namespaces that
//     `useTranslation(ns)` is rendering, plus `en` as the fallback for those.
//   - SSR (resources.server.ts, stubbed out of the client bundle) uses the same
//     loaders to warm only the CORE namespaces of the active non-en locale,
//     which the root loader also hands the client for a synchronous hydration.
//   - {@link LOCALE_LOADERS} (a whole locale at once) remains for server-side
//     tools that need the full catalog (lib/delight/translate.server.ts).
import type { Locale } from '@/lib/i18n/config';

/** A JSON-serializable value — keeps LocaleBundle valid as TanStack loader/server-fn
 *  output (a bare `Record<string, unknown>` is rejected by its serializer checks). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A resource bundle for one language: { [namespace]: translations }. */
export type LocaleBundle = Record<string, JsonValue>;

/** One locale's namespace map, as emitted by scripts/gen-i18n-resources.ts. */
export type NamespaceLoaders = Record<string, () => Promise<{ default: unknown }>>;

/**
 * Lazy loader for each locale's namespace MAP (resources.<locale>.ts). Loading a
 * map is cheap — it only holds `import()` thunks; no JSON is fetched until a
 * thunk is called.
 */
export const LOCALE_NAMESPACE_LOADERS: Record<Locale, () => Promise<NamespaceLoaders>> = {
  en: () => import('@/lib/i18n/resources.en').then((m) => m.default as NamespaceLoaders),
  zh: () => import('@/lib/i18n/resources.zh').then((m) => m.default as NamespaceLoaders),
  ar: () => import('@/lib/i18n/resources.ar').then((m) => m.default as NamespaceLoaders),
  hi: () => import('@/lib/i18n/resources.hi').then((m) => m.default as NamespaceLoaders),
  es: () => import('@/lib/i18n/resources.es').then((m) => m.default as NamespaceLoaders),
  fr: () => import('@/lib/i18n/resources.fr').then((m) => m.default as NamespaceLoaders),
  pt: () => import('@/lib/i18n/resources.pt').then((m) => m.default as NamespaceLoaders),
  ru: () => import('@/lib/i18n/resources.ru').then((m) => m.default as NamespaceLoaders),
  de: () => import('@/lib/i18n/resources.de').then((m) => m.default as NamespaceLoaders),
  ja: () => import('@/lib/i18n/resources.ja').then((m) => m.default as NamespaceLoaders),
  ko: () => import('@/lib/i18n/resources.ko').then((m) => m.default as NamespaceLoaders),
  it: () => import('@/lib/i18n/resources.it').then((m) => m.default as NamespaceLoaders),
  id: () => import('@/lib/i18n/resources.id').then((m) => m.default as NamespaceLoaders),
  vi: () => import('@/lib/i18n/resources.vi').then((m) => m.default as NamespaceLoaders),
  tr: () => import('@/lib/i18n/resources.tr').then((m) => m.default as NamespaceLoaders),
  ur: () => import('@/lib/i18n/resources.ur').then((m) => m.default as NamespaceLoaders),
};

/** One in-flight/settled import of each locale's map, so N namespace loads in
 *  the same tick share a single `import()` (and a failed one is retried). */
const mapCache = new Map<Locale, Promise<NamespaceLoaders>>();

function namespaceMap(locale: Locale): Promise<NamespaceLoaders> | null {
  const loader = LOCALE_NAMESPACE_LOADERS[locale];
  if (!loader) return null;
  let p = mapCache.get(locale);
  if (!p) {
    p = loader();
    mapCache.set(locale, p);
    p.catch(() => mapCache.delete(locale));
  }
  return p;
}

/**
 * Load ONE namespace of one locale (its own JSON chunk). Resolves `null` when
 * that locale has no such namespace (untranslated → falls back to English per
 * key), and rejects only if the chunk itself fails to load.
 */
export async function loadNamespace(locale: Locale, ns: string): Promise<LocaleBundle[string] | null> {
  const pending = namespaceMap(locale);
  if (!pending) return null;
  const map = await pending;
  const load = Object.prototype.hasOwnProperty.call(map, ns) ? map[ns] : undefined;
  if (!load) return null;
  return (await load()).default as LocaleBundle[string];
}

/** Load several namespaces of one locale in parallel into a bundle. */
export async function loadNamespaces(locale: Locale, namespaces: readonly string[]): Promise<LocaleBundle> {
  const out: LocaleBundle = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      const data = await loadNamespace(locale, ns);
      if (data !== null) out[ns] = data;
    }),
  );
  return out;
}

/**
 * Load a locale's ENTIRE catalog (every namespace it has). Server-side tools
 * only — the client never calls this; it loads per namespace via
 * {@link loadNamespace}.
 */
export const LOCALE_LOADERS: Record<Locale, () => Promise<LocaleBundle>> = Object.fromEntries(
  (Object.keys(LOCALE_NAMESPACE_LOADERS) as Locale[]).map((locale) => [
    locale,
    async () => {
      const map = await (namespaceMap(locale) as Promise<NamespaceLoaders>);
      return loadNamespaces(locale, Object.keys(map));
    },
  ]),
) as Record<Locale, () => Promise<LocaleBundle>>;
