import { create } from "zustand";

export const SITE_STYLES = [
  { id: "default", label: "Default", icon: "🌙", group: "Base" },
  { id: "light", label: "Light", icon: "☀️", group: "Base" },
  { id: "high-contrast", label: "High Contrast", icon: "◐", group: "Base" },
  { id: "gamer", label: "Gamer", icon: "🎮", group: "Vibes" },
  { id: "anime", label: "Anime", icon: "🌸", group: "Vibes" },
  { id: "musical", label: "Musical", icon: "🎻", group: "Vibes" },
  { id: "hyperpop", label: "Hyperpop", icon: "⚡", group: "Vibes" },
  { id: "comic-book", label: "Comic Book", icon: "💥", group: "Vibes" },
  { id: "cinema", label: "Cinema", icon: "🎬", group: "Vibes" },
  { id: "gen-z", label: "Gen Z", icon: "✨", group: "Culture" },
  { id: "boomer", label: "Boomer", icon: "📰", group: "Culture" },
  { id: "aries", label: "Aries", icon: "♈", group: "Zodiac" },
  { id: "taurus", label: "Taurus", icon: "♉", group: "Zodiac" },
  { id: "gemini", label: "Gemini", icon: "♊", group: "Zodiac" },
  { id: "cancer", label: "Cancer", icon: "♋", group: "Zodiac" },
  { id: "leo", label: "Leo", icon: "♌", group: "Zodiac" },
  { id: "virgo", label: "Virgo", icon: "♍", group: "Zodiac" },
  { id: "libra", label: "Libra", icon: "♎", group: "Zodiac" },
  { id: "scorpio", label: "Scorpio", icon: "♏", group: "Zodiac" },
  { id: "sagittarius", label: "Sagittarius", icon: "♐", group: "Zodiac" },
  { id: "capricorn", label: "Capricorn", icon: "♑", group: "Zodiac" },
  { id: "aquarius", label: "Aquarius", icon: "♒", group: "Zodiac" },
  { id: "pisces", label: "Pisces", icon: "♓", group: "Zodiac" },
  { id: "spring", label: "Spring", icon: "🌷", group: "Seasons" },
  { id: "summer", label: "Summer", icon: "🌴", group: "Seasons" },
  { id: "autumn", label: "Autumn", icon: "🍂", group: "Seasons" },
  { id: "winter", label: "Winter", icon: "❄️", group: "Seasons" },
  { id: "elementary", label: "Elementary", icon: "🖍️", group: "School" },
  { id: "middle-school", label: "Middle School", icon: "📓", group: "School" },
  { id: "high-school", label: "High School", icon: "🎒", group: "School" },
  { id: "university", label: "University", icon: "🎓", group: "School" },
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
