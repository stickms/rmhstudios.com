/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
  useNavigate,
} from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
// NOT from '@/lib/discord-sdk' — that module imports @discord/embedded-app-sdk,
// which would put 135 KB of Activity SDK into the entry chunk of every page.
import { isDiscordActivity } from '@/lib/discord-activity';
import {
  Providers,
  THEME_EXCLUDED_ROUTES,
  THEME_EXCLUDED_EXCEPTIONS,
} from '@/components/Providers';
import { GlassFilter } from '@/components/ui/liquid-glass';
import { TwemojiProvider } from '@/components/ui/TwemojiProvider';
import { NavigationProgress } from '@/components/ui/NavigationProgress';
import { BackNavAnimation } from '@/components/ui/BackNavAnimation';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { NotFound } from '@/components/errors/NotFound';
import { installGlobalErrorHandlers } from '@/lib/client-errors';
import { initWebVitals } from '@/lib/rum';
import { registerServiceWorker } from '@/lib/sw-register';
import { organizationSchema, websiteSchema, jsonLdScript } from '@/lib/schema';
import { DEFAULT_OG_IMAGE, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, absoluteUrl } from '@/lib/seo';
import { getRequestSession } from '@/lib/auth-session.server';
import {
  APP_ROUTE_THEME_BG,
  APP_THEME_BG,
  THEME_BG,
  DEFAULT_STYLE,
} from '@/stores/themeStore';
import { ACCENT_MAP } from '@/lib/appearance';
import { GLASS_LEVEL_VARS, GLASS_LEVEL_KEY } from '@/lib/appearance/prefs';
import appCss from '@/app/globals.css?url';
// The Latin subset of the self-hosted body font. Imported for its hashed URL so
// the document can PRELOAD it — see the `links` block in `head()` below.
import interLatinWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import { resolveLocale, parseLocaleCookie } from '@/lib/i18n/resolve';
import { dirFor, DEFAULT_LOCALE, LOCALES, RTL_LOCALES, type Locale } from '@/lib/i18n/config';
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
    if (!u) return { user: null, resolved: true };
    return {
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
    return { user: null, resolved: false };
  }
});

/**
 * Inline script that applies the persisted theme class + accent override to
 * <html> before React hydrates, preventing a flash-of-unstyled-content (FOUC).
 * The theme→background map and the accent palette are serialized here from their
 * single source (stores/themeStore.ts, lib/appearance.ts) so this script never
 * drifts from the runtime that mirrors it.
 *
 * ## Why `theme-color` is not set on iOS
 *
 * `<meta name="theme-color">` is how a page tells the browser what colour to
 * paint its own chrome, and iOS Safari takes it literally: the strip behind and
 * around the floating bottom tab bar (and the one behind the status bar) is
 * filled with that FLAT colour. The site's chrome is not flat — the page paints
 * an aurora canvas edge to edge under `viewport-fit=cover`, and `globals.css`
 * goes out of its way to mirror that canvas onto the root element on mobile iOS
 * precisely so those strips carry it. A `theme-color` covers all of that with
 * one solid `--site-bg`, which is the coloured band that shows up under the tab
 * bar and does not match the page above it.
 *
 * So on iOS the tag is simply not written, and Safari is left to tint its bars
 * from the page itself. Everywhere else it still is: an Android address bar
 * that matches the theme is exactly what the tag is for.
 *
 * A route may still set its own `theme-color` through `head()` (rmh-capital,
 * rmh-pmc and covid do, and those pages ARE a flat colour, so a matching bar is
 * right there). Ours carries `data-rmh-theme` so the two are never confused —
 * the runtime mirror in `Providers.tsx` only ever touches the marked one.
 *
 * ## `data-app-dark`
 *
 * For a page in `APP_ROUTE_THEME_BG` the script already parses that page's own
 * persisted light/dark preference to pick the pre-paint background. It publishes
 * the answer on <html> as `data-app-dark="1"|"0"` as well, because painting the
 * root the right colour is only half the problem: the page's own token block is
 * selected by a class the SERVER has to guess at (the store default) and only
 * gets right after hydration. The attribute is the one piece of that state that
 * exists before first paint, so the page's stylesheet keys its tokens off it and
 * both halves agree from frame 0 — see `slice-it.css` and `pf2ecal.css`. Each
 * scopes it to its own descendants, so neither can touch the site theme.
 *
 * An entry with `system: true` starts from `prefers-color-scheme` rather than
 * from dark when nothing is stored, which is what lets a page default to "follow
 * the OS" without persisting an answer that goes stale the next time the OS
 * flips. `appRouteGround` in `stores/themeStore.ts` is the same resolution in
 * TypeScript, for the runtime after hydration — change the two together.
 */
