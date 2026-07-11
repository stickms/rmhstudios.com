import { create } from "zustand";

/**
 * User-customized navigation: which "More" destinations are pinned into the
 * main sidebar rail. Persisted per device in localStorage (same pattern as the
 * theme store: manual hydration after mount so SSR markup never mismatches).
 */

const STORAGE_KEY = "rmh-nav-pins";

function readPins(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writePins(pins: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // ignore (private mode / storage disabled)
  }
}

interface NavStore {
  /** Hrefs pinned into the main rail. Empty until hydrated. */
  pinned: string[];
  /** True once localStorage has been read on the client. */
  hydrated: boolean;
  hydrate: () => void;
  togglePin: (href: string) => void;
}

export const useNavStore = create<NavStore>((set, get) => ({
  pinned: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ pinned: readPins(), hydrated: true });
  },
  togglePin: (href) => {
    const current = get().pinned;
    const next = current.includes(href)
      ? current.filter((h) => h !== href)
      : [...current, href];
    writePins(next);
    set({ pinned: next });
  },
}));
