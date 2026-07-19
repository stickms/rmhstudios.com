/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isDiscordActivity } from "@/lib/discord-sdk";
import { Providers, THEME_EXCLUDED_ROUTES } from "@/components/Providers";
import { TwemojiProvider } from "@/components/ui/TwemojiProvider";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { BackNavAnimation } from "@/components/ui/BackNavAnimation";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { RouteErrorFallback } from "@/components/errors/RouteErrorFallback";
import { NotFound } from "@/components/errors/NotFound";
import { installGlobalErrorHandlers } from "@/lib/client-errors";
import { initWebVitals } from "@/lib/rum";
import { registerServiceWorker } from "@/lib/sw-register";
import { organizationSchema, websiteSchema, jsonLdScript } from "@/lib/schema";
import { GlassFilter } from "@/components/ui/liquid-glass";
import { getRequestSession } from "@/lib/auth-session.server";
import { THEME_BG, DEFAULT_STYLE } from "@/stores/themeStore";
import { ACCENT_MAP } from "@/lib/appearance";
import appCss from "@/app/globals.css?url";
import { resolveLocale, parseLocaleCookie } from "@/lib/i18n/resolve";
import { dirFor, DEFAULT_LOCALE, LOCALES, RTL_LOCALES, type Locale } from "@/lib/i18n/config";
import { localeCoreResources, preloadLocale } from "@/lib/i18n/resources.server";

/**
 * Resolve the signed-in user from the session cookie on the server. Runs in the
 * root loader so the shell can render signed-in on the first paint instead of
 * flashing "signed out" while better-auth's client session loads after hydration.
 */
/**
 * Cap how long the root loader will block on the session lookup before it gives
 * up and renders a signed-out shell. `getInitialUser` resolves the Better Auth
 * session against Postgres on EVERY document render (signed-in and anonymous).
 * Under origin CPU/DB contention that query can stall for many seconds, and
 * because the root loader awaits it, that stall becomes the document's TTFB
 * (initial-load audit: cold TTFB measured at 20-32s while warm was ~80ms). A
 * timeout turns the worst case into a signed-out first paint instead of a hang:
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
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

const getInitialUser = createServerFn({ method: "GET" }).handler(async () => {
  try {
    // Request-scoped so this shares one session resolution with the page loader
    // and getSidebarData instead of each re-querying Better Auth + entitlements.
    const session = await getRequestSession();
    const u = session?.user;
    if (!u) return null;
    return {
      id: u.id,
      name: u.name ?? null,
      email: u.email ?? null,
      image: u.image ?? null,
      handle: (u as { handle?: string | null }).handle ?? null,
      username: (u as { username?: string | null }).username ?? null,
      isAdmin: (u as { isAdmin?: boolean }).isAdmin ?? false,
      isVerified: (u as { isVerified?: boolean }).isVerified ?? false,
    };
  } catch {
    return null;
  }
});

/**
 * Inline script that applies the persisted theme class + accent override to
 * <html> before React hydrates, preventing a flash-of-unstyled-content (FOUC).
 * The theme→background map and the accent palette are serialized here from their
 * single source (stores/themeStore.ts, lib/appearance.ts) so this script never
 * drifts from the runtime that mirrors it.
 */
const themeScript = `(function(){try{var m=${JSON.stringify(THEME_BG)};var D=${JSON.stringify(DEFAULT_STYLE)};var EX=${JSON.stringify(THEME_EXCLUDED_ROUTES)};var s=localStorage.getItem("rmh-style");if(!s||!m.hasOwnProperty(s)){if(s)localStorage.setItem("rmh-style",D);s=D}var app=false;var p=location.pathname;for(var i=0;i<EX.length;i++){if(p.indexOf(EX[i])===0){app=true;break}}if(s!=="default"&&!app){document.documentElement.classList.add("style-"+s)}if(localStorage.getItem("rmh-reduce-transparency")==="1"){document.documentElement.classList.add("reduce-transparency")}var bg=app?m["default"]:m[s];window.__themeBg=bg;document.documentElement.style.backgroundColor=bg;var t=document.querySelector('meta[name="theme-color"]');if(t)t.content=bg;else{t=document.createElement("meta");t.name="theme-color";t.content=bg;document.head.appendChild(t)}var A=${JSON.stringify(ACCENT_MAP)};var ac=localStorage.getItem("rmh-accent");if(ac&&A[ac]&&!app){var d=document.documentElement.style;d.setProperty("--site-accent",A[ac].value);d.setProperty("--site-accent-fg",A[ac].fg);d.setProperty("--site-accent-hover","color-mix(in oklab,"+A[ac].value+" 82%, #000)");d.setProperty("--site-accent-dim","color-mix(in oklab,"+A[ac].value+" 15%, transparent)");d.setProperty("--site-glass-light","color-mix(in srgb,"+A[ac].value+" 20%, rgba(255,255,255,0.14))")}}catch(e){}})()`;

/**
 * Inline guard that reads the locale cookie and sets lang/dir on <html> before
 * the body paints. This runs in <head> so there is no flash of wrong direction
 * (important for Arabic RTL). Works as a fallback for the SSR-set lang/dir
 * attribute and also for client navigations.
 */
const localeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )rmh-lang=([^;]+)/);var l=m?decodeURIComponent(m[1]):"en";var S=${JSON.stringify([...LOCALES])};var R=${JSON.stringify([...RTL_LOCALES])};if(S.indexOf(l)<0)l="en";document.documentElement.lang=l;document.documentElement.setAttribute("dir",R.indexOf(l)>=0?"rtl":"ltr")}catch(e){}})()`;


const bodyThemeScript = `if(window.__themeBg)document.body.style.backgroundColor=window.__themeBg`;

/**
 * Deferred font loading script — loads decorative/theme fonts after the page
 * is interactive via requestIdleCallback, keeping them off the critical path.
 * (Inter, the body/display font, is now self-hosted via @fontsource-variable/inter
 * imported in globals.css — no Google Fonts request on the critical path.)
 */
const deferredFontsScript = `(function(){var u="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&family=Playfair+Display:wght@400..900&family=Bangers&family=Bebas+Neue&family=Orbitron:wght@400..900&family=Cinzel:wght@400..900&family=Pacifico&family=Space+Grotesk:wght@300..700&family=Permanent+Marker&family=Caveat:wght@400..700&family=Dancing+Script:wght@400..700&family=Patrick+Hand&display=swap";function l(){var k=document.createElement("link");k.rel="stylesheet";k.href=u;document.head.appendChild(k)}if("requestIdleCallback"in window)requestIdleCallback(l);else setTimeout(l,200)})()`;

/**
 * Resolve the locale from the session cookie (explicit user preference) or
 * Accept-Language header (browser default) on the server, so SSR renders in
 * the correct language on the very first paint.
 */
const getInitialI18n = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookie = parseLocaleCookie(request.headers.get("cookie"));
  const locale = resolveLocale({ cookie, acceptLanguage: request.headers.get("accept-language") });
  // en is bundled on the client and needs nothing here. For non-en we lazily load
  // ONLY the active language's bundle (its own async chunk) — the server no longer
  // imports all 32 catalogs at boot (cold-start win; see lib/i18n/resources.server.ts)
  // — then serialize only its CORE namespaces (shell + feed) into the loader
  // payload — not the full ~66-namespace catalog (~250-300KB) — so the client
  // hydrates synchronously in the right language for the shell/feed. preloadLocale()
  // must finish before the synchronous getServerI18n render path reads the bundle,
  // so we await it here. The rest of the locale is backfilled client-side after
  // hydration (perf audit §4.1; see lib/i18n/instances.ts). SSR renders from the
  // same core set, so hydration still matches.
  if (locale === DEFAULT_LOCALE) return { locale, resources: null };
  await preloadLocale(locale);
  return { locale, resources: localeCoreResources(locale) };
});

/** Check if a URL path is a Discord Activity route (embedded iframe) */
function isDiscordRoute(pathname: string): boolean {
  return pathname.startsWith('/discord/') || pathname === '/discord';
}

export const Route = createRootRoute({
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
      withTimeout(getInitialUser(), SESSION_LOADER_TIMEOUT_MS, null),
      getInitialI18n(),
    ]);
    return { user, locale: i18n.locale, i18nResources: i18n.resources };
  },
  head: (ctx) => {
    const discord = ctx.matches?.some(m =>
      m.fullPath?.startsWith('/discord')
    );

    if (discord) {
      // Minimal head for Discord Activity — no inline scripts or external fonts
      // (Discord's CSP blocks them, causing hydration mismatch)
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
          { title: "RMHBox" },
        ],
        links: [
          { rel: "stylesheet", href: appCss },
        ],
        scripts: [],
      };
    }

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: "RMH Studios — The everything platform." },
        { name: "description", content: "Type a prompt and get an instant, shareable, collaboratively-editable webpage." },
      ],
      links: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        { rel: "stylesheet", href: appCss },
      ],
      scripts: [
        { children: themeScript },
        { children: localeScript },
        // Inter (body font) is self-hosted via globals.css; decorative/theme fonts
        // stay idle-deferred (loaded from Google Fonts after the page is interactive).
        { children: deferredFontsScript },
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
  // and fall back to "en"/"ltr" so the server HTML is valid. The localeScript
  // inline guard (runs in <head> before body paint) will correct lang/dir
  // client-side for any mismatch, and RootComponent always passes the real
  // resolved locale down to AppI18nProvider.
  let locale: Locale = "en";
  try {
    const data = Route.useLoaderData();
    locale = (data?.locale ?? "en") as Locale;
  } catch {
    // shell component cannot access loader data — inline guard handles correction
  }
  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className="font-body antialiased"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: bodyThemeScript }} />
        {/* SVG displacement filter sampled by the liquid-glass primitives
            (components/ui/liquid-glass.tsx) via url(#glass-distortion).
            Mounted once here so glass surfaces work on every route. */}
        <GlassFilter />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user: initialUser, locale, i18nResources } = Route.useLoaderData();

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
  }, []);

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
    <Providers initialUser={initialUser} locale={(locale ?? "en") as Locale} i18nResources={i18nResources}>
      <NavigationProgress />
      <BackNavAnimation />
      <TwemojiProvider>
        <Outlet />
      </TwemojiProvider>
    </Providers>
  );
}
