"use client";

import { ReactNode, useEffect } from "react";
import { useThemeStore, SITE_STYLES, SiteStyle } from "@/stores/themeStore";

interface ProvidersProps {
  children: ReactNode;
}

const STYLE_CLASSES = SITE_STYLES.map((s) => `style-${s.id}`);

export function Providers({ children }: ProvidersProps) {
  const style = useThemeStore((s) => s.style);

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
    // Add current style class (default needs no class — uses :root tokens)
    if (style !== "default") {
      html.classList.add(`style-${style}`);
    }
    localStorage.setItem("rmh-style", style);
  }, [style]);

  return <>{children}</>;
}
