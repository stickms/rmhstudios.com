/**
 * The island document (redesign audit B1): the bare HTML page that serves a
 * game or app built OUTSIDE the site's route graph (`vite.islands.config.ts`).
 *
 * A route whose feature is an island keeps its URL and its file under
 * `app/routes/`, but that file is a GET handler returning this document instead
 * of a component the router renders:
 *
 *   export const Route = createFileRoute('/void-breaker')({
 *     beforeLoad: islandBeforeLoad,
 *     server: { handlers: { GET: ({ request }) => renderIslandDocument('void-breaker', request) } },
 *   });
 *
 * Everything else comes from the feature manifest (`features/<id>/feature.ts`):
 * the head is the catalog's (`gameRouteHead` / `appRouteHead`, by `kind`; a page
 * the catalog does not describe passes its own `heads`) and the
 * first render's catalogs are the manifest's `namespaces`. The route module
 * imports only this `.server` module, which the client build stubs, so the
 * island's head costs the site's entry nothing.
 *
 * What the document carries, and why each piece:
 *  - the site-wide head (`lib/root-head.ts`, the same defaults `__root.tsx` emits)
 *    under the route's own `head()`, merged the way the router merges them
 *    (`./head.ts`), so SEO, canonical and JSON-LD are what they were;
 *  - the generated pre-paint script (`lib/prepaint/`) — platform flags, the
 *    app-route ground, jelly motion and access settings — byte-identical to the
 *    site's, so its CSP hash still covers it;
 *  - the island's own stylesheet, its entry module and a modulepreload for each
 *    static chunk (from the island build's manifest, inlined at build time);
 *  - a data block (`components/island/island-data.ts`): the session the server
 *    resolved from the cookie, the catalog title, the locale's catalogs for the
 *    island's namespaces — what the site's root loader would have handed down;
 *  - a loading frame inside `#island-root`, replaced when the island mounts.
 *
 * Not carried: the router, its dehydration payload, the radial shell, the site
 * `Providers`, the site stylesheet — the whole point.
 */
import { getRequestSession } from '@/lib/auth-session.server';
import { mintRequestCspNonce } from '@/lib/csp/nonce.server';
import type { FeatureManifest } from '@/lib/core/feature';
import { matchCatalogRoute } from '@/lib/games/route-match';
import { DEFAULT_LOCALE, dirFor, type Locale } from '@/lib/i18n/config';
import { loadNamespaces, type LocaleBundle } from '@/lib/i18n/resources';
import { parseLocaleCookie, resolveLocale } from '@/lib/i18n/resolve';
import { PREPAINT_BODY_SCRIPT, prepaintHeadScripts } from '@/lib/prepaint/config';
import { ROOT_LINKS, ROOT_META } from '@/lib/root-head';
import { appRouteHead, gameRouteHead } from '@/lib/seo-catalog';
import { jsonLdScript, organizationSchema, websiteSchema } from '@/lib/schema';
import {
  ISLAND_DATA_ID,
  ISLAND_ROOT_ID,
  serializeIslandData,
  type IslandData,
} from '@/components/island/island-data';
import type { CachedSessionUser } from '@/components/session/session-context';
import { attrs, escapeHtml, renderHead, type HeadInput } from './head';

/** One entry of Vite's build manifest (`dist-islands/.vite/manifest.json`). */
interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
  assets?: string[];
}
type Manifest = Record<string, ManifestChunk>;

// Inlined at BUILD time: `pnpm build` runs the island build first, so this glob
// finds the manifest and Vite bakes it into the server bundle. In `vite dev`, or
// before the islands are built, it matches nothing and the document points at the
// source entry instead (the dev server compiles it).
const MANIFESTS = import.meta.glob<Manifest>('/dist-islands/.vite/manifest.json', {
  eager: true,
  import: 'default',
});
const BUILD_MANIFEST: Manifest | null = Object.values(MANIFESTS)[0] ?? null;

// Every feature manifest, keyed by id. Server-only (they import zod).
const FEATURES = new Map(
  Object.values(
    import.meta.glob<FeatureManifest>('/features/*/feature.ts', { eager: true, import: 'default' }),
  ).map((m) => [m.id, m]),
);

/**
 * Namespaces shared code inside an island renders on its first screen, on top of
 * the manifest's own: `shared` (the loading frame, the error boundary, the save
 * dialog). Anything rarer (the playtime card-drop toast's `games-hub`) loads on
 * demand, as on the site.
 */
