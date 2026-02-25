import { create } from "zustand";

export const SITE_STYLES = [
  { id: "default", label: "Default", icon: "🌙", group: "Base" },
  { id: "light", label: "Light", icon: "☀️", group: "Base" },
  { id: "gamer", label: "Gamer", icon: "🎮", group: "Vibes" },
  { id: "anime", label: "Anime", icon: "🌸", group: "Vibes" },
  { id: "musical", label: "Musical", icon: "🎻", group: "Vibes" },
  { id: "hyperpop", label: "Hyperpop", icon: "⚡", group: "Vibes" },
  { id: "comic-book", label: "Comic Book", icon: "💥", group: "Vibes" },
  { id: "cinema", label: "Cinema", icon: "🎬", group: "Vibes" },
  { id: "israeli", label: "Israeli", icon: "🇮🇱", group: "Culture" },
  { id: "gen-z", label: "Gen Z", icon: "✨", group: "Culture" },
  { id: "boomer", label: "Boomer", icon: "📰", group: "Culture" },
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