const themeScript = `(function(){try{var m=${JSON.stringify(THEME_BG)};var B=${JSON.stringify(APP_THEME_BG)};var RB=${JSON.stringify(APP_ROUTE_THEME_BG)};var D=${JSON.stringify(DEFAULT_STYLE)};var EX=${JSON.stringify(THEME_EXCLUDED_ROUTES)};var XC=${JSON.stringify(THEME_EXCLUDED_EXCEPTIONS)};var s=localStorage.getItem("rmh-style");if(!s||!m.hasOwnProperty(s)){if(s)localStorage.setItem("rmh-style",D);s=D}var app=false;var p=location.pathname;var _u=function(b){return p===b||p.indexOf(b+"/")===0};var _x=false;for(var j=0;j<XC.length;j++){if(_u(XC[j])){_x=true;break}}if(!_x){for(var i=0;i<EX.length;i++){if(_u(EX[i])){app=true;break}}}if(s!=="default"&&!app){document.documentElement.classList.add("style-"+s)}var GV=${JSON.stringify(GLASS_LEVEL_VARS)};var gl=parseInt(localStorage.getItem(${JSON.stringify(GLASS_LEVEL_KEY)}),10);if(gl===0&&localStorage.getItem("rmh-reduce-transparency")==="1"){gl=2}if(isNaN(gl)||gl<0||gl>4){gl=2}if(gl===0){document.documentElement.classList.add("reduce-transparency")}else if(GV[gl]){document.documentElement.style.setProperty("--glass-user-blur",String(GV[gl].blur));document.documentElement.style.setProperty("--glass-user-tint",String(GV[gl].tint))}var bg=app?B:m[s];if(app){for(var rk in RB){if(_u(rk)){var ro=RB[rk];var rd=ro.system?(!!window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches):true;try{var rj=JSON.parse(localStorage.getItem(ro.key)||"null");var rs=(rj&&rj.state)?rj.state:rj;if(rs&&typeof rs[ro.darkFlag]==="boolean")rd=rs[ro.darkFlag]}catch(e){}bg=rd?ro.dark:ro.light;document.documentElement.setAttribute("data-app-dark",rd?"1":"0");break}}}var UT=localStorage.getItem("rmh-user-theme");if(UT&&s!=="high-contrast"&&!app){try{var utj=JSON.parse(UT);if(utj&&utj.vars){var uts=document.documentElement.style;for(var uk in utj.vars){uts.setProperty(uk,utj.vars[uk])}if(typeof utj.bg==="string")bg=utj.bg}}catch(e){}}window.__themeBg=bg;document.documentElement.style.backgroundColor=bg;var _hx=(""+bg).replace(/^#/,"");if(_hx.length===3){_hx=_hx.charAt(0)+_hx.charAt(0)+_hx.charAt(1)+_hx.charAt(1)+_hx.charAt(2)+_hx.charAt(2)}if(/^[0-9a-fA-F]{6}$/.test(_hx)){var _cv=function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};var _lm=0.2126*_cv(parseInt(_hx.substr(0,2),16))+0.7152*_cv(parseInt(_hx.substr(2,2),16))+0.0722*_cv(parseInt(_hx.substr(4,2),16));document.documentElement.style.colorScheme=_lm<0.5?"dark":"light"}if(!document.documentElement.classList.contains("ios-webkit")){var t=document.querySelector('meta[name="theme-color"][data-rmh-theme]');if(t)t.content=bg;else{t=document.createElement("meta");t.name="theme-color";t.content=bg;t.setAttribute("data-rmh-theme","");document.head.appendChild(t)}}var A=${JSON.stringify(ACCENT_MAP)};var ac=localStorage.getItem("rmh-accent");if(ac&&A[ac]&&!app){var d=document.documentElement.style;d.setProperty("--site-accent",A[ac].value);d.setProperty("--site-accent-fg",A[ac].fg);d.setProperty("--site-accent-hover","color-mix(in oklab,"+A[ac].value+" 82%, #000)");d.setProperty("--site-accent-dim","color-mix(in oklab,"+A[ac].value+" 15%, transparent)");d.setProperty("--site-glass-light","color-mix(in srgb,"+A[ac].value+" 20%, rgba(255,255,255,0.14))")}var fs=localStorage.getItem("rmh-font-scale");if(fs&&/^(875|1125|1250)$/.test(fs)){document.documentElement.style.fontSize=(parseInt(fs,10)/10)+"%"}if(localStorage.getItem("rmh-density")==="compact"){document.documentElement.setAttribute("data-density","compact")}if(localStorage.getItem("rmh-readable-font")==="1"){document.documentElement.classList.add("readable-font")}if(localStorage.getItem("rmh-reduce-motion")==="1"){document.documentElement.classList.add("reduce-motion")}var cvm=localStorage.getItem("rmh-color-vision");if(cvm==="deuteranopia"||cvm==="protanopia"||cvm==="tritanopia"){document.documentElement.setAttribute("data-color-vision",cvm)}var ca=localStorage.getItem("rmh-custom-accent");if(ca&&/^#[0-9a-fA-F]{6}$/.test(ca)&&!app){var cr=parseInt(ca.substr(1,2),16),cg=parseInt(ca.substr(3,2),16),cb=parseInt(ca.substr(5,2),16);var cl=(0.2126*cr+0.7152*cg+0.0722*cb)/255;var cf=cl>0.55?"#111111":"#ffffff";var dc=document.documentElement.style;dc.setProperty("--site-accent",ca);dc.setProperty("--site-accent-fg",cf);dc.setProperty("--site-accent-hover","color-mix(in oklab,"+ca+" 82%, #000)");dc.setProperty("--site-accent-dim","color-mix(in oklab,"+ca+" 15%, transparent)");dc.setProperty("--site-glass-light","color-mix(in srgb,"+ca+" 20%, rgba(255,255,255,0.14))")}}catch(e){}})()`;

