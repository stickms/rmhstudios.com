import { create } from "zustand";

export const SITE_STYLES = [
  { id: "default", label: "Dark", icon: "🌙", group: "Base" },
  { id: "light", label: "Light", icon: "☀️", group: "Base" },
  { id: "high-contrast", label: "High Contrast", icon: "◐", group: "Base" },
] as const;

export type SiteStyle = (typeof SITE_STYLES)[number]["id"];

interface ThemeStore {
  style: SiteStyle;
  setStyle: (style: SiteStyle) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  style: "default",
  setStyle: (style) => set({ style }),
}));
