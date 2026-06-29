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
import { Providers } from "@/components/Providers";
import { TwemojiProvider } from "@/components/ui/TwemojiProvider";
import { auth } from "@/lib/auth";
import appCss from "@/app/globals.css?url";
import { resolveLocale, parseLocaleCookie } from "@/lib/i18n/resolve";
import { dirFor, DEFAULT_LOCALE, LOCALES, RTL_LOCALES, type Locale } from "@/lib/i18n/config";
import { localeResources } from "@/lib/i18n/resources.server";

/**
 * Resolve the signed-in user from the session cookie on the server. Runs in the
 * root loader so the shell can render signed-in on the first paint instead of
 * flashing "signed out" while better-auth's client session loads after hydration.
 */
const getInitialUser = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
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
 * Inline script that applies the persisted theme class to <html> before
 * React hydrates, preventing a flash-of-unstyled-content (FOUC).
 */
const themeScript = `(function(){try{var m={default:"#000",light:"#f5f5f7",gamer:"#0a0a0a",anime:"#fff5f9",musical:"#0c0e1a",hyperpop:"#120018","comic-book":"#fffde0",cinema:"#0a0a08","gen-z":"#1a1820",boomer:"#f5f0e8",aries:"#1a0a0a",taurus:"#141a10",gemini:"#0e0e22",cancer:"#0c1018",leo:"#140e1e",virgo:"#f4f6f2",libra:"#f8f0f6",scorpio:"#0e0608",sagittarius:"#100c1e",capricorn:"#141416",aquarius:"#060e18",pisces:"#0c1018",spring:"#f2f8f0",summer:"#fff8f0",autumn:"#1a1410",winter:"#0a0e14",elementary:"#fffef4","middle-school":"#181e24","high-school":"#121418",university:"#f5f0e8"};var s=localStorage.getItem("rmh-style");if(s&&s!=="default"){document.documentElement.classList.add("style-"+s)}var bg=m[s||"default"]||m.default;window.__themeBg=bg;document.documentElement.style.backgroundColor=bg;var t=document.querySelector('meta[name="theme-color"]');if(t)t.content=bg;else{t=document.createElement("meta");t.name="theme-color";t.content=bg;document.head.appendChild(t)}}catch(e){}})()`;

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
  // en is bundled on the client; for zh/ar we serialize the active language's
  // resources into the loader payload so the client hydrates synchronously in the
  // right language (no flash, no mismatch) without shipping all languages.
  const resources = locale === DEFAULT_LOCALE ? null : localeResources(locale);
  return { locale, resources };
});

/** Check if a URL path is a Discord Activity route (embedded iframe) */
function isDiscordRoute(pathname: string): boolean {
  return pathname.startsWith('/discord/') || pathname === '/discord';
}

export const Route = createRootRoute({
  loader: async () => {
    const [user, i18n] = await Promise.all([getInitialUser(), getInitialI18n()]);
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
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Nunito:wght@200..1000&family=Inter:wght@100..900&display=swap",
        },
      ],
      scripts: [
        { children: themeScript },
        { children: localeScript },
        { children: deferredFontsScript },
      ],
    };
  },
  component: RootComponent,
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
        className="font-nunito antialiased"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: bodyThemeScript }} />
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
      <TwemojiProvider>
        <Outlet />
      </TwemojiProvider>
    </Providers>
  );
}
