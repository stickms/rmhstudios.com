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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { MotionConfig, LazyMotion } from 'framer-motion';
import { Toaster } from 'sonner';
import { authClient } from '@/lib/auth-client';
import {
  useThemeStore,
  SITE_STYLES,
  THEME_BG,
  DEFAULT_STYLE,
  SiteStyle,
  REDUCE_TRANSPARENCY_KEY,
  USER_THEME_KEY,
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
  REDUCE_MOTION_KEY,
  GLASS_LEVEL_KEY,
  isGlassLevel,
  applyGlassLevel,
} from '@/lib/appearance/prefs';
import { useGlassLight } from '@/hooks/useGlassLight';
import { useLiquidBackground } from '@/hooks/useLiquidBackground';
import { useIdleReady } from '@/hooks/useIdleReady';
import { shouldUsePerfLite } from '@/lib/performance-tier';
import { useLocaleStore, writeLocaleCookie } from '@/stores/localeStore';
import { applyHtmlLangDir } from '@/lib/i18n/dom';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import { CommandPaletteMount } from '@/components/site/CommandPaletteMount';
import { ThemePreviewBar } from '@/components/themes/ThemePreviewBar';
import { RecentsTracker } from '@/components/site/RecentsTracker';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import type { Locale } from '@/lib/i18n/config';
import type { LocaleBundle } from '@/lib/i18n/resources';
import { recoverViewTransition } from '@/lib/view-transition';

// perf audit §4.3: build the QueryClient PER component instance (via useState
// below), not once at module scope. A module-scope client is shared by every
// concurrent SSR request on the server — it accumulates entries (gcTime holds
// them 10 min) across all users and is a latent cross-request cache-bleed
// hazard. useState(() => makeQueryClient()) gives a fresh client per server
// request while staying stable across client re-renders (the standard TanStack
// SSR pattern).
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 minute — serve cached data before refetching
        gcTime: 10 * 60_000, // keep unused data 10 min so back-nav doesn't refetch
        retry: 1,
        // Slow-WiFi friendly: don't re-hit the network just because the user
        // tab-switched. Reconnects still revalidate stale data.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

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

// Start fetching the optional shader chunk once the document's critical load is
// complete, then reuse the same promise when the idle gate starts it. This warms
// Vite's module cache without putting liquid glass on the load/LCP critical path.
// A rejected fetch is deliberately evicted so a later idle attempt can retry.
interface LiquidGLModule {
  initLiquidGL(): () => void;
}
let liquidGLImport: Promise<LiquidGLModule> | null = null;

function loadLiquidGL(): Promise<LiquidGLModule> {
  if (liquidGLImport) return liquidGLImport;
  const pending: Promise<LiquidGLModule> = import('@/lib/liquid-gl');
  const cached = pending.catch((error) => {
    if (liquidGLImport === cached) liquidGLImport = null;
    throw error;
  });
  liquidGLImport = cached;
  return cached;
}

// THEME_BG (theme → document background color) lives in stores/themeStore.ts,
// derived from SITE_STYLES, so the runtime and the no-flash inline script share
// one source. Excluded app/game routes always paint THEME_BG.default (pure
// black) — matching their :root tokens and the `.vibe-app`/`.vibe-screen`
// shells (a non-black document background there makes the browser bar tint and
// overscroll diverge from the app chrome, a bug we have shipped before).

/**
 * Routes where the site-wide theme must NOT be applied (apps/games own their
 * styling). Exported so the no-flash inline themeScript in app/routes/__root.tsx
 * can apply the same gate before hydration — necessary now that the default
 * style is a non-":root" theme (liquid-glass), which is applied as a class.
 */
export const THEME_EXCLUDED_ROUTES = [
  ...games.map((g) => g.href),
  ...apps.filter((a) => !a.usesSiteTheme).map((a) => a.href),
].filter((href) => href.startsWith('/'));