/**
 * Mark iOS WebKit before first paint so its compositor-safe glass tier applies
 * before any fixed aurora, SVG lens, or backdrop-filter animation is created.
 * iPadOS may present a desktop Macintosh UA, hence the touch-point fallback.
 */
const platformScript = `(function(){try{var u=navigator.userAgent||"";var ios=/iPhone|iPad|iPod/.test(u)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);var wk=u.indexOf("AppleWebKit")!==-1&&u.indexOf("Chrome/")===-1&&u.indexOf("Chromium")===-1&&u.indexOf("Edg/")===-1&&u.indexOf("OPR/")===-1;if(ios&&wk)document.documentElement.classList.add("ios-webkit")}catch(e){}})()`;

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
const deferredFontsScript = `(function(){var u="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&family=Playfair+Display:wght@400..900&family=Bangers&family=Bebas+Neue&family=Cinzel:wght@400..900&family=Patrick+Hand&display=swap";function l(){var k=document.createElement("link");k.rel="stylesheet";k.href=u;document.head.appendChild(k)}if("requestIdleCallback"in window)requestIdleCallback(l);else setTimeout(l,200)})()`;

/**
 * Paths that must never be speculatively prefetched (OPT-04).
 *
 * A prefetched document is fetched WITHOUT any user interaction and WITH the
 * user's cookies, so anything whose GET has a side effect would fire on hover
 * for a page the visitor may never open. `href_matches` takes URLPattern
 * syntax, where `*` spans path separators — `/api/*` covers `/api/a/b/c`, and a
 * trailing `*` with no slash (`/admin*`) covers both `/admin` and `/admin/…`.
 *
 * ## Why `/api/*` is wholesale, not decorative
 *
 * An audit of every GET handler under `app/routes/api/**` found eight that
 * write or cost money on a plain GET:
 *
 *  - `api/email/unsubscribe.ts` — consumes a signed token and upserts
 *    `NotificationPreference.emailDigest = false`. A prefetch unsubscribes you.
 *  - `api/group-chats/$id/index.ts` and `api/group-chats/$id/messages.ts` —
 *    both write `groupChatMember.lastReadAt` (mark-as-read) inside the GET.
 *  - `api/messages/$conversationId.ts` — `updateMany` marking DMs read.
 *  - `api/doctrine/safehouse/content.ts` — `doctrineAccessLog.createMany`.
 *  - `api/doctrine/puzzles/today.ts` — creates the day's puzzle rows on demand.
 *  - `api/doctrine/puzzles/replay.ts` — creates a `DoctrinePuzzleReplay` row.
 *  - `api/ai/takeaways.ts` — `rateLimit: 'ai'`; on a cache miss it spends model
 *    tokens. `api/rmhladder/prep.ts` documents the same hazard from the other
 *    side: it is a POST *because* a read that costs money must not be
 *    prefetchable.
 *
 * Page routes were audited too — no route loader or `beforeLoad` under
 * `app/routes/**` writes, so the document tier is safe on its own merits. The
 * remaining entries below are the auth/payment/admin classes the spec calls
 * for, plus two pages excluded on cost rather than correctness (noted inline).
 */
