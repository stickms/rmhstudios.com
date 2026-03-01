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

    // Force mobile browsers to immediately repaint the background.
    // Some mobile browsers don't repaint body/html background when CSS
    // custom properties change via class toggling on an ancestor element.
    // Double rAF ensures the class change has been painted before we read
    // the resolved value.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const bg = getComputedStyle(html)
          .getPropertyValue("--site-bg")
          .trim();
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
      });
    });
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
