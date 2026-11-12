/// <reference types="vite/client" />
import {
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
} from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
// NOT from '@/lib/discord-sdk' — that module imports @discord/embedded-app-sdk,
// which would put 135 KB of Activity SDK into the entry chunk of every page.
import { isDiscordActivity } from '@/lib/discord-activity';
import type { QueryClient } from '@tanstack/react-query';
import { Providers } from '@/components/Providers';
import { PREPAINT_BODY_SCRIPT, prepaintHeadScripts } from '@/lib/prepaint/config';
import { SiteHeadContent } from '@/components/SiteHeadContent';
import { TwemojiProvider } from '@/components/ui/TwemojiProvider';
import { NavigationProgress } from '@/components/ui/NavigationProgress';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { markDocumentHydrated, trackHistoryActions } from '@/components/ui/defer-on-navigate';
import { startViewportPrefetch } from '@/lib/viewport-prefetch';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { installGlobalErrorHandlers } from '@/lib/client-errors';
import { initWebVitals } from '@/lib/rum';
import { registerServiceWorker } from '@/lib/sw-register';
import { organizationSchema, websiteSchema, jsonLdScript } from '@/lib/schema';
// The site-wide document defaults, shared with the island document (redesign B1).
import { ROOT_LINKS, ROOT_META } from '@/lib/root-head';
import { getRequestSession } from '@/lib/auth-session.server';
import { prisma } from '@/lib/prisma.server';
import { cachedNullable } from '@/lib/cached.server';
import { appearanceSeedKey } from '@/lib/appearance/seed-cache.server';
import { accountAppearanceSeed, type AppearanceSeed } from '@/lib/appearance/account-seed';
// Two entry sheets over the one `globals.css` body — app/site-tier.css explains
// the split, lib/style-tier.ts picks per route.
import siteTierCss from '@/app/site-tier.css?url';
import appTierCss from '@/app/app-tier.css?url';
import { hasStylesheet, styleTierFor } from '@/lib/style-tier';
// The Latin subset of the self-hosted body font. Imported for its hashed URL so
// the document can PRELOAD it — see the `links` block in `head()` below.
import geistLatinWoff2 from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import { resolveLocale, parseLocaleCookie } from '@/lib/i18n/resolve';
import { dirFor, DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/i18n/config';
import { localeCoreResources, preloadLocale } from '@/lib/i18n/resources.server';

/**
 * Cap how long the root loader will block on the session lookup before it gives
 * up and renders a signed-out shell. `getInitialUser` resolves the Better Auth
 * session against Postgres on EVERY document render (signed-in and anonymous).
 * If that query ever stalls, the root loader awaits it, so the stall becomes the
 * document's TTFB for every page on the site. A timeout bounds that blast radius.
 *
 * NOTE (supersedes the rationale in commit d25d2f1e): this bound did NOT cause
 * or fix the 20-32s cold TTFB that commit cites — that was traced to
 * lib/redis.server.ts hanging on an unreachable Redis. This is a defensive cap
 * on one unbounded dependency, not a fix for a diagnosed stall. Keep it, but
 * don't treat it as evidence about where that latency came from.
 *
 * A timeout turns the worst case into a signed-out first paint instead of a hang:
 * Better Auth's client session backfills the real identity right after
 * hydration — the exact path the shell used before this server-side lookup
 * existed — so the only cost of a timeout is a brief "signed out" flash for
 * that one slow request, not a wrong session.
 */
const SESSION_LOADER_TIMEOUT_MS = 800;

/**
 * Resolve `p`, but if it hasn't settled within `ms` resolve `fallback` instead.
 * Never rejects — a rejection from `p` also yields `fallback`. Used to bound the
 * root loader's session wait (see SESSION_LOADER_TIMEOUT_MS). The timer is
 * cleared once `p` settles so a resolved promise can't leak a pending timeout.
 */
const APPEARANCE_SEED_TIMEOUT_MS = 400;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Resolve the signed-in user from the session cookie on the server. Runs in the
 * root loader so the shell can render signed-in on the first paint instead of
 * flashing "signed out" while better-auth's client session loads after hydration.
 */
const getInitialUser = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    // Request-scoped so this shares one session resolution with the page loader
    // and getSidebarData instead of each re-querying Better Auth + entitlements.
    const session = await getRequestSession();
    const u = session?.user;
    // `resolved: true` = we asked and got an answer, whatever it was.
    if (!u) return { user: null, resolved: true, appearanceSeed: null };
    // The account's saved appearance, merged with the account-sync's own rules
    // and expressed as the localStorage writes the theme step reads — see
    // lib/appearance/account-seed.ts. One indexed lookup on a session we have
    // already resolved; a failure here degrades to the idle sync rather than
    // taking the user lookup down with it.
    // perf: this ran an uncached query on every signed-in render. Cache the row
    // for 5 min (invalidated by the appearance PUT in
    // lib/preferences/api/preferences.appearance.server.ts, so a save is never stale), and
    // give it its OWN short timeout: a slow query drops only the seed, never the
    // user (the loader keeps running and still warms the cache). The loader
    // throws on DB failure so an error is not cached as "no row".
    const appearanceRow = await withTimeout(
      cachedNullable(appearanceSeedKey(u.id), 300_000, () =>
        prisma.appearancePreference.findUnique({
          where: { userId: u.id },
          select: {
            style: true,
            accent: true,
            fontScale: true,
            density: true,
            readableFont: true,
            customAccent: true,
            colorVision: true,
            jellyMotion: true,
          },
        }),
      ).catch(() => null),
      APPEARANCE_SEED_TIMEOUT_MS,
      null,
    );
    return {
      appearanceSeed: appearanceRow ? accountAppearanceSeed(appearanceRow) : null,
      user: {
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
        image: u.image ?? null,
        handle: (u as { handle?: string | null }).handle ?? null,
        username: (u as { username?: string | null }).username ?? null,
        isAdmin: (u as { isAdmin?: boolean }).isAdmin ?? false,
        isVerified: (u as { isVerified?: boolean }).isVerified ?? false,
        // Entitlement, resolved server-side by the `customSession` plugin. It
        // is here so the FIRST client render already knows what this account
        // paid for, which matters most for what a membership switches OFF:
        // `hooks/useAdsEnabled` treats a signed-in user with no tier as unknown
        // and shows no ad, so without this field a member's every hard load
        // either flashed an ad (before) or held one back from a free account
        // until the client session landed (after). Persisted alongside the rest
        // of the snapshot by `components/Providers`.
        tier: (u as { tier?: string | null }).tier ?? null,
      },
      resolved: true,
    };
  } catch {
    // A FAILED lookup is not "signed out". Collapsing the two is what let a
    // valid session render the signed-out shell — sign-in pill, "Sign in to
    // post RMHarks" — under load, which invites a duplicate login and reads as
    // having been logged out. The shell renders a neutral pending state for
    // `resolved: false` instead, and the client session backfills the truth.
    return { user: null, resolved: false, appearanceSeed: null };
  }
});

