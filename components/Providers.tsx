import { ReactNode, createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useThemeStore, SITE_STYLES, THEME_BG, SiteStyle } from "@/stores/themeStore";
import { applyAccent, isAccentId, ACCENT_STORAGE_KEY } from "@/lib/appearance";
import { useLocaleStore, writeLocaleCookie } from "@/stores/localeStore";
import { applyHtmlLangDir } from "@/lib/i18n/dom";
import { games } from "@/lib/games";
import { apps } from "@/lib/apps";
import { AppI18nProvider } from "@/components/i18n/AppI18nProvider";
import { CommandPalette } from "@/components/site/CommandPalette";
import { RecentsTracker } from "@/components/site/RecentsTracker";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { Locale } from "@/lib/i18n/config";
import type { LocaleBundle } from "@/lib/i18n/resources";

const queryClient = new QueryClient({
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
const CACHED_USER_KEY = "rmh-auth-user";

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

// THEME_BG (theme → document background color) lives in stores/themeStore.ts,
// derived from SITE_STYLES, so the runtime and the no-flash inline script share
// one source. The default is pure black — matching the :root `--site-bg` token
// and the `.vibe-app`/`.vibe-screen` shells (a grey value here made the document
// background flip to grey after hydration while the app chrome stayed black).

/** Routes where the site-wide theme must NOT be applied (apps/games own their styling). */
const THEME_EXCLUDED_ROUTES = [
  ...games.map((g) => g.href),
  ...apps.map((a) => a.href),
].filter((href) => href.startsWith("/"));

export function Providers({ children, initialUser = null, locale = "en", i18nResources = null }: ProvidersProps) {
  const session = authClient.useSession();
  const style = useThemeStore((s) => s.style);
  const preview = useThemeStore((s) => s.preview);
  const accent = useThemeStore((s) => s.accent);
  const { pathname } = useLocation();
  const isFirstRun = useRef(true);

  // Sync the locale store to the SSR-resolved locale and reconcile <html lang/dir>
  // so a user whose locale was resolved via Accept-Language (no cookie yet) gets
  // the correct layout direction from the first client render onward.
  useEffect(() => {
    if (typeof document !== "undefined") {
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

  // Resolved user display data (custom image/name)
  const [resolvedUser, setResolvedUser] = useState<ResolvedUserDisplay | null>(null);
  const fetchResolvedUser = useCallback(() => {
    fetch("/api/profile/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setResolvedUser(data); })
      .catch(() => {});
  }, []);

  const userId = effectiveSession.data?.user?.id;
  useEffect(() => {
    if (userId) {
      fetchResolvedUser();
    } else {
      setResolvedUser(null);
    }
  }, [userId, fetchResolvedUser]);

  // Referral attribution: /ref/$code stashes an invite code before sign-up;
  // claim it once a session exists (works for email and OAuth flows alike).
  // The key is cleared on any server verdict and kept only on network failure
  // so a flaky connection can retry on the next load.
  useEffect(() => {
    if (!userId) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem("rmh-ref");
    } catch {
      return;
    }
    if (!code) return;
    fetch("/api/referrals/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    })
      .then((res) => {
        if (res.status !== 429) localStorage.removeItem("rmh-ref");
      })
      .catch(() => {});
  }, [userId]);

  const isAppRoute = THEME_EXCLUDED_ROUTES.some((route) =>
    pathname?.startsWith(route)
  );

  // Toggle app-route class so CSS can disable scrollbar-gutter on game/app pages
  useEffect(() => {
    document.documentElement.classList.toggle("app-route", isAppRoute);
  }, [isAppRoute]);

  // Hydrate style from localStorage on mount. Self-heal legacy values: the
  // theme set was reduced to Dark / Light / High Contrast, so any retired
  // novelty style still persisted from before falls back to "default" and is
  // rewritten so it doesn't linger.
  useEffect(() => {
    const stored = localStorage.getItem("rmh-style");
    if (stored && SITE_STYLES.some((s) => s.id === stored)) {
      useThemeStore.getState().setStyle(stored as SiteStyle);
    } else if (stored) {
      localStorage.setItem("rmh-style", "default");
    }
    const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentId(storedAccent)) {
      useThemeStore.getState().setAccent(storedAccent);
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
    if (activeStyle !== "default" && !isAppRoute) {
      html.classList.add(`style-${activeStyle}`);
    }
    // Persist the COMMITTED style (not a transient preview).
    localStorage.setItem("rmh-style", style);

    // Accent override: apply on content pages; clear on app/game routes (they own
    // their palette) and when no accent is chosen. applyAccent no-ops safely for a
    // null/unknown id by clearing the tokens.
    applyAccent(html, isAppRoute ? null : accent);
    if (isAccentId(accent)) localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    else localStorage.removeItem(ACCENT_STORAGE_KEY);

    const bg = THEME_BG[activeStyle] ?? THEME_BG.default;
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    // Also update theme-color meta for older Safari / other browsers.
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length > 0) {
      metas.forEach((m) => m.setAttribute("content", bg));
    } else {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = bg;
      document.head.appendChild(meta);
    }
  }, [style, preview, accent, isAppRoute]);

  // ── Account sync ─────────────────────────────────────────────────────────
  // Appearance follows the signed-in user across devices. On sign-in we pull the
  // saved theme/accent; the account wins when it has a value, otherwise the
  // current device value is kept (and seeded up so the account isn't left empty).
  const appearanceSyncedRef = useRef(false);
  const lastSavedAppearanceRef = useRef<{ style: string; accent: string | null } | null>(null);

  // Fire-and-forget PUT of the appearance to the account, recording it as the
  // last-saved value so the change-watcher below never echoes it straight back.
  const saveAppearance = useCallback((next: { style: string; accent: string | null }) => {
    lastSavedAppearanceRef.current = next;
    fetch("/api/preferences/appearance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(next),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!userId) {
      appearanceSyncedRef.current = false;
      lastSavedAppearanceRef.current = null;
      return;
    }
    let cancelled = false;
    fetch("/api/preferences/appearance", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((remote: { style: string | null; accent: string | null } | null) => {
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
          saveAppearance({ style: nextStyle, accent: nextAccent });
        } else {
          lastSavedAppearanceRef.current = { style: nextStyle, accent: nextAccent };
        }
        store.setStyle(nextStyle);
        store.setAccent(nextAccent);
        appearanceSyncedRef.current = true;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, saveAppearance]);

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
      {/* Honor the OS "reduce motion" setting across all framer-motion animations. */}
      <MotionConfig reducedMotion="user">
      <SessionCtx.Provider value={effectiveSession}>
        <ResolvedUserCtx.Provider value={{ resolved: resolvedUser, refresh: fetchResolvedUser }}>
        <ConfirmProvider>
        {children}
        <CommandPalette />
        <RecentsTracker />
        </ConfirmProvider>
        </ResolvedUserCtx.Provider>
        <Toaster
          theme={style === "light" ? "light" : "dark"}
          position="bottom-left"
          toastOptions={{
            style: {
              background: "var(--site-surface)",
              border: "1px solid var(--site-border)",
              color: "var(--site-text)",
            },
          }}
        />
      </SessionCtx.Provider>
      </MotionConfig>
      </AppI18nProvider>
    </QueryClientProvider>
  );
}
