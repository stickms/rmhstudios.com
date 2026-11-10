import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { setSharedQueryClient } from '@/lib/query-client-ref';
import { useLocation, useRouter, useRouterState } from '@tanstack/react-router';
import { MotionConfig, LazyMotion } from 'framer-motion';
import { Toaster } from 'sonner';
import { authClient } from '@/lib/auth-client';
import {
  useThemeStore,
  SITE_STYLES,
  THEME_BG,
  APP_THEME_BG,
  DEFAULT_STYLE,
  SiteStyle,
  USER_THEME_KEY,
  appRouteGround,
  paintDocumentGround,
} from '@/stores/themeStore';
import { clearThemeTokens, type AppliedUserTheme } from '@/lib/themes/tokens';
import { applyAccent, isAccentId, ACCENT_STORAGE_KEY, accentCssVars } from '@/lib/appearance';
import { ensureReadableAccent } from '@/lib/appearance/contrast';
import {
  HEX_RE,
  FONT_SCALE_KEY,
  DENSITY_KEY,
  READABLE_FONT_KEY,
  CUSTOM_ACCENT_KEY,
  COLOR_VISION_KEY,
  NAV_TRANSITION_KEY,
  DEFAULT_NAV_TRANSITION,
  ALWAYS_EVERT_GLOBE_KEY,
  EVERSION_LEVEL_KEY,
  DEFAULT_EVERSION_LEVEL,
  isEversionLevel,
  isNavTransition,
  isColorVisionMode,
  applyColorVision,
  JELLY_MOTION_KEY,
  DEFAULT_JELLY_MOTION,
  isJellyMotion,
  applyJellyMotion,
  ELECTRIC_ARCS_KEY,
  DEFAULT_ELECTRIC_ARCS,
  isElectricArcs,
  applyElectricArcs,
} from '@/lib/appearance/prefs';
import { useSpatialParallax } from '@/hooks/useSpatialParallax';
import { useJellyPointer } from '@/hooks/useJellyPointer';
import { useSoftRenderSettle } from '@/hooks/useSoftRenderSettle';
import { isNativeMaterialRoute, syncNativeMaterialClass } from '@/lib/native-material-routes';
import { useLiquidBackground } from '@/hooks/useLiquidBackground';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useLocaleStore, writeLocaleCookie } from '@/stores/localeStore';
import { applyHtmlLangDir } from '@/lib/i18n/dom';
import { isAppThemeRoute } from '@/lib/prepaint/theme-routes';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import { CommandPaletteMount } from '@/components/site/CommandPaletteMount';
import { CallMount } from '@/components/call/CallMount';
import { GroupCallMount } from '@/components/groupcall/GroupCallMount';
import { AccessMount } from '@/components/access/AccessMount';
import { DelightMount } from '@/components/delight/DelightMount';
import { ThemePreviewBar } from '@/components/themes/ThemePreviewBar';
import { RecentsTracker } from '@/components/site/RecentsTracker';
import { PlaytimeTracker } from '@/components/site/PlaytimeTracker';
import { PatchNotesMount } from '@/components/arcade/PatchNotesMount';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import type { Locale } from '@/lib/i18n/config';
import type { LocaleBundle } from '@/lib/i18n/resources';
import { recoverViewTransition } from '@/lib/view-transition';
import { AppTierContext } from '@/components/ui/app-tier-context';
import { installScrollbarReveal } from '@/lib/scrollbar-reveal';
import { installSwapReveal } from '@/lib/swap-reveal';
import { HttpError } from '@/lib/http';
import {
  getAppearancePrefsApi,
  setAppearancePrefsApi,
} from '@/lib/preferences/preferences.contract';
import { api } from '@/lib/contract/client';
import { getMyProfileDisplayApi } from '@/lib/profile/profile-extras.contract';

/* ------------------------------------------------------------------ */
/*  Session context – single useSession() call shared across the app  */
/* ------------------------------------------------------------------ */
type SessionCtxValue = ReturnType<typeof authClient.useSession>;

const SessionCtx = createContext<SessionCtxValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Persisted session cache                                            */
/*                                                                     */
/*  better-auth's useSession() starts out { data: null, isPending:    */
/*  true } on every fresh load and only resolves after a network      */
/*  round-trip — which makes the shell flash "signed out" for a       */
/*  moment. We persist the last-known user to localStorage and seed    */
/*  the context with it so the signed-in UI shows immediately, then    */
/*  let the live session take over (and self-heal if it's stale).     */
/*                                                                     */
/*  Only display fields are stored — never a token. This cache is a   */
/*  hint for rendering the shell, never proof of anything: every       */
/*  privileged read is authorized server-side against the session      */
/*  cookie, so a hand-edited entry buys nothing but a wrong avatar     */
/*  until the live session corrects it.                                */
/*                                                                     */
/*  It has nothing to offer a SIGNED-OUT visitor — there is no user    */
/*  to remember — which is why their pending state is answered from    */
/*  the server's own lookup instead (see `effectiveSession`).          */
/* ------------------------------------------------------------------ */
const CACHED_USER_KEY = 'rmh-auth-user';

type CachedSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  handle?: string | null;
  username?: string | null;
  isAdmin?: boolean;
  isVerified?: boolean;
  tier?: string | null;
};

function readCachedUser(): CachedSessionUser | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as CachedSessionUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: CachedSessionUser | null) {
  try {
    if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // ignore (private mode / storage disabled)
  }
}

/**
 * `localStorage` for the theme hydrate/persist effects below, which must never throw: storage
 * that is full, disabled, or blocked outright (Safari with "Block all cookies" throws on any
 * access) once crashed the whole provider tree into the error page on every route. A failed
 * read is `null` (the pre-paint script's defaults stand); a failed write is dropped and the
 * DOM still updates, so a choice holds for the visit.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* dropped: see above */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* dropped: see above */
    }
  },
};

/** Use this instead of authClient.useSession() in navigation/shell components. */
export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) return { data: null as null, isPending: true };
  return { data: ctx.data, isPending: ctx.isPending };
}

/* ------------------------------------------------------------------ */
/*  Resolved user display – fetches custom image/name from profile    */
/* ------------------------------------------------------------------ */
interface ResolvedUserDisplay {
  name: string | null;
  image: string | null;
  handle: string | null;
}

interface ResolvedUserCtxValue {
  resolved: ResolvedUserDisplay | null;
  refresh: () => void;
}

const ResolvedUserCtx = createContext<ResolvedUserCtxValue>({
  resolved: null,
  refresh: () => {},
});

/**
 * Returns the current user's resolved display data (custom image/name with
 * fallback to OAuth data). Call `refresh()` after profile updates.
 */
export function useResolvedUser() {
  return useContext(ResolvedUserCtx);
}

interface ProvidersProps {
  children: ReactNode;
  /**
   * User resolved on the server from the session cookie during SSR. Seeds the
   * shell so the very first painted HTML (and the first client render) is
   * already signed-in — no "signed out" flash on refresh.
   */
  initialUser?: CachedSessionUser | null;
  /**
   * Whether the server actually resolved the session. `false` means the lookup
   * failed or timed out — the session is UNKNOWN, not absent — so the shell
   * must render its pending state rather than the signed-out one.
   */
  sessionResolved?: boolean;
  /**
   * Locale resolved server-side (from the rmh-lang cookie or Accept-Language
   * header). Passed to AppI18nProvider so all useTranslation() calls in the
   * tree render in the correct language from the first paint.
   */
  locale?: Locale;
  /**
   * The active language's resource bundle, serialized by the server for the first
   * render (non-en only — en is always bundled client-side). Passed straight to
   * AppI18nProvider so the client i18n initializes synchronously with the same
   * translations the server rendered (no hydration mismatch, no flash).
   */
  i18nResources?: LocaleBundle | null;
}

const STYLE_CLASSES = SITE_STYLES.map((s) => `style-${s.id}`);

// framer-motion feature bundle, loaded on demand so the animation/gesture/layout
// drivers stay out of the initial bundle. Every component ships the lightweight
// `m` component (aliased as `motion`) and picks these up from LazyMotion context.
const loadMotionFeatures = () => import('@/lib/motion-features').then((mod) => mod.default);

// THEME_BG (theme → document background color) lives in stores/themeStore.ts,
// derived from SITE_STYLES, so the runtime and the no-flash inline script share
// one source.

export {
  THEME_EXCLUDED_ROUTES,
  THEME_EXCLUDED_EXCEPTIONS,
  isAppThemeRoute,
} from '@/lib/prepaint/theme-routes';

