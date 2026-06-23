import { ReactNode, createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useThemeStore, SITE_STYLES, SiteStyle } from "@/stores/themeStore";
import { games } from "@/lib/games";
import { apps } from "@/lib/apps";
import { AppI18nProvider } from "@/components/i18n/AppI18nProvider";
import type { Locale } from "@/lib/i18n/config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute
      retry: 1,
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
}

const STYLE_CLASSES = SITE_STYLES.map((s) => `style-${s.id}`);

/** Background colors for each theme — used to update theme-color meta + body bg
 *  synchronously instead of waiting for CSS to resolve via getComputedStyle. */
const THEME_BG: Record<SiteStyle, string> = {
  default: "#1a1b1e",
  light: "#f5f5f7",
  gamer: "#0a0a0a",
  anime: "#fff5f9",
  musical: "#0c0e1a",
  hyperpop: "#120018",
  "comic-book": "#fffde0",
  cinema: "#0a0a08",
  "gen-z": "#1a1820",
  boomer: "#f5f0e8",
  aries: "#1a0a0a",
  taurus: "#141a10",
  gemini: "#0e0e22",
  cancer: "#0c1018",
  leo: "#140e1e",
  virgo: "#f4f6f2",
  libra: "#f8f0f6",
  scorpio: "#0e0608",
  sagittarius: "#100c1e",
  capricorn: "#141416",
  aquarius: "#060e18",
  pisces: "#0c1018",
  spring: "#f2f8f0",
  summer: "#fff8f0",
  autumn: "#1a1410",
  winter: "#0a0e14",
  elementary: "#fffef4",
  "middle-school": "#181e24",
  "high-school": "#121418",
  university: "#f5f0e8",
};

/** Routes where the site-wide theme must NOT be applied (apps/games own their styling). */
const THEME_EXCLUDED_ROUTES = [
  ...games.map((g) => g.href),
  ...apps.map((a) => a.href),
].filter((href) => href.startsWith("/"));

export function Providers({ children, initialUser = null, locale = "en" }: ProvidersProps) {
  const session = authClient.useSession();
  const style = useThemeStore((s) => s.style);
  const { pathname } = useLocation();
  const isFirstRun = useRef(true);

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

  const isAppRoute = THEME_EXCLUDED_ROUTES.some((route) =>
    pathname?.startsWith(route)
  );

  // Toggle app-route class so CSS can disable scrollbar-gutter on game/app pages
  useEffect(() => {
    document.documentElement.classList.toggle("app-route", isAppRoute);
  }, [isAppRoute]);

  // Hydrate style from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("rmh-style") as SiteStyle | null;
    if (stored && SITE_STYLES.some((s) => s.id === stored)) {
      useThemeStore.getState().setStyle(stored);
    }
  }, []);

  // Sync style class to <html> and persist
  useEffect(() => {
    // On the very first render the Zustand store still holds "default"
    // because localStorage hasn't hydrated yet. The inline ThemeScript
    // already applied the correct class, background colour, and meta tag
    // — touching ANYTHING here would flash the wrong colour and Safari
    // (iOS 26+) derives its bar tint from the body background-color on
    // the first paint, so a single wrong frame is enough to break it.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const html = document.documentElement;
    // Remove all style classes
    html.classList.remove(...STYLE_CLASSES);
    // Add current style class only on non-app pages (default needs no class — uses :root tokens)
    if (style !== "default" && !isAppRoute) {
      html.classList.add(`style-${style}`);
    }
    localStorage.setItem("rmh-style", style);

    const bg = THEME_BG[style] ?? THEME_BG.default;
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
  }, [style, isAppRoute]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppI18nProvider locale={locale}>
      {/* Honor the OS "reduce motion" setting across all framer-motion animations. */}
      <MotionConfig reducedMotion="user">
      <SessionCtx.Provider value={effectiveSession}>
        <ResolvedUserCtx.Provider value={{ resolved: resolvedUser, refresh: fetchResolvedUser }}>
        {children}
        </ResolvedUserCtx.Provider>
        <Toaster
          theme="dark"
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
