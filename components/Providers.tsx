"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { useThemeStore, SITE_STYLES, SiteStyle } from "@/stores/themeStore";
import { games } from "@/lib/games";
import { apps } from "@/lib/apps";

interface ProvidersProps {
  children: ReactNode;
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

export function Providers({ children }: ProvidersProps) {
  const style = useThemeStore((s) => s.style);
  const pathname = usePathname();

  const isAppRoute = THEME_EXCLUDED_ROUTES.some((route) =>
    pathname?.startsWith(route)
  );

  // Hydrate style from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("rmh-style") as SiteStyle | null;
    if (stored && SITE_STYLES.some((s) => s.id === stored)) {
      useThemeStore.getState().setStyle(stored);
    }
  }, []);

  // Sync style class to <html> and persist
  useEffect(() => {
    const html = document.documentElement;
    // Remove all style classes
    html.classList.remove(...STYLE_CLASSES);
    // Add current style class only on non-app pages (default needs no class — uses :root tokens)
    if (style !== "default" && !isAppRoute) {
      html.classList.add(`style-${style}`);
    }
    localStorage.setItem("rmh-style", style);

    // Use the hardcoded color map so we can update synchronously — no need
    // to wait for CSS to resolve via getComputedStyle + rAF.
    const bg = THEME_BG[style] ?? THEME_BG.default;
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    // iOS Safari ignores in-place updates to theme-color meta content.
    // Removing and re-inserting the tag forces it to pick up the change.
    const old = document.querySelector('meta[name="theme-color"]');
    if (old) old.remove();
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = bg;
    document.head.appendChild(meta);
  }, [style, isAppRoute]);

  return (
    <>
      {children}
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
    </>
  );
}