const SPECULATION_EXCLUDED_PATHS = [
  // Every JSON endpoint, auth flow and upload target — see the audit above.
  '/api/*',
  // Auth flows: session and token minting. `/logout*` has no route today; it is
  // listed so adding one later can't silently become prefetchable.
  '/login*',
  '/logout*',
  '/rmhcode/auth*',
  // Payment. No `/checkout` route exists today (Stripe redirects off-site);
  // listed for the same defensive reason as `/logout*`.
  '/checkout*',
  // Admin console.
  '/admin*',
  // Referral landing: a tracking link that stores an attribution code and
  // immediately redirects. `noindex`, and disallowed in robots.txt.
  '/ref/*',
  // Not a correctness fix — a prefetch does not run scripts, so the mark-read
  // that `ConversationView` fires on mount does not go off. These are excluded
  // because they are per-viewer pages that miss the anonymous HTML cache: every
  // hover would cost a session resolution plus the page's own queries for a
  // view that is often never opened.
  '/messages*',
  '/settings*',
] as const;

/**
 * Speculation Rules: let the *browser* prefetch whole documents on its own
 * heuristics (OPT-04).
 *
 * `eagerness: "moderate"` is hover — the same intent signal the router already
 * uses — but run off the main thread, with automatic backoff on Save-Data, low
 * battery and constrained connections that the JS preload path cannot match.
 * Deliberately prefetch only: `prerender` (OPT-05) additionally *runs* the next
 * page's effects, which needs a `whenActivated` guard around every analytics,
 * RUM and socket call first.
 *
 * `where.not` is the load-bearing half — see SPECULATION_EXCLUDED_PATHS.
 * `[data-no-speculate]` is the per-link escape hatch: put it on an anchor (or
 * any ancestor the selector matches) to opt that link out without touching this
 * list.
 *
 * CSP: `script-src` in `deploy/apache/rmhstudios.conf` includes
 * `'unsafe-inline'`, so this inline script is permitted as-is. Every speculated
 * URL is same-origin, which `default-src 'self'` already allows. If script-src
 * is ever tightened to nonces, this script needs the nonce too.
 */
