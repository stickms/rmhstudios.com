import { readJson, readString, removeKey, writeString } from '@/lib/core/persist';
import {
  ReactNode,
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useRouter, useRouterState } from '@tanstack/react-router';
import { MotionConfig } from 'framer-motion';
import { LazyMotionProvider } from '@/components/motion/LazyMotionProvider';
import { DataSaverRequestContext } from '@/hooks/useDataSaver';
import { ToastHost } from '@/components/ui/toast-host';
import {
  SessionCtx,
  useEffectiveSession,
  useLiveSession,
  type CachedSessionUser,
} from '@/components/session/session-context';
import {
  useThemeStore,
  SITE_STYLES,
  THEME_BG,
  APP_THEME_BG,
  DEFAULT_STYLE,
  deviceStyle,
  DARK_SCHEME_QUERY,
  SiteStyle,
  USER_THEME_KEY,
  appRouteGround,
  paintDocumentGround,
  editionForBackground,
  withoutStamp,
} from '@/stores/themeStore';
import { clearThemeTokens, isStaleAppliedTheme, type AppliedUserTheme } from '@/lib/themes/tokens';
import {
  FONT_SCALE_KEY,
  DENSITY_KEY,
  READABLE_FONT_KEY,
  COLOR_VISION_KEY,
  isColorVisionMode,
  applyColorVision,
  JELLY_MOTION_KEY,
  DEFAULT_JELLY_MOTION,
  isJellyMotion,
  applyJellyMotion,
} from '@/lib/appearance/prefs';
import { APPEARANCE_SYNC_COOKIE, APPEARANCE_SYNC_KEY, FONT_KEYS, isFontFor } from '@/lib/appearance/fonts';
import { applyFonts } from '@/lib/appearance/apply-fonts';
import { useSpatialParallax } from '@/hooks/useSpatialParallax';
import { useSoftRenderSettle } from '@/hooks/useSoftRenderSettle';
import { syncNativeMaterialClass } from '@/lib/native-material-routes';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useLocaleStore, writeLocaleCookie } from '@/stores/localeStore';
import { applyHtmlLangDir } from '@/lib/i18n/dom';
import { isAppThemeRoute } from '@/lib/prepaint/theme-routes';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import { CommandPaletteMount } from '@/components/site/CommandPaletteMount';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { PromptProvider } from '@/components/ui/prompt-dialog';
import { CopyFallbackProvider } from '@/components/ui/copy-fallback';
import type { Locale } from '@/lib/i18n/config';
import type { LocaleBundle } from '@/lib/i18n/resources';
import { recoverViewTransition } from '@/lib/view-transition';
import { AppTierContext } from '@/components/ui/app-tier-context';
import { installScrollbarReveal } from '@/lib/scrollbar-reveal';
import { installSwapReveal } from '@/lib/swap-reveal';
import { HttpError } from '@/lib/http';
import {
  getAppearancePrefsApi,
  type AppearancePrefs,
  setAppearancePrefsApi,
} from '@/lib/preferences/preferences.contract';
import { api } from '@/lib/contract/client';
import { claimReferralApi } from '@/lib/referrals.contract';
import { getMyProfileDisplayApi } from '@/lib/profile/profile-extras.contract';

// The session context, its persisted last-known user and the seeding logic live in
// a leaf so a separately built island can provide the same context (redesign B1).
export { useSession } from '@/components/session/session-context';

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
  /**
   * The server's data-saver decision for this document (lib/data-saver-request.ts):
   * what the first page's images were rendered with, and so what the hydrating
   * render must read (hooks/useDataSaver#useDataSaverAtMount).
   */
  saveData?: boolean;
}

const STYLE_CLASSES = SITE_STYLES.map((s) => `style-${s.id}`);

// framer-motion feature bundle, loaded on demand so the animation/gesture/layout
// drivers stay out of the initial bundle. Every component ships the lightweight
// `m` component (aliased as `motion`) and picks these up from the lazy context.
// The bundle registers its own features and returns the renderer, so the provider
// in the shell imports none of motion-dom (components/motion/LazyMotionProvider).
// Mounted when idle; see components/site/ShellMounts.tsx.
const ShellMounts = lazy(() => import('@/components/site/ShellMounts'));