/*
 * Pre-paint: ONE generated script (lib/prepaint, built by scripts/build-prepaint.ts).
 *
 * This file used to carry nine hand-written ES5 template strings (platform, theme,
 * 404 theme, access, delight, locale, media-reveal, cookie-consent, account seed).
 * They are now ordinary TypeScript steps under `lib/prepaint/` bundled into the one
 * string `PREPAINT_CODE`; `head()` emits it after the `rmh-prepaint` JSON data block
 * that carries what varies (global-404 flag, Discord head, the account seed, the
 * theme tables). The docs for each step, including why theme-color is not written
 * on iOS and what `data-app-dark` / `app-route` are for, live on the step
 * (lib/prepaint/theme.ts). The one piece that cannot fold in is the <body>-top
 * script (`PREPAINT_BODY_SCRIPT`): it needs `document.body`.
 */

/*
 * No Speculation Rules (removed 2026-11-09, redesign audit B3).
 *
 * The document used to carry a `speculationrules` script asking the browser to
 * prefetch the whole SSR document of any same-origin link on hover (OPT-04).
 * Every one of those links is a router `<Link>`: a click is a client-side
 * navigation that never requests the document, so each hover cost a full SSR
 * render (session lookup + the page's queries) whose bytes were thrown away.
 * The router's own intent preload (`defaultPreload: 'intent'` in
 * `app/router.tsx`) already fetches what a client navigation actually uses —
 * the route chunks and loader data. One prefetch mechanism, not three.
 *
 * The old exclusion list also documented eight GET handlers that WRITE on a
 * plain GET (unsubscribe, mark-as-read, doctrine rows, AI spend). Those are
 * tracked as redesign audit item C2 (safe methods are safe) rather than hidden
 * behind a prefetch exclusion list.
 */