export function Providers({
  children,
  initialUser = null,
  sessionResolved = true,
  locale = 'en',
  i18nResources = null,
}: ProvidersProps) {
  // The router's QueryClient (lib/query/make-query-client.ts): built once per SSR request and once
  // per page load in getRouter(), so route loaders seed the same cache the components read.
  const queryClient = useRouter().options.context.queryClient;
  // Lets the globe eversion's AFTER readiness gate ask whether the destination still has queries
  // loading (lib/query-client-ref.ts: a variable and a type, nothing to bundle).
  useEffect(() => {
    setSharedQueryClient(queryClient);
    return () => setSharedQueryClient(null);
  }, [queryClient]);
  const session = authClient.useSession();
  const style = useThemeStore((s) => s.style);
  const preview = useThemeStore((s) => s.preview);
  const accent = useThemeStore((s) => s.accent);
  const fontScale = useThemeStore((s) => s.fontScale);
  const density = useThemeStore((s) => s.density);
  const readableFont = useThemeStore((s) => s.readableFont);
  const customAccent = useThemeStore((s) => s.customAccent);
  const colorVision = useThemeStore((s) => s.colorVision);
  const navTransition = useThemeStore((s) => s.navTransition);
  const alwaysEvertGlobe = useThemeStore((s) => s.alwaysEvertGlobe);
  const eversionLevel = useThemeStore((s) => s.eversionLevel);
  const jellyMotion = useThemeStore((s) => s.jellyMotion);
  const electricArcs = useThemeStore((s) => s.electricArcs);
  const userTheme = useThemeStore((s) => s.userTheme);
  const userThemePreview = useThemeStore((s) => s.userThemePreview);
  const { pathname } = useLocation();
  const isFirstRun = useRef(true);

  // Native snapshots normally finish in 380ms. If a browser drops the
  // `finished` signal during navigation, give the intended morph time to end and
  // then force its shared-element name/snapshot/classes to settle. This also
  // covers route changes that were not initiated through ViewTransitionLink.
  useEffect(() => {
    const recovery = window.setTimeout(recoverViewTransition, 700);
    return () => window.clearTimeout(recovery);
  }, [pathname]);

  // A single rAF-throttled listener gives the monochrome spatial backdrop its
  // restrained depth response. It automatically stands down for reduced motion,
  // and — because it publishes an inherited custom property on <html>, which
  // invalidates the whole document's style on every write — it attaches nothing
  // at all on a page with no consumer for it. `pathname` re-runs that check.
  useSpatialParallax(pathname);

  // The backdrop stays still; bounded material responses live on surfaces.
  useLiquidBackground();
  // Mounts the pointer variable (`--px` / `--py` for the CSS soft body and woken haze) and the lazy click arcs — see
  // hooks/useJellyPointer.ts. The rest of the material is CSS.
  // The TF2 HUD Editor is deliberately plain Team Fortress 2 — it installs none of the jelly.
  useJellyPointer(!isNativeMaterialRoute(pathname));
  // The CSS-only material (the woken haze) has no install step to skip, so a native-material route is marked on <html>
  // instead and the material's rules are scoped off it. Stamped pre-paint by __root.tsx on a hard load; this keeps it
  // in step on client navigation and clears it on the way out.
  useEffect(() => syncNativeMaterialClass(document.documentElement, pathname), [pathname]);
  // Remember whether this browser draws in software (the globe's CSS fallback, the games' glow); the material ignores it.
  useSoftRenderSettle();

  // The eversion state layer's input (globals.css §7.3): where each `data-evert` control turns inside out from
  // (the pointer's entry, the finger, the exit) and when a press is down. Delegated, passive, no frame loop.

  // Sync the locale store to the SSR-resolved locale and reconcile <html lang/dir>
  // so a user whose locale was resolved via Accept-Language (no cookie yet) gets
  // the correct layout direction from the first client render onward.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      applyHtmlLangDir(locale, document.documentElement);
      writeLocaleCookie(locale);
    }
    useLocaleStore.setState({ locale });
  }, [locale]);

  // Seed the known user from the server-resolved session so the shell renders
  // signed-in on the first paint (SSR) and the first client render — matching
  // markup, no hydration mismatch, no flash. `initialUser` is authoritative
  // for that first frame because the server read the actual session cookie; we
  // only fall back to the persisted localStorage copy when the server didn't
  // provide one (e.g. a client-only render path).
  const [cachedUser, setCachedUser] = useState<CachedSessionUser | null>(initialUser);
  useEffect(() => {
    if (initialUser) return;
    // The server resolving to NOBODY is an answer, not a gap. A stale copy in
    // localStorage must not override it — that is a signed-out visitor watching
    // the shell paint signed-in and then snap back a frame later. Drop the copy
    // instead; the server just told us it is wrong.
    if (sessionResolved) {
      writeCachedUser(null);
      return;
    }
    // Only when the server could NOT resolve (failed or timed out) is the
    // persisted user the best guess available.
    const stored = readCachedUser();
    if (stored) setCachedUser(stored);
  }, [initialUser, sessionResolved]);

  // Persist the live session whenever it resolves (and clear it on sign-out).
  const liveUser = session.data?.user;
  useEffect(() => {
    if (session.isPending) return;
    if (liveUser) {
      const snapshot: CachedSessionUser = {
        id: liveUser.id,
        name: liveUser.name,
        email: liveUser.email,
        image: liveUser.image,
        handle: (liveUser as { handle?: string | null }).handle,
        username: (liveUser as { username?: string | null }).username,
        isAdmin: (liveUser as { isAdmin?: boolean }).isAdmin,
        isVerified: (liveUser as { isVerified?: boolean }).isVerified,
        tier: (liveUser as { tier?: string | null }).tier,
      };
      writeCachedUser(snapshot);
      setCachedUser(snapshot);
    } else {
      writeCachedUser(null);
      setCachedUser(null);
    }
  }, [session.isPending, liveUser]);

  // Effective session handed to the rest of the app: while the live session is
  // still loading, fall back to the persisted user so nothing flashes as
  // signed-out. Once the real session resolves it always wins.
  const effectiveSession = useMemo<SessionCtxValue>(() => {
    if (session.isPending && cachedUser) {
      return {
        ...session,
        isPending: false,
        data: { user: cachedUser, session: null },
      } as unknown as SessionCtxValue;
    }
    // The server read the cookie and found nobody, and we have never seen a
    // live session. Signed-out is KNOWN from the first frame, so say so.
    //
    // Falling through to better-auth's raw state here is what made every
    // signed-out visit start on a spinner: its `useSession()` begins
    // `{ data: null, isPending: true }` and only settles after a network
    // round-trip, so `isPending` stayed true for a visitor the SERVER had
    // already answered for. Everything gated on it rendered its loading branch
    // and then re-rendered — the feed composer painted its full-height
    // signed-in placeholder and snapped to the short sign-in card a frame later.
    //
    // `!session.data` keeps this to the cold signed-out case: once a session
    // has ever landed, a later refetch goes through `cachedUser` above instead
    // of being reported as signed out.
    if (sessionResolved && !initialUser && session.isPending && !session.data) {
      return { ...session, isPending: false, data: null } as unknown as SessionCtxValue;
    }
    // Server couldn't resolve the session and we have no cached user: the
    // answer is UNKNOWN. Report pending (not signed out) until the client
    // session lands, so the shell shows a neutral placeholder instead of
    // telling a signed-in visitor to sign in.
    if (!sessionResolved && session.isPending && !cachedUser) {
      return { ...session, isPending: true, data: null } as unknown as SessionCtxValue;
    }
    return session;
  }, [session, cachedUser, sessionResolved, initialUser]);

  // Resolved user display data (custom image/name). Seed from the SSR-resolved
  // user so the current user's own avatar/name paint immediately from the loader
  // payload instead of flashing empty until /api/profile/me resolves; the fetch
  // below still runs to layer on any custom displayName/customImage overrides.
  // Same seed on server and client, so no hydration mismatch.
  const [resolvedUser, setResolvedUser] = useState<ResolvedUserDisplay | null>(
    initialUser
      ? {
          name: initialUser.name ?? null,
          image: initialUser.image ?? null,
          handle: initialUser.handle ?? null,
        }
      : null,
  );
  const fetchResolvedUser = useCallback(() => {
    api(getMyProfileDisplayApi, { retries: 0 })
      .then((data) => {
        setResolvedUser(data);
      })
      .catch(() => {});
  }, []);

  const userId = effectiveSession.data?.user?.id;
  // These two reads only *overlay* data the SSR shell already seeded (display
  // name/avatar, account theme), so defer them to idle — the feed and its images
  // own the hydration window.
  const idleReady = useIdleReady();
  useEffect(() => {
    if (userId) {
      if (idleReady) fetchResolvedUser();
    } else {
      setResolvedUser(null);
    }
  }, [userId, idleReady, fetchResolvedUser]);

  // Referral attribution: /ref/$code stashes an invite code before sign-up;
  // claim it once a session exists (works for email and OAuth flows alike).
  // The key is cleared on any server verdict and kept only on network failure
  // so a flaky connection can retry on the next load.
  useEffect(() => {
    if (!userId) return;
    let code: string | null;
    try {
      code = localStorage.getItem('rmh-ref');
    } catch {
      return;
    }
    if (!code) return;
    fetch('/api/referrals/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    })
      .then((res) => {
        if (res.status !== 429) localStorage.removeItem('rmh-ref');
      })
      .catch(() => {});
  }, [userId]);

  // A 404 the ROOT renders is a site page whatever its URL: `NotFound` is drawn
  // in `--site-*` tokens, so an app-tier ground under it is a dark field around a
  // Daylight card. The pre-paint script makes the same call from the same flag
  // (`notFoundThemeScript` in `__root.tsx`), so the two agree from frame 0.
  const globalNotFound = useRouterState({ select: (s) => s.matches[0]?._notFound === true });
  const isAppRoute = isAppThemeRoute(pathname) && !globalNotFound;

  // `html.app-route` resolves the site surfaces to their opaque twins, withholds
  // `scrollbar-gutter: stable` and gates the aurora off — all three visible from
  // the first frame, all three in `app/globals.css`.
  //
  // The class is now stamped pre-paint by `themeScript` in `__root.tsx` from the
  // same `app` boolean that picks the ground, so on a hard load this `toggle`
  // runs with an unchanged value and does not invalidate style. It is kept — and
  // must be — for the two cases the inline script cannot reach: a CLIENT
  // navigation from a site page into a game (the script runs once per document,
  // not once per route) and the recovery path if that script threw. Before the
  // pre-paint stamp existed this was the only writer, so every game loaded with
  // translucent surfaces over its own backdrop, a reserved scrollbar gutter and a
  // live aurora, then snapped out of all three after hydration. See the
  // `app-route` section of that script's docblock.
  useEffect(() => {
    document.documentElement.classList.toggle('app-route', isAppRoute);
  }, [isAppRoute]);

  // Scrollbars reveal on scroll rather than sitting on screen permanently
  // (lib/scrollbar-reveal.ts + the §Scrollbars block in app/globals.css).
  useEffect(() => installScrollbarReveal(), []);

  // Content that replaces a skeleton/spinner fades in rather than snapping in —
  // what a slow connection makes visible on every loading state (lib/swap-reveal).
  useEffect(() => installSwapReveal(), []);

  // Hydrate style from localStorage on mount. Self-heal legacy values: any
  // retired style still persisted from before a catalog change (e.g. the old
  // `liquid-glass` id, now folded into `default`, or the retired novelty themes)
  // falls back to the site default (DEFAULT_STYLE) and is rewritten so it
  // doesn't linger.
  useEffect(() => {
    const stored = safeStorage.getItem('rmh-style');
    if (stored && SITE_STYLES.some((s) => s.id === stored)) {
      useThemeStore.getState().setStyle(stored as SiteStyle);
    } else if (stored) {
      safeStorage.setItem('rmh-style', DEFAULT_STYLE);
      useThemeStore.getState().setStyle(DEFAULT_STYLE);
    }
    const storedAccent = safeStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentId(storedAccent)) {
      useThemeStore.getState().setAccent(storedAccent);
    }
    // Comfort suite (§13) — hydrate from the no-flash localStorage cache.
    const st = useThemeStore.getState();
    const fs = Number(safeStorage.getItem(FONT_SCALE_KEY));
    if ([875, 1000, 1125, 1250].includes(fs)) st.setFontScale(fs);
    if (safeStorage.getItem(DENSITY_KEY) === 'compact') st.setDensity('compact');
    if (safeStorage.getItem(READABLE_FONT_KEY) === '1') st.setReadableFont(true);
    const ca = safeStorage.getItem(CUSTOM_ACCENT_KEY);
    if (ca && HEX_RE.test(ca)) st.setCustomAccent(ca);
    const cv = safeStorage.getItem(COLOR_VISION_KEY);
    if (isColorVisionMode(cv)) st.setColorVision(cv);
    const nt = safeStorage.getItem(NAV_TRANSITION_KEY);
    if (isNavTransition(nt)) st.setNavTransition(nt);
    if (safeStorage.getItem(ALWAYS_EVERT_GLOBE_KEY) === '1') st.setAlwaysEvertGlobe(true);
    const el = safeStorage.getItem(EVERSION_LEVEL_KEY);
    if (isEversionLevel(el)) st.setEversionLevel(el);
    const jm = safeStorage.getItem(JELLY_MOTION_KEY);
    if (isJellyMotion(jm)) st.setJellyMotion(jm);
    const ea = safeStorage.getItem(ELECTRIC_ARCS_KEY);
    if (isElectricArcs(ea)) st.setElectricArcs(ea);
    // The globe cursor and its per-device settings were removed (2026-11-08): drop the stale key so devices do not keep
    // dead data. Nothing reads it any more. Safe to delete once every device that ever stored it has loaded the site.
    try {
      localStorage.removeItem('rmh-globe-cursor');
    } catch {
      /* storage blocked — nothing to clean */
    }
    // Marketplace user theme (§14): the no-flash script already painted it; hydrate
    // the store so the runtime effect keeps it applied and can clear it on removal.
    try {
      const raw = safeStorage.getItem(USER_THEME_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppliedUserTheme;
        if (
          parsed &&
          typeof parsed.id === 'string' &&
          parsed.vars &&
          typeof parsed.bg === 'string'
        ) {
          st.setUserTheme(parsed);
        }
      }
    } catch {
      /* corrupt cache — ignore, the built-in theme shows through */
    }
  }, []);

  // Sync style class + accent override to <html> and persist. `preview` (the
  // gallery's hover "try it on") is rendered in place of the committed style but
  // never persisted, so hovering a swatch previews instantly without saving.
  useEffect(() => {
    // On the very first render the Zustand store still holds DEFAULT_STYLE
    // because localStorage hasn't hydrated yet. The inline ThemeScript
    // already applied the correct class, background colour, meta tag, and
    // accent — touching ANYTHING here would flash the wrong colour and Safari
    // (iOS 26+) derives its bar tint from the body background-color on
    // the first paint, so a single wrong frame is enough to break it.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const html = document.documentElement;
    const activeStyle = preview ?? style;
    // Remove all style classes
    html.classList.remove(...STYLE_CLASSES);
    // Add active style class only on non-app pages (default needs no class — uses :root tokens)
    if (activeStyle !== 'default' && !isAppRoute) {
      html.classList.add(`style-${activeStyle}`);
    }
    // Persist the COMMITTED style (not a transient preview).
    safeStorage.setItem('rmh-style', style);

    // Marketplace user theme (§14): a full v2 retint set inline over the built-in
    // cascade (a transient preview beats the committed one). Skipped on app/game
    // routes (they own their palette). Accent presets are applied AFTER this
    // block so they still win.
    const activeUserTheme = userThemePreview ?? userTheme;
    const userThemeOn = !!activeUserTheme && !isAppRoute;
    if (userThemeOn && activeUserTheme) {
      for (const [k, v] of Object.entries(activeUserTheme.vars)) html.style.setProperty(k, v);
    } else {
      clearThemeTokens(html);
    }
    // Persist only the COMMITTED theme (not a transient preview) for the no-flash script.
    if (userTheme) safeStorage.setItem(USER_THEME_KEY, JSON.stringify(userTheme));
    else safeStorage.removeItem(USER_THEME_KEY);

    // Glass clarity is retired. Clear old device overrides, including during HMR;
    // OS transparency preferences and high contrast still apply in the material layer.
    html.classList.remove('reduce-transparency');
    html.style.removeProperty('--glass-user-blur');
    html.style.removeProperty('--glass-user-tint');
    safeStorage.removeItem('rmh-glass-level');
    safeStorage.removeItem('rmh-reduce-transparency');
    safeStorage.removeItem('rmh-reduce-motion');

    // Accent override: apply on content pages; clear on app/game routes (they own
    // their palette) and when no accent is chosen. applyAccent no-ops safely for a
    // null/unknown id by clearing the tokens.
    applyAccent(html, isAppRoute ? null : accent);
    if (isAccentId(accent)) safeStorage.setItem(ACCENT_STORAGE_KEY, accent);
    else safeStorage.removeItem(ACCENT_STORAGE_KEY);

    // ── Comfort suite (§13) ──────────────────────────────────────────────
    if (fontScale && fontScale !== 1000) {
      html.style.fontSize = `${fontScale / 10}%`;
      safeStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } else {
      html.style.removeProperty('font-size');
      safeStorage.removeItem(FONT_SCALE_KEY);
    }
    if (density === 'compact') {
      html.setAttribute('data-density', 'compact');
      safeStorage.setItem(DENSITY_KEY, 'compact');
    } else {
      html.removeAttribute('data-density');
      safeStorage.removeItem(DENSITY_KEY);
    }
    html.classList.toggle('readable-font', readableFont);
    if (readableFont) safeStorage.setItem(READABLE_FONT_KEY, '1');
    else safeStorage.removeItem(READABLE_FONT_KEY);
    // Colour-vision mode retints the semantic tokens via a data attribute the
    // theme cascade reads (see globals.css). Cached in localStorage so the
    // no-flash script in __root.tsx can apply it before first paint — without
    // that, a viewer who can't distinguish the default palette would see the
    // wrong status colours for a frame on every navigation.
    applyColorVision(html, colorVision);
    if (colorVision !== 'none') safeStorage.setItem(COLOR_VISION_KEY, colorVision);
    else safeStorage.removeItem(COLOR_VISION_KEY);
    // Eversion transition choice: cache only (no DOM effect) so the controller can
    // read it synchronously; the default is expressed by absence.
    if (navTransition !== DEFAULT_NAV_TRANSITION)
      safeStorage.setItem(NAV_TRANSITION_KEY, navTransition);
    else safeStorage.removeItem(NAV_TRANSITION_KEY);
    if (alwaysEvertGlobe) safeStorage.setItem(ALWAYS_EVERT_GLOBE_KEY, '1');
    else safeStorage.removeItem(ALWAYS_EVERT_GLOBE_KEY);
    if (eversionLevel !== DEFAULT_EVERSION_LEVEL)
      safeStorage.setItem(EVERSION_LEVEL_KEY, eversionLevel);
    else safeStorage.removeItem(EVERSION_LEVEL_KEY);
    // Plasmatic Jelly (R8/R9): stamped on <html> for the jelly/arc runtimes and
    // cached for the pre-paint script; both express the default by absence.
    applyJellyMotion(html, jellyMotion);
    if (jellyMotion !== DEFAULT_JELLY_MOTION) safeStorage.setItem(JELLY_MOTION_KEY, jellyMotion);
    else safeStorage.removeItem(JELLY_MOTION_KEY);
    applyElectricArcs(html, electricArcs);
    if (electricArcs !== DEFAULT_ELECTRIC_ARCS)
      safeStorage.setItem(ELECTRIC_ARCS_KEY, electricArcs);
    else safeStorage.removeItem(ELECTRIC_ARCS_KEY);
    // Custom accent (raw hex) overrides the preset accent applied just above.
    if (customAccent && HEX_RE.test(customAccent) && !isAppRoute) {
      const { hex, fg } = ensureReadableAccent(customAccent);
      for (const [name, val] of Object.entries(accentCssVars(hex, fg)))
        html.style.setProperty(name, val);
      safeStorage.setItem(CUSTOM_ACCENT_KEY, customAccent);
    } else {
      safeStorage.removeItem(CUSTOM_ACCENT_KEY);
    }

    // Excluded app/game routes keep their own document background so the browser
    // bar tint and overscroll match their :root-token chrome — same gate as the
    // inline themeScript in app/routes/__root.tsx, and the same `APP_ROUTE_*`
    // resolution, because until this consulted it too the script pre-painted a
    // light page's real ground and this effect flipped it to APP_THEME_BG a
    // moment later. Anything without an entry keeps that near-black default.
    const ground = isAppRoute ? appRouteGround(pathname) : null;
    const bg = userThemeOn
      ? (activeUserTheme as AppliedUserTheme).bg
      : isAppRoute
        ? (ground?.bg ?? APP_THEME_BG)
        : (THEME_BG[activeStyle] ?? THEME_BG[DEFAULT_STYLE]);

    // Paints <html>/<body>, publishes `data-app-dark` for a page whose own
    // stylesheet keys its tokens off it, pins `color-scheme` to the background's
    // luminance and mirrors the tint into our `theme-color` tag. Shared with the
    // pages that own their light/dark, which have to repaint on a toggle without
    // waiting for this effect — it does not re-run on every pathname change.
    paintDocumentGround(bg, ground ? ground.dark : null);
    // `pathname` is read but deliberately not a dependency: crossing INTO or OUT
    // OF the app tier is the only navigation that can change the ground, and
    // `isAppRoute` already flips on exactly that — so the effect re-runs, in the
    // same render, with the current pathname. Listing `pathname` instead would
    // re-run this whole block (twelve localStorage reads, a class sweep, the
    // theme-color tag) on every route change in the app, for a value that could
    // not have changed. Two app-tier routes with different grounds linking
    // directly to each other would be the gap; there are none, and a full load
    // resolves it through the pre-paint script regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    style,
    preview,
    accent,
    isAppRoute,
    fontScale,
    density,
    readableFont,
    customAccent,
    colorVision,
    navTransition,
    alwaysEvertGlobe,
    eversionLevel,
    jellyMotion,
    electricArcs,
    userTheme,
    userThemePreview,
  ]);

  // ── Account sync ─────────────────────────────────────────────────────────
  // Appearance follows the signed-in user across devices. On sign-in we pull the
  // saved theme/accent; the account wins when it has a value, otherwise the
  // current device value is kept (and seeded up so the account isn't left empty).
  const appearanceSyncedRef = useRef(false);
  const lastSavedAppearanceRef = useRef<{
    style: string;
    accent: string | null;
  } | null>(null);

  // Fire-and-forget PUT of the appearance to the account, recording it as the
  // last-saved value so the change-watcher below never echoes it straight back.
  const saveAppearance = useCallback((next: { style: string; accent: string | null }) => {
    lastSavedAppearanceRef.current = next;
    api(setAppearancePrefsApi, { body: next }).catch((err) => {
      console.error('Appearance save failed:', err);
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      appearanceSyncedRef.current = false;
      lastSavedAppearanceRef.current = null;
      return;
    }
    // The inline FOUC script already applied this device's saved theme pre-paint;
    // the account sync only reconciles across devices, so it can wait for idle.
    if (!idleReady) return;
    let cancelled = false;
    api(getAppearancePrefsApi)
      .catch((err: unknown) => {
        // A failed GET is not "no saved preferences" — it means the account's
        // appearance is unknown. Swallowing it silently is how a 500 on every
        // signed-in page load (a missing column, see the appearance migration)
        // went unnoticed while cross-device settings quietly stopped syncing.
        if (err instanceof HttpError && err.status !== 401) {
          console.error(`Appearance sync failed: ${err.status}`);
        }
        return null;
      })
      .then((remote) => {
        if (cancelled || !remote) return;
        const store = useThemeStore.getState();
        // The account wins where it has a saved value; otherwise this device's
        // current value is kept.
        const nextStyle =
          remote.style && SITE_STYLES.some((s) => s.id === remote.style)
            ? (remote.style as SiteStyle)
            : store.style;
        const nextAccent = isAccentId(remote.accent) ? remote.accent : store.accent;
        if (remote.style !== nextStyle || remote.accent !== nextAccent) {
          // Server was missing a value this device has → seed the account with the
          // merged result (also records it as last-saved).
          saveAppearance({
            style: nextStyle,
            accent: nextAccent,
          });
        } else {
          lastSavedAppearanceRef.current = {
            style: nextStyle,
            accent: nextAccent,
          };
        }
        store.setStyle(nextStyle);
        store.setAccent(nextAccent);
        // Comfort suite (§13): apply account values on this device (account
        // wins where set; the settings panel persists device changes).
        const r = remote as typeof remote & {
          fontScale?: number | null;
          density?: string | null;
          readableFont?: boolean | null;
          customAccent?: string | null;
          colorVision?: string | null;
          navTransition?: string | null;
          alwaysEvertGlobe?: boolean | null;
          eversionLevel?: string | null;
          jellyMotion?: string | null;
          electricArcs?: string | null;
        };
        if ([875, 1000, 1125, 1250].includes(Number(r.fontScale)))
          store.setFontScale(Number(r.fontScale));
        if (r.density === 'compact' || r.density === 'cozy') store.setDensity(r.density);
        if (typeof r.readableFont === 'boolean') store.setReadableFont(r.readableFont);
        if (typeof r.customAccent === 'string' && HEX_RE.test(r.customAccent))
          store.setCustomAccent(r.customAccent);
        if (isColorVisionMode(r.colorVision)) store.setColorVision(r.colorVision);
        if (isNavTransition(r.navTransition)) store.setNavTransition(r.navTransition);
        if (typeof r.alwaysEvertGlobe === 'boolean') store.setAlwaysEvertGlobe(r.alwaysEvertGlobe);
        if (isEversionLevel(r.eversionLevel)) store.setEversionLevel(r.eversionLevel);
        if (isJellyMotion(r.jellyMotion)) store.setJellyMotion(r.jellyMotion);
        if (isElectricArcs(r.electricArcs)) store.setElectricArcs(r.electricArcs);
        appearanceSyncedRef.current = true;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, idleReady, saveAppearance]);

  // Persist later appearance changes (theme gallery, accent picker, command
  // palette) for signed-in users. Guarded so it never fires before the initial
  // sync and never re-saves a value we just pulled from the server.
  useEffect(() => {
    if (!userId || !appearanceSyncedRef.current) return;
    const last = lastSavedAppearanceRef.current;
    if (last && last.style === style && last.accent === accent) return;
    saveAppearance({ style, accent });
  }, [style, accent, userId, saveAppearance]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppI18nProvider locale={locale} resources={i18nResources}>
        {/* Load framer-motion features lazily so they're off the initial bundle. */}
        <LazyMotion features={loadMotionFeatures}>
          {/* One shared animation scheme for every account and device. */}
          <MotionConfig reducedMotion="never">
            <SessionCtx.Provider value={effectiveSession}>
              <AppTierContext.Provider value={isAppRoute}>
                <ResolvedUserCtx.Provider
                  value={{ resolved: resolvedUser, refresh: fetchResolvedUser }}
                >
                  <ConfirmProvider>
                    {children}
                    {/* Globally-mounted, non-critical chrome. Isolate it so a throw
                      in the command palette / recents tracker / theme-preview bar
                      is reported and swallowed instead of bubbling to the root
                      errorComponent and taking down the whole app. `children`
                      (the page) is deliberately OUTSIDE this boundary — primary
                      content must still surface a real route-level error. */}
                    <SilentErrorBoundary label="global-chrome">
                      <CommandPaletteMount />
                      <RecentsTracker />
                      <PlaytimeTracker />
                      <PatchNotesMount />
                      {/* §14: the floating try-before-buy / preview-on-site confirm bar,
                        mounted globally so it survives navigation under a previewed theme. */}
                      <ThemePreviewBar />
                      {/* Voice calls. Mounted here for the same reason: an
                        incoming call has to ring wherever the user is, and
                        answering one must survive navigating away. */}
                      <CallMount />
                      <GroupCallMount />
                      <AccessMount />
                      <DelightMount />
                    </SilentErrorBoundary>
                  </ConfirmProvider>
                </ResolvedUserCtx.Provider>
                <Toaster
                  theme={style === 'graphite' ? 'dark' : 'light'}
                  position="bottom-left"
                  // The bottom lane is SHARED, and sonner does not know that.
                  //
                  // Left to its defaults, sonner sits 16px off the bottom edge at
                  // `z-index: 999999999` — above everything — and below 600px it
                  // rewrites `bottom-left` to span the WHOLE bottom edge. That is
                  // the hub orb's lane: the orb is
                  // `bottom: calc(env(safe-area-inset-bottom) + var(--site-hub-orb-inset))`
                  // and 60px tall, so on a 390px phone a toast covered it almost
                  // entirely for its four-second life — and the orb is the site's
                  // only navigation control on mobile. The same 16px also lands
                  // inside the iOS home-indicator strip, so swipe-to-dismiss
                  // fought the system home gesture, and a toast raised from inside
                  // a bottom sheet covered the sheet's own confirm/cancel row.
                  //
                  // `--site-floating-reserve` is derived from the orb's own
                  // geometry tokens (globals.css §5.5x), so this clears the orb by
                  // construction and cannot drift if the orb is resized. It
                  // already includes the safe-area inset — do not add it twice.
                  offset={{ bottom: 'var(--site-floating-reserve)' }}
                  mobileOffset={{
                    bottom: 'var(--site-floating-reserve)',
                    left: '0.75rem',
                    right: '0.75rem',
                  }}
                  toastOptions={{
                    // Toasts are L4 floating UI and get the matching fill inline. It is written out here rather than by
                    // adding `.glass-overlay` because that class also sets position, max sizes and overflow — all of
                    // which sonner owns for its own stacking. The jelly material (haze floor, CSS rim, carrier) comes
                    // from `[data-sonner-toast]` in app/jelly-coverage.css, so only longhands are set here: a
                    // `background` / `box-shadow` inline would erase the floor and the rim. No backdrop-filter — no
                    // glass role has one (docs/liquid-glass-system.md); the overlay fill is the legibility floor.
                    style: {
                      // The SAME expression `.glass-overlay` uses (globals.css §L4), not a third answer.
                      backgroundColor: 'var(--site-glass-overlay-fill)',
                      border: '1px solid var(--site-border)',
                      // A toast is a panel, not a control: `--site-radius`, the
                      // same curve every other floating panel takes.
                      borderRadius: 'var(--site-radius)',
                      color: 'var(--site-text)',
                    },
                  }}
                />
              </AppTierContext.Provider>
            </SessionCtx.Provider>
          </MotionConfig>
        </LazyMotion>
      </AppI18nProvider>
    </QueryClientProvider>
  );
}