export function Providers({
  children,
  initialUser = null,
  locale = 'en',
  i18nResources = null,
}: ProvidersProps) {
  // Per-request/per-mount QueryClient (perf audit §4.3) — see makeQueryClient.
  const [queryClient] = useState(makeQueryClient);
  const session = authClient.useSession();
  const style = useThemeStore((s) => s.style);
  const preview = useThemeStore((s) => s.preview);
  const accent = useThemeStore((s) => s.accent);
  const reduceTransparency = useThemeStore((s) => s.reduceTransparency);
  const glassLevel = useThemeStore((s) => s.glassLevel);
  const fontScale = useThemeStore((s) => s.fontScale);
  const density = useThemeStore((s) => s.density);
  const readableFont = useThemeStore((s) => s.readableFont);
  const customAccent = useThemeStore((s) => s.customAccent);
  const reduceMotion = useThemeStore((s) => s.reduceMotion);
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

  // The pointer-tracked specular highlight for interactive glass — one
  // document-level rAF-throttled listener, mounted once here (§5.1).
  useGlassLight();

  // Makes the aurora canvas react to pointer / device motion with a gentle
  // parallax drift (pairs with the ambient `aurora-drift` flow in globals.css),
  // so the shared glass backdrop feels alive. Gated off under reduced motion and
  // on low-end devices. One rAF-throttled listener, mounted once here (§5.1).
  useLiquidBackground();

  // Device tiering (§6.4): a one-time heuristic demotes the glass on low-end
  // devices (drops refraction + pointer light, flattens L2 panes to L1 fills)
  // via CSS only — no component branches. Chrome keeps its blur (few elements,
  // carry the identity).
  useEffect(() => {
    const root = document.documentElement;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    // perf audit §6.4: widened from ≤4GB/≤4-core to ≤6GB/≤6-core so more
    // mid-range devices drop the expensive backdrop blur, and honor the
    // browser's Data Saver / reduced-data signal when present.
    // iPhones commonly expose six logical cores regardless of device class, so
    // the generic core-count heuristic classified even current flagship phones
    // as perf-lite and removed the visible liquid-glass treatment. iOS WebKit has
    // its own compositor-safe tier: keep the CSS glass material, while the GPU
    // canvas, native View Transitions, moving aurora and SVG lens are gated at
    // their respective sources. Explicit Data Saver still wins everywhere.
    const iosWebKit = root.classList.contains('ios-webkit');
    const lite = shouldUsePerfLite({
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      saveData: nav.connection?.saveData,
      iosWebKit,
    });
    root.classList.toggle('perf-lite', lite);
  }, []);

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
    if (!initialUser) {
      const stored = readCachedUser();
      if (stored) setCachedUser(stored);
    }
  }, [initialUser]);

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
    return session;
  }, [session, cachedUser]);

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
    fetch('/api/profile/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setResolvedUser(data);
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

  // Opportunistically warm the liquid runtime only after the window load event.
  // The handler returns immediately (it never awaits the chunk), so images,
  // fonts, hydration, and the load event are not held up by this enhancement.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const warm = () => {
      if (cancelled) return;
      void loadLiquidGL().catch(() => {});
    };
    if (document.readyState === 'complete') timer = window.setTimeout(warm, 0);
    else window.addEventListener('load', warm, { once: true });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('load', warm);
    };
  }, []);

  // Shader-grade liquid layer (§16.1). Initialised after idle from the optional
  // code-split chunk warmed above; it never gates the LCP/load path. It self-gates
  // (WebGPU→WebGL2→none, with WebKit WebGPU gated to fixed releases; off
  // under perf-lite / reduced motion / high-contrast / reduce-transparency) and,
  // when a tier initialises,
  // sets `html.liquid-gl` so the CSS aurora + goo underlays hide (no double
  // render). When no tier is available the untouched CSS/SVG stack renders.
  useEffect(() => {
    if (!idleReady) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let retryTimer = 0;
    let attempts = 0;
    const start = () => {
      attempts++;
      loadLiquidGL()
        .then((m) => {
          if (!cancelled) dispose = m.initLiquidGL();
        })
        .catch(() => {
          // A flaky chunk request should not disable glass for the whole visit.
          // Retry twice in the background; CSS remains the complete fallback.
          if (!cancelled && attempts < 3) {
            retryTimer = window.setTimeout(start, attempts * 1_500);
          }
        });
    };
    start();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      dispose?.();
    };
  }, [idleReady]);

  // Referral attribution: /ref/$code stashes an invite code before sign-up;
  // claim it once a session exists (works for email and OAuth flows alike).
  // The key is cleared on any server verdict and kept only on network failure
  // so a flaky connection can retry on the next load.
  useEffect(() => {
    if (!userId) return;
    let code: string | null = null;
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

  const isAppRoute = THEME_EXCLUDED_ROUTES.some((route) => pathname?.startsWith(route));

  // Toggle app-route class so CSS can disable scrollbar-gutter on game/app pages
  useEffect(() => {
    document.documentElement.classList.toggle('app-route', isAppRoute);
  }, [isAppRoute]);

  // Hydrate style from localStorage on mount. Self-heal legacy values: any
  // retired style still persisted from before a catalog change (e.g. the old
  // `liquid-glass` id, now folded into `default`, or the retired novelty themes)
  // falls back to the site default (DEFAULT_STYLE) and is rewritten so it
  // doesn't linger.
  useEffect(() => {
    const stored = localStorage.getItem('rmh-style');
    if (stored && SITE_STYLES.some((s) => s.id === stored)) {
      useThemeStore.getState().setStyle(stored as SiteStyle);
    } else if (stored) {
      localStorage.setItem('rmh-style', DEFAULT_STYLE);
      useThemeStore.getState().setStyle(DEFAULT_STYLE);
    }
    const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentId(storedAccent)) {
      useThemeStore.getState().setAccent(storedAccent);
    }
    if (localStorage.getItem(REDUCE_TRANSPARENCY_KEY) === '1') {
      useThemeStore.getState().setReduceTransparency(true);
    }
    // Glass clarity (§5.46): the stored stop wins; unset means Default (2) —
    // full glass. The launch-era migration mapped a legacy reduce-transparency
    // flag to stop 0 (Opaque), which surprised users into an opaque site; that
    // mapping is removed, and the exact state it produced (level 0 + legacy
    // flag together) is healed back to Default once. Deliberate Opaque picks
    // made after this fix never write the legacy key, so they are not healed.
    // True accessibility needs stay covered by prefers-reduced-transparency.
    // Read the raw string first: Number(null) coerces to 0, which would
    // hydrate a fresh visitor (no stored level) straight into Opaque — the
    // stored-value branches below must only run when a value actually exists.
    const glRaw = localStorage.getItem(GLASS_LEVEL_KEY);
    const gl = glRaw === null ? Number.NaN : Number(glRaw);
    if (gl === 0 && localStorage.getItem(REDUCE_TRANSPARENCY_KEY) === '1') {
      localStorage.removeItem(REDUCE_TRANSPARENCY_KEY);
      localStorage.setItem(GLASS_LEVEL_KEY, '2');
    } else if (isGlassLevel(gl)) {
      useThemeStore.getState().setGlassLevel(gl);
    }
    // Comfort suite (§13) — hydrate from the no-flash localStorage cache.
    const st = useThemeStore.getState();
    const fs = Number(localStorage.getItem(FONT_SCALE_KEY));
    if ([875, 1000, 1125, 1250].includes(fs)) st.setFontScale(fs);
    if (localStorage.getItem(DENSITY_KEY) === 'compact') st.setDensity('compact');
    if (localStorage.getItem(READABLE_FONT_KEY) === '1') st.setReadableFont(true);
    if (localStorage.getItem(REDUCE_MOTION_KEY) === '1') st.setReduceMotion(true);
    const ca = localStorage.getItem(CUSTOM_ACCENT_KEY);
    if (ca && HEX_RE.test(ca)) st.setCustomAccent(ca);
    // Marketplace user theme (§14): the no-flash script already painted it; hydrate
    // the store so the runtime effect keeps it applied and can clear it on removal.
    try {
      const raw = localStorage.getItem(USER_THEME_KEY);
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
    // On the very first render the Zustand store still holds "default"
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
    localStorage.setItem('rmh-style', style);

    // Marketplace user theme (§14): a full v2 retint set inline over the built-in
    // cascade (a transient preview beats the committed one). Skipped on app/game
    // routes (they own their palette) and under high-contrast (its opaque black/
    // white must win — inline vars would out-specify the class). Reduced-
    // transparency composes for free: it paints --site-surface-opaque, which the
    // theme sets. Accent presets are applied AFTER this block so they still win.
    const activeUserTheme = userThemePreview ?? userTheme;
    const userThemeOn = !!activeUserTheme && !isAppRoute && activeStyle !== 'high-contrast';
    if (userThemeOn && activeUserTheme) {
      for (const [k, v] of Object.entries(activeUserTheme.vars)) html.style.setProperty(k, v);
    } else {
      clearThemeTokens(html);
    }
    // Persist only the COMMITTED theme (not a transient preview) for the no-flash script.
    if (userTheme) localStorage.setItem(USER_THEME_KEY, JSON.stringify(userTheme));
    else localStorage.removeItem(USER_THEME_KEY);

    // Glass clarity (§5.46): the slider owns both the reduce-transparency class
    // (stop 0, the §10 degradation the glass keys off) AND the inline user
    // blur/tint factors (stops 1/3/4). Persisted for the no-flash script; the
    // legacy reduce-transparency key is kept in sync at stop 0 so an older client
    // or the no-flash fallback still turns glass off.
    applyGlassLevel(html, glassLevel);
    localStorage.setItem(GLASS_LEVEL_KEY, String(glassLevel));
    // Never write the legacy reduce-transparency key here: the level-0 heal in
    // the hydration effect keys on (level 0 + legacy flag) to identify the
    // launch-era migration state, so a deliberate Opaque pick must not recreate
    // that pair.
    localStorage.removeItem(REDUCE_TRANSPARENCY_KEY);

    // Accent override: apply on content pages; clear on app/game routes (they own
    // their palette) and when no accent is chosen. applyAccent no-ops safely for a
    // null/unknown id by clearing the tokens.
    applyAccent(html, isAppRoute ? null : accent);
    if (isAccentId(accent)) localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    else localStorage.removeItem(ACCENT_STORAGE_KEY);

    // ── Comfort suite (§13) ──────────────────────────────────────────────
    if (fontScale && fontScale !== 1000) {
      html.style.fontSize = `${fontScale / 10}%`;
      localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } else {
      html.style.removeProperty('font-size');
      localStorage.removeItem(FONT_SCALE_KEY);
    }
    if (density === 'compact') {
      html.setAttribute('data-density', 'compact');
      localStorage.setItem(DENSITY_KEY, 'compact');
    } else {
      html.removeAttribute('data-density');
      localStorage.removeItem(DENSITY_KEY);
    }
    html.classList.toggle('readable-font', readableFont);
    if (readableFont) localStorage.setItem(READABLE_FONT_KEY, '1');
    else localStorage.removeItem(READABLE_FONT_KEY);
    html.classList.toggle('reduce-motion', reduceMotion);
    if (reduceMotion) localStorage.setItem(REDUCE_MOTION_KEY, '1');
    else localStorage.removeItem(REDUCE_MOTION_KEY);
    // Custom accent (raw hex) overrides the preset accent applied just above.
    if (customAccent && HEX_RE.test(customAccent) && !isAppRoute) {
      const { hex, fg } = ensureReadableAccent(customAccent);
      for (const [name, val] of Object.entries(accentCssVars(hex, fg)))
        html.style.setProperty(name, val);
      localStorage.setItem(CUSTOM_ACCENT_KEY, customAccent);
    } else {
      localStorage.removeItem(CUSTOM_ACCENT_KEY);
    }

    // Excluded app/game routes keep the base (dark) document background so the
    // browser bar tint and overscroll match their :root-token chrome — same
    // gate as the inline themeScript in app/routes/__root.tsx.
    const bg = userThemeOn
      ? (activeUserTheme as AppliedUserTheme).bg
      : isAppRoute
        ? THEME_BG.default
        : (THEME_BG[activeStyle] ?? THEME_BG.default);
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    // Also update theme-color meta for older Safari / other browsers.
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length > 0) {
      metas.forEach((m) => m.setAttribute('content', bg));
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = bg;
      document.head.appendChild(meta);
    }
  }, [
    style,
    preview,
    accent,
    isAppRoute,
    glassLevel,
    fontScale,
    density,
    readableFont,
    customAccent,
    reduceMotion,
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
    reduceTransparency: boolean;
  } | null>(null);

  // Fire-and-forget PUT of the appearance to the account, recording it as the
  // last-saved value so the change-watcher below never echoes it straight back.
  const saveAppearance = useCallback(
    (next: { style: string; accent: string | null; reduceTransparency: boolean }) => {
      lastSavedAppearanceRef.current = next;
      fetch('/api/preferences/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(next),
      }).catch(() => {});
    },
    [],
  );

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
    fetch('/api/preferences/appearance', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          remote: {
            style: string | null;
            accent: string | null;
            reduceTransparency?: boolean | null;
          } | null,
        ) => {
          if (cancelled || !remote) return;
          const store = useThemeStore.getState();
          // The account wins where it has a saved value; otherwise this device's
          // current value is kept.
          const nextStyle =
            remote.style && SITE_STYLES.some((s) => s.id === remote.style)
              ? (remote.style as SiteStyle)
              : store.style;
          const nextAccent = isAccentId(remote.accent) ? remote.accent : store.accent;
          const nextReduce =
            typeof remote.reduceTransparency === 'boolean'
              ? remote.reduceTransparency
              : store.reduceTransparency;
          if (
            remote.style !== nextStyle ||
            remote.accent !== nextAccent ||
            remote.reduceTransparency !== nextReduce
          ) {
            // Server was missing a value this device has → seed the account with the
            // merged result (also records it as last-saved).
            saveAppearance({
              style: nextStyle,
              accent: nextAccent,
              reduceTransparency: nextReduce,
            });
          } else {
            lastSavedAppearanceRef.current = {
              style: nextStyle,
              accent: nextAccent,
              reduceTransparency: nextReduce,
            };
          }
          store.setStyle(nextStyle);
          store.setAccent(nextAccent);
          store.setReduceTransparency(nextReduce);
          // Comfort suite (§13): apply account values on this device (account
          // wins where set; the settings panel persists device changes).
          const r = remote as typeof remote & {
            fontScale?: number | null;
            density?: string | null;
            readableFont?: boolean | null;
            customAccent?: string | null;
            reduceMotion?: boolean | null;
            glassLevel?: number | null;
          };
          if ([875, 1000, 1125, 1250].includes(Number(r.fontScale)))
            store.setFontScale(Number(r.fontScale));
          if (r.density === 'compact' || r.density === 'cozy') store.setDensity(r.density);
          if (typeof r.readableFont === 'boolean') store.setReadableFont(r.readableFont);
          if (typeof r.reduceMotion === 'boolean') store.setReduceMotion(r.reduceMotion);
          if (typeof r.customAccent === 'string' && HEX_RE.test(r.customAccent))
            store.setCustomAccent(r.customAccent);
          // Glass clarity (§5.46): the account stop wins; otherwise map a legacy
          // reduce-transparency flag to stop 0 (Opaque). glassLevel is authoritative
          // for the reduce-transparency class going forward.
          // An account without an explicit glassLevel means Default (2) — the
          // legacy reduceTransparency boolean no longer forces Opaque (it
          // surprised users into an opaque site; OS-level
          // prefers-reduced-transparency still covers accessibility needs).
          if (isGlassLevel(r.glassLevel)) store.setGlassLevel(r.glassLevel);
          appearanceSyncedRef.current = true;
        },
      )
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
    if (
      last &&
      last.style === style &&
      last.accent === accent &&
      last.reduceTransparency === reduceTransparency
    )
      return;
    saveAppearance({ style, accent, reduceTransparency });
  }, [style, accent, reduceTransparency, userId, saveAppearance]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppI18nProvider locale={locale} resources={i18nResources}>
        {/* Load framer-motion features lazily so they're off the initial bundle. */}
        <LazyMotion features={loadMotionFeatures}>
          {/* Honor OS reduce-motion, and the account-level toggle (§13) when set. */}
          <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
            <SessionCtx.Provider value={effectiveSession}>
              <ResolvedUserCtx.Provider
                value={{ resolved: resolvedUser, refresh: fetchResolvedUser }}
              >
                <ConfirmProvider>
                  {children}
                  <CommandPaletteMount />
                  <RecentsTracker />
                  {/* §14: the floating try-before-buy / preview-on-site confirm bar,
                      mounted globally so it survives navigation under a previewed theme. */}
                  <ThemePreviewBar />
                </ConfirmProvider>
              </ResolvedUserCtx.Provider>
              <Toaster
                theme={style === 'light' || style === 'sepia' ? 'light' : 'dark'}
                position="bottom-left"
                toastOptions={{
                  style: {
                    // L4 glass — floating UI, more opaque so content never ghosts
                    // through toast text over a bright aurora corner (§7.3).
                    background: 'color-mix(in srgb, var(--site-bg) 62%, transparent)',
                    backdropFilter: 'blur(28px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                    border: '1px solid var(--site-border)',
                    borderRadius: 'var(--site-radius-sm)',
                    boxShadow: 'var(--site-shadow)',
                    color: 'var(--site-text)',
                  },
                }}
              />
            </SessionCtx.Provider>
          </MotionConfig>
        </LazyMotion>
      </AppI18nProvider>
    </QueryClientProvider>
  );
}