/**
 * Resolve the locale from the session cookie (explicit user preference) or
 * Accept-Language header (browser default) on the server, so SSR renders in
 * the correct language on the very first paint.
 */
const getInitialI18n = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const cookie = parseLocaleCookie(request.headers.get('cookie'));
  const locale = resolveLocale({ cookie, acceptLanguage: request.headers.get('accept-language') });
  // en is bundled on the client and needs nothing here. For non-en we lazily load
  // ONLY the active language's bundle (its own async chunk) — the server no longer
  // imports all 32 catalogs at boot (cold-start win; see lib/i18n/resources.server.ts)
  // — then serialize only its CORE namespaces (shell + feed) into the loader
  // payload — not the full ~66-namespace catalog (~250-300KB) — so the client
  // hydrates synchronously in the right language for the shell/feed. preloadLocale()
  // must finish before the synchronous getServerI18n render path reads the bundle,
  // so we await it here. The other namespaces load client-side on demand
  // (perf audit B6; see lib/i18n/instances.ts). SSR renders from the
  // same core set, so hydration still matches.
  if (locale === DEFAULT_LOCALE) return { locale, resources: null };
  try {
    await preloadLocale(locale);
    return { locale, resources: localeCoreResources(locale) };
  } catch {
    // A failed locale chunk load must not take the whole document down with a
    // 500 / "Something went wrong": render English (the always-available
    // defaultValues) and let the client load the real locale's namespaces on demand.
    return { locale: DEFAULT_LOCALE, resources: null };
  }
});

/**
 * Fallback for the i18n server function failing on the CLIENT (a network blip
 * on a loader refetch, after the one retry in lib/server-fn-retry.ts). The
 * tab already holds the active locale's resources, so keep `<html lang>`'s
 * locale and send no new bundle rather than throwing the root loader.
 */
function i18nFallback(): { locale: Locale; resources: null } {
  let locale: Locale = DEFAULT_LOCALE;
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang as Locale;
    if ((LOCALES as readonly string[]).includes(lang)) locale = lang;
  }
  return { locale, resources: null };
}