const loadMotionFeatures = () =>
  import('@/lib/motion-features').then((mod) => mod.registerMotionFeatures());

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
  saveData = false,
}: ProvidersProps) {
  // The router's QueryClient (lib/query/make-query-client.ts): built once per SSR request and once
  // per page load in getRouter(), so route loaders seed the same cache the components read.
  const queryClient = useRouter().options.context.queryClient;
  const session = useLiveSession();
  const style = useThemeStore((s) => s.style);
  const styleFromDevice = useThemeStore((s) => s.styleFromDevice);
  const readableFont = useThemeStore((s) => s.readableFont);
  const colorVision = useThemeStore((s) => s.colorVision);
  const jellyMotion = useThemeStore((s) => s.jellyMotion);
  const fonts = useThemeStore((s) => s.fonts);
  const appearanceSync = useThemeStore((s) => s.appearanceSync);
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

  // The CSS-only material (the woken haze) has no install step to skip, so a native-material route is marked on <html>
  // instead and the material's rules are scoped off it. Stamped pre-paint by __root.tsx on a hard load; this keeps it
  // in step on client navigation and clears it on the way out.
  useEffect(() => syncNativeMaterialClass(document.documentElement, pathname), [pathname]);
  // Remember whether this browser draws in software (the games' canvas glow reads it). Not on a site-shell page: that
  // page's one WebGL context is the chrome renderer's (Steel B3).
  useSoftRenderSettle(pathname);

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

  // Seeded from the server-resolved user and the persisted last-known user, so nothing
  // flashes signed-out (components/session/session-context.tsx).
  const effectiveSession = useEffectiveSession(session, initialUser, sessionResolved);

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
    const code = readString('rmh-ref');
    if (!code) return;
    api(claimReferralApi, { body: { code } })
      .then(() => removeKey('rmh-ref'))
      .catch((err: unknown) => {
        // Any answer but 429 settles the code (claimed, already claimed, invalid);
        // a dropped connection or a 429 keeps it for the next load.
        if (err instanceof HttpError && err.status !== 429) {
          removeKey('rmh-ref');
        }
      });
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

  // Hydrate style from localStorage on mount. A stored edition is a choice and is kept. With none (or a retired id,
  // which is dropped) the visitor follows the device, live, and nothing is written (DEFAULT_STYLE in
  // stores/themeStore.ts): the pre-paint step already painted the same edition.
  useEffect(() => withoutStamp(() => {
    const stored = readString('rmh-style');
    if (stored && SITE_STYLES.some((s) => s.id === stored)) {
      useThemeStore.getState().setStyle(stored as SiteStyle);
    } else {
      if (stored) removeKey('rmh-style');
      useThemeStore.getState().followDeviceStyle(deviceStyle());
    }
    // Comfort suite (§13) — hydrate from the no-flash localStorage cache.
    const st = useThemeStore.getState();
    if (readString(READABLE_FONT_KEY) === '1') st.setReadableFont(true);
    // The reader's fonts and this device's sync switch (lib/appearance/fonts.ts); the server and the pre-paint step
    // already rendered the same faces.
    for (const slot of ['main', 'reading', 'mono'] as const) {
      const v = readString(FONT_KEYS[slot]);
      if (isFontFor(slot, v)) st.setFont(slot, v as never);
    }
    if (readString(APPEARANCE_SYNC_KEY) === '0') st.setAppearanceSync(false);
    const cv = readString(COLOR_VISION_KEY);
    if (isColorVisionMode(cv)) st.setColorVision(cv);
    const jm = readString(JELLY_MOTION_KEY);
    if (isJellyMotion(jm)) st.setJellyMotion(jm);
    // The globe cursor and its per-device settings were removed (2026-11-08): drop the stale key so devices do not keep
    // dead data. Nothing reads it any more. Safe to delete once every device that ever stored it has loaded the site.
    removeKey('rmh-globe-cursor');
    // The settings Steel retired (page eversion, always-evert, eversion level, electric arcs): drop their cached values.
    for (const key of [
      'rmh-nav-transition',
      'rmh-eversion-level',
      'rmh-always-evert-globe',
      'rmh-electric-arcs',
      // The accent presets and the custom accent hex were retired (owner, 2026-11-18): Steel has no accent colour, and
      // a theme's own accent is the one way colour enters the page.
      'rmh-accent',
      'rmh-custom-accent',
    ])
      removeKey(key);
    // Marketplace user theme (§14): the no-flash script already painted it; hydrate
    // the store so the runtime effect keeps it applied and can clear it on removal.
    // A corrupt cache reads as null: the built-in theme shows through.
    const parsed = readJson<AppliedUserTheme | null>(USER_THEME_KEY, null);
    if (parsed && typeof parsed.id === 'string' && parsed.vars && typeof parsed.bg === 'string') {
      st.setUserTheme(parsed);
      // A cache from an older derivation (no gradients, translucent surfaces) would paint that old look on every
      // page; fetch the theme and re-derive it. Lazy, so a current cache costs nothing.
      if (isStaleAppliedTheme(parsed)) {
        void import('@/lib/themes/refresh-applied').then((m) => m.refreshAppliedTheme(parsed.id));
      }
    }
  }), []);

  // Follow the device's light/dark setting live while nothing is chosen, so flipping it with the tab open moves the
  // page too. A media-query listener: it fires only on that change and costs nothing at rest (B3).
  useEffect(() => {
    if (!styleFromDevice || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const follow = () => {
      if (useThemeStore.getState().styleFromDevice)
        useThemeStore.getState().followDeviceStyle(deviceStyle());
    };
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [styleFromDevice]);

  // Sync the style class and any bought theme to <html> and persist.
  useEffect(() => {
    // On the very first render the Zustand store still holds DEFAULT_STYLE
    // because localStorage hasn't hydrated yet. The inline ThemeScript
    // already applied the correct class, background colour, meta tag, and
    // bought theme — touching ANYTHING here would flash the wrong colour and Safari
    // (iOS 26+) derives its bar tint from the body background-color on
    // the first paint, so a single wrong frame is enough to break it.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const html = document.documentElement;
    // A bought theme (or its transient preview) decides the edition from its own background, so a light theme is
    // never marked dark (stores/themeStore.ts `editionForBackground`). The stored `style` is left as the visitor set it.
    const activeUserTheme = userThemePreview ?? userTheme;
    const userThemeOn = !!activeUserTheme && !isAppRoute;
    const activeStyle =
      userThemeOn && activeUserTheme ? editionForBackground(activeUserTheme.bg) : style;
    // Remove all style classes
    html.classList.remove(...STYLE_CLASSES);
    // Add active style class only on non-app pages (default needs no class — uses :root tokens)
    if (activeStyle !== 'default' && !isAppRoute) {
      html.classList.add(`style-${activeStyle}`);
    }
    // Only a chosen edition is stored; one that follows the device is re-read from it on every load.
    if (!styleFromDevice) writeString('rmh-style', style);

    // Marketplace user theme (§14): a full v2 retint set inline over the built-in
    // cascade (a transient preview beats the committed one). Skipped on app/game
    // routes (they own their palette).
    // block so they still win.
    if (userThemeOn && activeUserTheme) {
      for (const [k, v] of Object.entries(activeUserTheme.vars)) html.style.setProperty(k, v);
    } else {
      clearThemeTokens(html);
    }
    // Persist only the COMMITTED theme (not a transient preview) for the no-flash script.
    if (userTheme) writeString(USER_THEME_KEY, JSON.stringify(userTheme));
    else removeKey(USER_THEME_KEY);

    // Glass clarity is retired. Clear old device overrides, including during HMR;
    // OS transparency preferences and high contrast still apply in the material layer.
    html.classList.remove('reduce-transparency');
    html.style.removeProperty('--glass-user-blur');
    html.style.removeProperty('--glass-user-tint');
    removeKey('rmh-glass-level');
    removeKey('rmh-reduce-transparency');
    removeKey('rmh-reduce-motion');

    // ── Comfort suite (§13) ──────────────────────────────────────────────
    // Text size is retired (owner, 2026-11-19): Steel type is set in px (steel-type.css), so a root font-size only
    // ever scaled the rem-based controls and left headings and posts as they were. A stored scale is cleared here.
    html.style.removeProperty('font-size');
    removeKey(FONT_SCALE_KEY);
    // Density is retired (settings audit, 2026-11-19): it only tightened the `<Card>` primitive, which Steel pages do
    // not use. A stored "compact" is cleared here rather than left applied with no control to undo it.
    html.removeAttribute('data-density');
    removeKey(DENSITY_KEY);
    html.classList.toggle('readable-font', readableFont);
    if (readableFont) writeString(READABLE_FONT_KEY, '1');
    else removeKey(READABLE_FONT_KEY);
    // Colour-vision mode retints the semantic tokens via a data attribute the
    // theme cascade reads (see globals.css). Cached in localStorage so the
    // no-flash script in __root.tsx can apply it before first paint — without
    // that, a viewer who can't distinguish the default palette would see the
    // wrong status colours for a frame on every navigation.
    applyColorVision(html, colorVision);
    if (colorVision !== 'none') writeString(COLOR_VISION_KEY, colorVision);
    else removeKey(COLOR_VISION_KEY);
    // Globe motion: stamped on <html> for the globe and the games' ambient canvases and cached for the pre-paint
    // script; the default is expressed by absence.
    applyJellyMotion(html, jellyMotion);
    if (jellyMotion !== DEFAULT_JELLY_MOTION) writeString(JELLY_MOTION_KEY, jellyMotion);
    else removeKey(JELLY_MOTION_KEY);
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
    styleFromDevice,
    isAppRoute,
    readableFont,
    colorVision,
    jellyMotion,
    userTheme,
    userThemePreview,
  ]);

  // ── The reader's fonts (lib/appearance/fonts.ts) ─────────────────────────
  // Stamped on <html> (choice-rules.css maps the attributes), cached in localStorage for the pre-paint step and in the
  // `rmh-fonts` cookie so the server renders the same faces next time, and each face in use links its own sheet. The
  // first run is skipped: the server and the pre-paint step already rendered this, and the store still holds the
  // defaults until the hydration effect above has run.
  const fontsFirstRun = useRef(true);
  useEffect(() => {
    if (fontsFirstRun.current) {
      fontsFirstRun.current = false;
      return;
    }
    applyFonts(fonts);
  }, [fonts]);

  // This device's appearance sync switch, mirrored to a cookie so the server skips the account's appearance for it.
  const syncFirstRun = useRef(true);
  useEffect(() => {
    if (syncFirstRun.current) {
      syncFirstRun.current = false;
      return;
    }
    if (appearanceSync) {
      removeKey(APPEARANCE_SYNC_KEY);
      document.cookie = `${APPEARANCE_SYNC_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    } else {
      writeString(APPEARANCE_SYNC_KEY, '0');
      document.cookie = `${APPEARANCE_SYNC_COOKIE}=0; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
  }, [appearanceSync]);

  // ── Account sync ─────────────────────────────────────────────────────────
  // Appearance follows the signed-in user across devices. On sign-in we pull the
  // saved theme; the account wins when it has a value, otherwise the
  // current device value is kept (and seeded up so the account isn't left empty).
  const appearanceSyncedRef = useRef(false);
  const lastSavedAppearanceRef = useRef<{
    style: string | null;
  } | null>(null);

  // Fire-and-forget PUT of the appearance to the account, recording it as the
  // last-saved value so the change-watcher below never echoes it straight back.
  const saveAppearance = useCallback((next: { style: string }) => {
    lastSavedAppearanceRef.current = next;
    api(setAppearancePrefsApi, { body: next }).catch((err) => {
      console.error('Appearance save failed:', err);
    });
  }, []);

  // The account's appearance applied to this device: the account wins where it has a value (null = never chosen, the
  // device's own stands). Callers wrap it in withoutStamp: applying the account is not the user changing anything.
  const applyRemoteAppearance = useCallback(
    (remote: AppearancePrefs) => {
      const store = useThemeStore.getState();
      // The account wins where it has a saved edition. Otherwise a choice made on this device is saved up, and a
      // device that only follows its OS scheme leaves the account empty, so it keeps following everywhere.
      const remoteStyle =
        remote.style && SITE_STYLES.some((s) => s.id === remote.style) ? (remote.style as SiteStyle) : null;
      if (remoteStyle) {
        lastSavedAppearanceRef.current = { style: remoteStyle };
        store.setStyle(remoteStyle);
      } else if (!store.styleFromDevice) {
        saveAppearance({ style: store.style });
      } else {
        lastSavedAppearanceRef.current = { style: null };
      }
      // Comfort suite (§13): apply account values on this device (account wins where set; the settings panel
      // persists device changes).
      if (typeof remote.readableFont === 'boolean') store.setReadableFont(remote.readableFont);
      if (isColorVisionMode(remote.colorVision)) store.setColorVision(remote.colorVision);
      if (isJellyMotion(remote.jellyMotion)) store.setJellyMotion(remote.jellyMotion);
      // The reader's fonts: an explicit id on the account (defaults included) wins; null leaves the device's own.
      const columns = { main: remote.fontMain, reading: remote.fontReading, mono: remote.fontMono } as const;
      for (const slot of ['main', 'reading', 'mono'] as const) {
        const v = columns[slot];
        if (isFontFor(slot, v)) store.setFont(slot, v as never);
      }
    },
    [saveAppearance],
  );

  useEffect(() => {
    // Signed out, or appearance sync off on this device (owner, 2026-11-23): neither pull nor push appearance. Turning
    // it back on settles "most recent wins" first (components/settings/AppearancePanel.tsx), then this pulls.
    if (!userId || !appearanceSync) {
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
        // Applying the account's values is not this device's user changing them (lib/appearance/sync-merge.ts).
        withoutStamp(() => applyRemoteAppearance(remote));
        appearanceSyncedRef.current = true;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, idleReady, appearanceSync, applyRemoteAppearance]);


  // Persist later appearance changes (the theme picker, the command
  // palette) for signed-in users. Guarded so it never fires before the initial
  // sync and never re-saves a value we just pulled from the server.
  useEffect(() => {
    if (!userId || !appearanceSync || !appearanceSyncedRef.current || styleFromDevice) return;
    const last = lastSavedAppearanceRef.current;
    if (last && last.style === style) return;
    saveAppearance({ style });
  }, [style, styleFromDevice, userId, appearanceSync, saveAppearance]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppI18nProvider locale={locale} resources={i18nResources}>
        {/* Load framer-motion features lazily so they're off the initial bundle. */}
        <LazyMotionProvider load={loadMotionFeatures}>
          {/* One shared animation scheme for every account and device. */}
          <MotionConfig reducedMotion="never">
            <SessionCtx value={effectiveSession}>
              <DataSaverRequestContext value={saveData}>
                <AppTierContext value={isAppRoute}>
                  <ResolvedUserCtx
                    value={{ resolved: resolvedUser, refresh: fetchResolvedUser }}
                  >
                    <ConfirmProvider>
                    <PromptProvider>
                    <CopyFallbackProvider>
                      {children}
                      {/* Globally-mounted, non-critical chrome. Isolate it so a throw
                        in the command palette / recents tracker / theme-preview bar
                        is reported and swallowed instead of bubbling to the root
                        errorComponent and taking down the whole app. `children`
                        (the page) is deliberately OUTSIDE this boundary — primary
                        content must still surface a real route-level error. */}
                      <SilentErrorBoundary label="global-chrome">
                        <CommandPaletteMount />
                        {/* Trackers, patch notes, the theme-preview bar, calls, the
                          access sheet and delight: all render nothing at load, so
                          they arrive as one chunk once the browser is idle
                          (components/site/ShellMounts.tsx). */}
                        {idleReady ? (
                          <Suspense fallback={null}>
                            <ShellMounts />
                          </Suspense>
                        ) : null}
                      </SilentErrorBoundary>
                    </CopyFallbackProvider>
                    </PromptProvider>
                    </ConfirmProvider>
                  </ResolvedUserCtx>
                  <ToastHost theme={style === 'graphite' ? 'dark' : 'light'} />
                </AppTierContext>
              </DataSaverRequestContext>
            </SessionCtx>
          </MotionConfig>
        </LazyMotionProvider>
      </AppI18nProvider>
    </QueryClientProvider>
  );
}