const SHARED_NAMESPACES = ['shared'];
const ISLANDS_BASE = '/islands/';

/** Same bound as the root loader's session wait (`__root.tsx` SESSION_LOADER_TIMEOUT_MS). */
const SESSION_TIMEOUT_MS = 800;

/** The tags that load an island's code: its CSS, its static chunks' modulepreloads and its entry. */
export function islandAssetTags(
  id: string,
  manifest: Manifest | null,
  dev: boolean,
  nonce?: string,
): string {
  const entryKey = `features/${id}/island.tsx`;
  // The policy carries 'strict-dynamic', under which 'self' no longer admits a
  // script: every script (and modulepreload) carries the request's nonce, as the
  // router's own tags do.
  const script = (src: string) => `<script${attrs({ type: 'module', src, nonce })}></script>`;
  if (dev || !manifest) {
    // Dev: the site's Vite server compiles the source entry (and injects its CSS
    // from JS). The React Refresh preamble must run before any component module —
    // the same code TanStack Start's own dev client entry runs (start-plugin-core,
    // getReactRefreshPreambleCode); module scripts execute in document order.
    const preamble =
      'import { injectIntoGlobalHook } from "/@react-refresh";injectIntoGlobalHook(window);' +
      'window.$RefreshReg$ = () => {};window.$RefreshSig$ = () => (type) => type;' +
      'window.__vite_plugin_react_preamble_installed__ = true;';
    return [
      script('/@vite/client'),
      `<script${attrs({ type: 'module', nonce })}>${preamble}</script>`,
      script(`/${entryKey}`),
    ].join('');
  }
  const entry = manifest[entryKey];
  if (!entry) throw new Error(`island "${id}" is not in the island build manifest (${entryKey})`);
  const css = new Set<string>();
  const preloads = new Set<string>();
  const fonts: string[] = [];
  const visit = (key: string, isRoot: boolean) => {
    const chunk = manifest[key];
    if (!chunk) return;
    if (!isRoot) {
      if (preloads.has(chunk.file)) return;
      preloads.add(chunk.file);
    }
    for (const c of chunk.css ?? []) css.add(c);
    for (const imp of chunk.imports ?? []) visit(imp, false);
  };
  visit(entryKey, true);
  // The Latin subset of Geist, which renders nearly every glyph on the page — the
  // same preload `__root.tsx` gives the site's copy of the face (crossorigin is
  // required even same-origin: fonts are fetched in CORS mode).
  const latin = (entry.assets ?? []).find((a) =>
    /\/geist-latin-wght-normal-[\w-]+\.woff2$/.test(a),
  );
  if (latin) {
    fonts.push(
      `<link${attrs({ rel: 'preload', as: 'font', type: 'font/woff2', href: ISLANDS_BASE + latin, crossOrigin: 'anonymous' })}>`,
    );
  }
  return [
    ...fonts,
    ...[...css].map((c) => `<link rel="stylesheet" href="${ISLANDS_BASE}${c}">`),
    ...[...preloads].map(
      (p) => `<link${attrs({ rel: 'modulepreload', href: ISLANDS_BASE + p, nonce })}>`,
    ),
    script(ISLANDS_BASE + entry.file),
  ].join('');
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function resolveUser(): Promise<{ user: CachedSessionUser | null; resolved: boolean }> {
  const session = await withTimeout(
    getRequestSession().then((s) => ({ s, ok: true })),
    SESSION_TIMEOUT_MS,
    { s: null, ok: false },
  );
  const u = session.s?.user as (Record<string, unknown> & { id: string }) | undefined;
  if (!u) return { user: null, resolved: session.ok };
  return {
    resolved: true,
    user: {
      id: u.id,
      name: (u.name as string | null) ?? null,
      email: (u.email as string | null) ?? null,
      image: (u.image as string | null) ?? null,
      handle: (u.handle as string | null) ?? null,
      username: (u.username as string | null) ?? null,
      isAdmin: (u.isAdmin as boolean | undefined) ?? false,
      isVerified: (u.isVerified as boolean | undefined) ?? false,
      tier: (u.tier as string | null) ?? null,
    },
  };
}

async function localeResources(
  locale: Locale,
  namespaces: readonly string[],
): Promise<LocaleBundle | null> {
  if (locale === DEFAULT_LOCALE || namespaces.length === 0) return null;
  try {
    return await loadNamespaces(locale, namespaces);
  } catch {
    // A missing catalog renders English defaults and loads on demand, as on the site.
    return null;
  }
}

export interface IslandDocumentOptions {
  /**
   * The route's own heads, outermost first, in place of the catalog head — for a
   * page the catalog does not describe (an unlisted game) or one nested under a
   * parent route whose `head()` the router merged in. They are merged under the
   * site-wide head exactly as the router merges a match chain.
   */
  heads?: readonly HeadInput[];
  /** i18n namespaces the first screen renders beyond the manifest's own. */
  namespaces?: readonly string[];
  /** The loading frame's ground and ink (GameLoadingFallback's defaults: black / white). */
  background?: string;
  foreground?: string;
}

/** Render the island document for `id` (the folder under `features/`). */
export async function renderIslandDocument(
  id: string,
  request: Request,
  options: IslandDocumentOptions = {},
): Promise<Response> {
  const feature = FEATURES.get(id);
  if (!feature) throw new Error(`island "${id}" has no features/${id}/feature.ts`);
  const heads: readonly HeadInput[] = options.heads ?? [
    feature.kind === 'app' ? appRouteHead(id) : gameRouteHead(id),
  ];
  const namespaces = [
    ...new Set([...feature.namespaces, ...SHARED_NAMESPACES, ...(options.namespaces ?? [])]),
  ];
  const url = new URL(request.url);
  const locale = resolveLocale({
    cookie: parseLocaleCookie(request.headers.get('cookie')),
    acceptLanguage: request.headers.get('accept-language'),
  });
  const [session, resources] = await Promise.all([
    resolveUser(),
    localeResources(locale, namespaces),
  ]);
  const data: IslandData = {
    id,
    catalog: matchCatalogRoute(url.pathname),
    user: session.user,
    sessionResolved: session.resolved,
    resources,
  };

  const rootHead: HeadInput = {
    meta: ROOT_META,
    links: [...ROOT_LINKS],
    scripts: [...prepaintHeadScripts({}), jsonLdScript([organizationSchema(), websiteSchema()])],
  };
  const dev = import.meta.env.DEV;
  // This request's CSP nonce: mints it and sets the report-only policy naming it
  // (lib/csp/nonce.server.ts — the same call app/router.tsx makes for router pages).
  const nonce = mintRequestCspNonce();
  const bg = options.background ?? '#000000';
  const fg = options.foreground ?? '#ffffff';
  // GameLoadingFallback's string, from the `shared` catalog when the route asks for it.
  const shared = resources?.shared as Record<string, unknown> | undefined;
  const loading = escapeHtml(typeof shared?.loading === 'string' ? shared.loading : 'Loading…');

  const html =
    '<!DOCTYPE html>' +
    `<html${attrs({ lang: locale, dir: dirFor(locale) })}>` +
    '<head>' +
    renderHead([rootHead, ...heads], nonce) +
    islandAssetTags(id, BUILD_MANIFEST, dev, nonce) +
    '</head>' +
    '<body class="font-body antialiased">' +
    `<script${attrs({ nonce })}>${PREPAINT_BODY_SCRIPT}</script>` +
    // The loading frame: GameLoadingFallback's markup, painted by the island's own
    // sheet before any script runs. mountIsland replaces it.
    `<div id="${ISLAND_ROOT_ID}">` +
    `<div class="app-ground flex w-full items-center justify-center" role="status" style="position:fixed;inset:0;background-color:${escapeHtml(bg)};color:${escapeHtml(fg)}">` +
    '<div class="flex flex-col items-center gap-4">' +
    '<div class="h-8 w-8 animate-spin rounded-full border-2" style="border-color:color-mix(in srgb, currentColor 20%, transparent);border-top-color:currentColor"></div>' +
    `<p class="text-sm" style="color:color-mix(in srgb, currentColor 70%, transparent)">${loading}</p>` +
    '</div></div></div>' +
    `<script type="application/json" id="${ISLAND_DATA_ID}">${serializeIslandData(data)}</script>` +
    '</body></html>';

  // Cache headers are left to the Nitro plugins, exactly as for a page the router
  // renders: anon-html-cache marks HTML by its cookies, security-headers adds the
  // policy (the pre-paint script is covered by its static hash; nothing else here
  // is an inline executable script).
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