/** Check if a URL path is a Discord Activity route (embedded iframe) */
function isDiscordRoute(pathname: string): boolean {
  return pathname.startsWith('/discord/') || pathname === '/discord';
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // perf audit §4.1: without this the root loader default-stales at 0ms and
  // refires on EVERY client navigation — two server-fn round trips (a full
  // Better Auth session resolution + re-serializing the locale payload) per
  // click, sitewide. Identity and locale change only via explicit actions, so
  // hold the loader data for 5 minutes. This suppresses only the automatic
  // per-navigation refetch; an explicit `router.invalidate()` (used by the
  // sign-out flow) and full-document reloads (OAuth sign-in returns) still get
  // fresh data, and any missed refresh self-heals within the window.
  staleTime: 5 * 60_000,
  loader: async () => {
    // Bound the session wait so a slow/contended DB can't hold the whole
    // document hostage (initial-load audit). i18n is NOT wrapped: it loads a
    // local locale chunk (no DB) and MUST finish before the synchronous SSR
    // render reads the bundle, or hydration mismatches — see getInitialI18n.
    const [user, i18n] = await Promise.all([
      withTimeout(getInitialUser(), SESSION_LOADER_TIMEOUT_MS, {
        user: null,
        resolved: false,
        appearanceSeed: null,
      }),
      getInitialI18n().catch(i18nFallback),
    ]);
    return {
      user: user.user,
      sessionResolved: user.resolved,
      locale: i18n.locale,
      i18nResources: i18n.resources,
      appearanceSeed: user.appearanceSeed,
    };
  },
  head: (ctx) => {
    const discord = ctx.matches?.some((m) => m.fullPath?.startsWith('/discord'));
    const seed = (ctx.loaderData as { appearanceSeed?: AppearanceSeed | null } | undefined)
      ?.appearanceSeed;
    // Set on the root match when the root's notFoundComponent renders: a root-level
    // 404 is a SITE page whatever the URL, so the pre-paint config carries `nf` and
    // the theme step never picks the app tier (lib/prepaint/config.ts). Read from `ctx.match` — this route's own match,
    // which the server fetches fresh for head() — not `ctx.matches`, which there
    // is the snapshot taken before the loaders ran. The client's hydrate()
    // restores the flag before running this head, so both sides emit the same
    // script.
    const globalNotFound = ctx.match?._notFound === true;
    const appCss =
      styleTierFor(
        (ctx.matches ?? []).map((m) => m.routeId),
        hasStylesheet(appTierCss),
      ) === 'app'
        ? appTierCss
        : siteTierCss;

    if (discord) {
      // Minimal head for a Discord Activity: no external fonts, no preconnects,
      // no JSON-LD — nothing that leaves the origin, because
      // inside the Activity iframe every request has to go through Discord's
      // URL-mapping proxy and a third-party font host is not mapped.
      //
      // It DOES carry the pre-paint scripts. This head used to ship none, on the
      // stated grounds that Discord's CSP blocks inline scripts — but the
      // document it produces has always carried inline scripts regardless: the
      // `$tsr` dehydration script TanStack Start emits on every SSR page, which
      // hydration cannot run without. These routes hydrate in Discord, so inline
      // scripts run there. What the empty list actually did was leave nothing
      // applied before first paint, so the whole appearance landed after
      // hydration: the ground went white → black, and under a 125% font scale
      // every rem-sized thing on the page grew by a quarter
      // (docs/archive/2026/fouc-audit-2026-10-06.md §6).
      return {
        meta: [
          { charSet: 'utf-8' },
          { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
          { title: 'RMHBox' },
        ],
        links: [{ rel: 'stylesheet', href: appCss }],
        scripts: prepaintHeadScripts({ discord: true, notFound: globalNotFound, seed }),
      };
    }

    return {
      meta: ROOT_META,
      links: [
        ...ROOT_LINKS,
        // Geist's Latin subset, requested in parallel with the stylesheet rather
        // than after it. A font declared inside a stylesheet is not discoverable
        // until that sheet has been downloaded AND parsed, and the entry sheet
        // is ~315 KB on a site page — so the 47 KB font that renders essentially
        // all of the page's text used to start on the far side of that, and `font-display: swap`
        // paid for it with a visible fallback-to-webfont reflow. Only the Latin
        // subset is preloaded: the other six (Cyrillic, Greek, Vietnamese, …)
        // stay behind their `unicode-range` so a Latin-script visitor never
        // fetches them. `crossOrigin` is REQUIRED even same-origin — fonts are
        // fetched in CORS mode, and a preload without it is a second,
        // uncredentialed fetch instead of a warm cache hit.
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: geistLatinWoff2,
          crossOrigin: 'anonymous',
        },
        { rel: 'stylesheet', href: appCss },
      ],
      scripts: [
        // The whole pre-paint stack: the `rmh-prepaint` data block (global-404 flag,
        // the signed-in account's appearance seed, theme tables) and the one generated
        // script that reads it — lib/prepaint. The account seed is applied before the
        // theme step reads localStorage, inside that script.
        ...prepaintHeadScripts({ notFound: globalNotFound, seed }),
        // Site-wide structured data (Organization + WebSite w/ SearchAction).
        jsonLdScript([organizationSchema(), websiteSchema()]),
      ],
    };
  },
  component: RootComponent,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  // RootDocument is the shellComponent — Route.useLoaderData() may not be
  // available here in all TanStack Start versions. We defensively try to read it
  // and fall back to "en"/"ltr" so the server HTML is valid. The prepaint locale
  // step (runs in <head> before body paint) will correct lang/dir
  // client-side for any mismatch, and RootComponent always passes the real
  // resolved locale down to AppI18nProvider.
  // The CSP nonce (docs/csp.md): every inline executable script in this document
  // carries it, or is covered by a static hash of the generated pre-paint code.
  const nonce = useRouter().options.ssr?.nonce;
  let locale: Locale = 'en';
  try {
    const data = Route.useLoaderData();
    locale = (data?.locale ?? 'en') as Locale;
  } catch {
    // shell component cannot access loader data — inline guard handles correction
  }
  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <head>
        <SiteHeadContent />
        {/* Reveals are now pure CSS (`animation-timeline: view()`), and their
            hidden start state lives only inside `@supports` + `@media not
            (prefers-reduced-motion)` — so a no-JS render was never hiding
            anything and this rule is belt-and-braces rather than load-bearing.
            It is KEPT because it costs nothing and it still covers the case the
            CSS cannot: a third-party or future surface that sets its own
            `opacity: 0` under `[data-reveal]`/`.reveal` and undoes it in script.
            (`components/motion/useRevealWatchdog` — the 1.5s deadline that used
            to rescue a stuck IntersectionObserver — is gone with the observer;
            see docs/archive/2026/performance-audit-2026-08-12.md §1.1.) */}
        {/* `.store-art__img` is on the same footing: the storefront cards fade
            their art in from opacity 0 once it loads, and the class that does
            it is set by an event handler. No scripting, no handler, no art —
            so it joins the reveal rule rather than getting its own mechanism. */}
        <noscript>
          <style>{`[data-reveal],.reveal{opacity:1!important;transform:none!important;filter:none!important}.store-art__img{opacity:1!important}`}</style>
        </noscript>
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: PREPAINT_BODY_SCRIPT }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const { user: initialUser, sessionResolved, locale, i18nResources } = Route.useLoaderData();

  // Restore the exact feed position on back/forward (and cover the mobile scroll
  // container, which the router's window-only restoration doesn't track).
  useScrollRestoration();

  // Install global error/unhandled-rejection reporting + Core Web Vitals
  // collection once on the client so runtime errors and perf regressions
  // surface in the server logs instead of failing silently.
  useEffect(() => {
    installGlobalErrorHandlers();
    initWebVitals();
    registerServiceWorker();
    // From here on, a mount is a page switch, not hydration — the point after
    // which `DeferOnNavigate` may split a page's first render.
    markDocumentHydrated();
  }, []);

  // Tells `DeferOnNavigate` a back/forward arrival from a link click — read from
  // the history itself, because `popstate` listeners registered after the
  // router run only once React has already rendered the restored page.
  useEffect(() => trackHistoryActions(router.history), [router]);

  // The touch-device link prefetcher (lib/viewport-prefetch), started once the
  // document has hydrated rather than from `getRouter()`: a preload issued while
  // the router is still adopting the server's matches re-runs the root loader
  // and holds hydration up behind it (app/router.tsx). It still waits for `load`.
  useEffect(() => startViewportPrefetch(router), [router]);

  // Inside a Discord Activity iframe, all routes must stay within /discord/*.
  // Redirect any non-discord path back to /discord/rmhbox, preserving the SDK
  // query params (frame_id, instance_id, etc.) that the embedded app needs.
  useEffect(() => {
    if (isDiscordActivity() && !isDiscordRoute(pathname)) {
      navigate({
        to: '/discord/rmhbox',
        search: Object.fromEntries(new URLSearchParams(window.location.search)),
        replace: true,
      });
    }
  }, [pathname, navigate]);

  return (
    <Providers
      initialUser={initialUser}
      sessionResolved={sessionResolved}
      locale={(locale ?? 'en') as Locale}
      i18nResources={i18nResources}
    >
      <NavigationProgress />
      <TwemojiProvider>
        <Outlet />
      </TwemojiProvider>
    </Providers>
  );
}