const speculationRules = JSON.stringify({
  prefetch: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '/*' },
          ...SPECULATION_EXCLUDED_PATHS.map((path) => ({ not: { href_matches: path } })),
          // Per-link opt-out, and respect an author's existing `nofollow`.
          { not: { selector_matches: '[data-no-speculate]' } },
          { not: { selector_matches: '[rel~="nofollow"]' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
});

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
      withTimeout(getInitialUser(), SESSION_LOADER_TIMEOUT_MS, {
        user: null,
        resolved: false,
      }),
      getInitialI18n(),
    ]);
    return {
      user: user.user,
      sessionResolved: user.resolved,
      locale: i18n.locale,
      i18nResources: i18n.resources,
    };
  },
  head: (ctx) => {
    const discord = ctx.matches?.some((m) => m.fullPath?.startsWith('/discord'));

    if (discord) {
      // Minimal head for Discord Activity — no inline scripts or external fonts
      // (Discord's CSP blocks them, causing hydration mismatch)
      return {
        meta: [
          { charSet: 'utf-8' },
          { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
          { title: 'RMHBox' },
        ],
        links: [{ rel: 'stylesheet', href: appCss }],
        scripts: [],
      };
    }

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { title: 'RMH Studios — The community for making, playing, and sharing.' },
        {
          name: 'description',
          content:
            'A social-first home for original games, creative tools, music, learning, and the people making them.',
        },
        { property: 'og:site_name', content: 'RMH Studios' },
        {
          property: 'og:title',
          content: 'RMH Studios — The community for making, playing, and sharing.',
        },
        {
          property: 'og:description',
          content:
            'A social-first home for original games, creative tools, music, learning, and the people making them.',
        },
        { property: 'og:type', content: 'website' },
        // The site-wide fallback card. Shared with `buildMeta`'s default so a
        // route that sets no image of its own unfurls the same way whichever
        // head ends up winning.
        { property: 'og:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
        { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
        { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
        {
          property: 'og:image:alt',
          content: 'The RMH Studios navigation globe, on the site’s glass canvas.',
        },
        { property: 'og:locale', content: 'en_US' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: absoluteUrl(DEFAULT_OG_IMAGE) },
      ],
      links: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // Registers the site as an address-bar search engine (type the domain,
        // press Tab, search). The document is static in public/opensearch.xml.
        {
          rel: 'search',
          type: 'application/opensearchdescription+xml',
          title: 'RMH Studios',
          href: '/opensearch.xml',
        },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
        // Inter's Latin subset, requested in parallel with the stylesheet rather
        // than after it. A font declared inside a stylesheet is not discoverable
        // until that sheet has been downloaded AND parsed, and globals.css is
        // 433 KB — so the 47 KB font that renders essentially all of the page's
        // text used to start on the far side of that, and `font-display: swap`
        // paid for it with a visible fallback-to-Inter reflow. Only the Latin
        // subset is preloaded: the other six (Cyrillic, Greek, Vietnamese, …)
        // stay behind their `unicode-range` so a Latin-script visitor never
        // fetches them. `crossOrigin` is REQUIRED even same-origin — fonts are
        // fetched in CORS mode, and a preload without it is a second,
        // uncredentialed fetch instead of a warm cache hit.
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: interLatinWoff2,
          crossOrigin: 'anonymous',
        },
        { rel: 'stylesheet', href: appCss },
      ],
      scripts: [
        { children: platformScript },
        { children: themeScript },
        { children: localeScript },
        // Inter (body font) is self-hosted via globals.css; decorative/theme fonts
        // stay idle-deferred (loaded from Google Fonts after the page is interactive).
        { children: deferredFontsScript },
        // Browser-driven document prefetch on hover. Ignored by engines that
        // don't implement it; see SPECULATION_EXCLUDED_PATHS for the safety list.
        { type: 'speculationrules', children: speculationRules },
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
        <HeadContent />
        {/* Scroll-triggered reveals start at opacity 0 and are brought in by an
            IntersectionObserver. With no JS there is no observer, so whole
            sections would simply never appear (the audit found /pricing's plan
            grid and all of /rmh-capital's body in exactly that state). Reveal
            is an enhancement; without scripting the content is just there.
            The scripted equivalent — observer armed but never fired — is
            handled by the deadline in components/motion/useRevealWatchdog. */}
        {/* `.store-art__img` is on the same footing: the storefront cards fade
            their art in from opacity 0 once it loads, and the class that does
            it is set by an event handler. No scripting, no handler, no art —
            so it joins the reveal rule rather than getting its own mechanism. */}
        <noscript>
          <style>{`[data-reveal],.reveal{opacity:1!important;transform:none!important;filter:none!important}.store-art__img{opacity:1!important}`}</style>
        </noscript>
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: bodyThemeScript }} />
        {/* The aurora canvas — the shared backdrop every glass surface samples.
            The two layers are this element's ::before (near field) and ::after
            (far field); see the §5.1 block in app/globals.css.

            It is a real element rather than `body::before`/`body::after`, which
            is what it used to be, for ONE reason: `hooks/useLiquidBackground`
            steers its parallax through `--aurora-mx/--aurora-my`, and a custom
            property written on `<html>` or `<body>` dirties the computed style of
            every element in the document. On this site that measured ~70ms per
            write at 4x CPU throttle (~30ms unthrottled) — paid on every animation
            frame the pointer moved, which made it the largest single cost on the
            whole site. Written on THIS element, whose only descendants are its
            two pseudo-elements, the same update measures 0ms.

            So it must stay a leaf: never render children into it. */}
        <div className="site-aurora" aria-hidden />
        {children}
        {/* The Liquid Glass lens filters (#glass-lens / -press / -prism, plus the
            #glass-goo metaball filter). One hidden SVG host for the whole
            document — every `.glass-refract` surface samples it by url(). */}
        <GlassFilter />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
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
    <Providers
      initialUser={initialUser}
      sessionResolved={sessionResolved}
      locale={(locale ?? 'en') as Locale}
      i18nResources={i18nResources}
    >
      <NavigationProgress />
      <BackNavAnimation />
      <TwemojiProvider>
        <Outlet />
      </TwemojiProvider>
    </Providers>
  );
}
