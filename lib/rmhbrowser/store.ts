/**
 * RMHbrowser — Zustand Store
 *
 * Manages tabs, bookmarks, browsing history, profiles, and browser settings.
 * Persisted to localStorage so state survives page refreshes.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ─── Types ─────────────────────────────────────────────────────── */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  navHistory: string[];
  navIndex: number;
  isLoading: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

export type BrowserTheme = 'dark' | 'light' | 'ocean' | 'sunset' | 'forest';
export type SearchEngine = 'google' | 'bing' | 'duckduckgo';

export interface BrowserProfile {
  id: string;
  name: string;
  color: string;
  theme: BrowserTheme;
}

export interface BrowserSettings {
  theme: BrowserTheme;
  showBookmarksBar: boolean;
  searchEngine: SearchEngine;
  homePage: string;
  zoomLevel: number;
}

const NEW_TAB_URL = 'rmhbrowser://newtab';

const SEARCH_URLS: Record<SearchEngine, string> = {
  google: 'https://www.google.com/search?igu=1&q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};

/* ─── Helpers ───────────────────────────────────────────────────── */

let tabCounter = 0;
const newId = () => `tab-${Date.now()}-${++tabCounter}`;

function createTab(url: string = NEW_TAB_URL): BrowserTab {
  return {
    id: newId(),
    url,
    title: url === NEW_TAB_URL ? 'New Tab' : url,
    navHistory: [url],
    navIndex: 0,
    isLoading: false,
  };
}

/* ─── Store ─────────────────────────────────────────────────────── */

interface BrowserStore {
  /* State */
  tabs: BrowserTab[];
  activeTabId: string;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  profiles: BrowserProfile[];
  activeProfileId: string;
  settings: BrowserSettings;
  showHistory: boolean;
  showSettings: boolean;
  findText: string;
  showFind: boolean;

  /* Tab actions */
  addTab: (url?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  navigateTo: (tabId: string, raw: string) => void;
  goBack: (tabId: string) => void;
  goForward: (tabId: string) => void;
  reload: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  duplicateTab: (tabId: string) => void;

  /* Bookmark actions */
  addBookmark: (title: string, url: string) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (url: string) => boolean;

  /* History actions */
  addHistoryEntry: (url: string, title: string) => void;
  clearHistory: () => void;

  /* Profile actions */
  addProfile: (name: string, color: string, theme: BrowserTheme) => void;
  removeProfile: (id: string) => void;
  switchProfile: (id: string) => void;

  /* Settings */
  setTheme: (theme: BrowserTheme) => void;
  setSearchEngine: (engine: SearchEngine) => void;
  setZoom: (level: number) => void;
  toggleBookmarksBar: () => void;
  setHomePage: (url: string) => void;

  /* Panels */
  toggleHistory: () => void;
  toggleSettings: () => void;
  setFindText: (text: string) => void;
  toggleFind: () => void;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: 'bk-1', title: 'Google', url: 'https://www.google.com/webhp?igu=1', createdAt: Date.now() },
  { id: 'bk-2', title: 'Wikipedia', url: 'https://en.m.wikipedia.org/', createdAt: Date.now() },
  { id: 'bk-3', title: 'Reddit', url: 'https://old.reddit.com', createdAt: Date.now() },
];

const DEFAULT_PROFILES: BrowserProfile[] = [
  { id: 'profile-default', name: 'Default', color: '#6366f1', theme: 'dark' },
];

const initialTab = createTab();

export const useRmhBrowserStore = create<BrowserStore>()(
  persist(
    (set, get) => ({
      /* ─── Initial State ─────────────────────────────────────── */
      tabs: [initialTab],
      activeTabId: initialTab.id,
      bookmarks: DEFAULT_BOOKMARKS,
      history: [],
      profiles: DEFAULT_PROFILES,
      activeProfileId: 'profile-default',
      settings: {
        theme: 'dark',
        showBookmarksBar: true,
        searchEngine: 'google',
        homePage: NEW_TAB_URL,
        zoomLevel: 100,
      },
      showHistory: false,
      showSettings: false,
      findText: '',
      showFind: false,

      /* ─── Tab Actions ───────────────────────────────────────── */

      addTab: (url) => {
        const tab = createTab(url);
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          showHistory: false,
          showSettings: false,
        }));
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        if (tabs.length <= 1) {
          // Don't close the last tab — reset it instead
          const fresh = createTab();
          set({ tabs: [fresh], activeTabId: fresh.id });
          return;
        }
        const idx = tabs.findIndex((t) => t.id === id);
        const next = tabs.filter((t) => t.id !== id);
        const newActive =
          activeTabId === id
            ? next[Math.min(idx, next.length - 1)].id
            : activeTabId;
        set({ tabs: next, activeTabId: newActive });
      },

      switchTab: (id) => set({ activeTabId: id }),

      navigateTo: (tabId, raw) => {
        const input = raw.trim();
        if (!input) return;

        let url: string;
        if (input.startsWith('rmhbrowser://')) {
          url = input;
        } else if (/^https?:\/\//i.test(input)) {
          url = input;
        } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(input)) {
          url = `https://${input}`;
        } else {
          const engine = get().settings.searchEngine;
          url = `${SEARCH_URLS[engine]}${encodeURIComponent(input)}`;
        }

        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== tabId) return t;
            const newHistory = [...t.navHistory.slice(0, t.navIndex + 1), url];
            return {
              ...t,
              url,
              title: url.startsWith('rmhbrowser://') ? 'New Tab' : url,
              navHistory: newHistory,
              navIndex: newHistory.length - 1,
              isLoading: true,
            };
          }),
        }));

        // Add to browsing history
        if (!url.startsWith('rmhbrowser://')) {
          get().addHistoryEntry(url, url);
        }
      },

      goBack: (tabId) => {
        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== tabId || t.navIndex <= 0) return t;
            const newIndex = t.navIndex - 1;
            return {
              ...t,
              url: t.navHistory[newIndex],
              title: t.navHistory[newIndex],
              navIndex: newIndex,
              isLoading: true,
            };
          }),
        }));
      },

      goForward: (tabId) => {
        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== tabId || t.navIndex >= t.navHistory.length - 1) return t;
            const newIndex = t.navIndex + 1;
            return {
              ...t,
              url: t.navHistory[newIndex],
              title: t.navHistory[newIndex],
              navIndex: newIndex,
              isLoading: true,
            };
          }),
        }));
      },

      reload: (tabId) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, isLoading: true } : t,
          ),
        }));
      },

      updateTabTitle: (tabId, title) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, title, isLoading: false } : t,
          ),
        }));
      },

      moveTab: (fromIndex, toIndex) => {
        set((s) => {
          const tabs = [...s.tabs];
          const [moved] = tabs.splice(fromIndex, 1);
          tabs.splice(toIndex, 0, moved);
          return { tabs };
        });
      },

      duplicateTab: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        if (!tab) return;
        const dup = createTab(tab.url);
        dup.title = tab.title;
        set((s) => ({
          tabs: [...s.tabs, dup],
          activeTabId: dup.id,
        }));
      },

      /* ─── Bookmark Actions ──────────────────────────────────── */

      addBookmark: (title, url) => {
        const id = `bk-${Date.now()}`;
        set((s) => ({
          bookmarks: [...s.bookmarks, { id, title, url, createdAt: Date.now() }],
        }));
      },

      removeBookmark: (id) => {
        set((s) => ({
          bookmarks: s.bookmarks.filter((b) => b.id !== id),
        }));
      },

      isBookmarked: (url) => get().bookmarks.some((b) => b.url === url),

      /* ─── History Actions ───────────────────────────────────── */

      addHistoryEntry: (url, title) => {
        const id = `hist-${Date.now()}`;
        set((s) => ({
          history: [{ id, url, title, visitedAt: Date.now() }, ...s.history].slice(0, 500),
        }));
      },

      clearHistory: () => set({ history: [] }),

      /* ─── Profile Actions ───────────────────────────────────── */

      addProfile: (name, color, theme) => {
        const id = `profile-${Date.now()}`;
        set((s) => ({
          profiles: [...s.profiles, { id, name, color, theme }],
        }));
      },

      removeProfile: (id) => {
        if (id === 'profile-default') return;
        const { profiles, activeProfileId } = get();
        const next = profiles.filter((p) => p.id !== id);
        set({
          profiles: next,
          activeProfileId: activeProfileId === id ? 'profile-default' : activeProfileId,
        });
      },

      switchProfile: (id) => {
        const profile = get().profiles.find((p) => p.id === id);
        if (!profile) return;
        set((s) => ({
          activeProfileId: id,
          settings: { ...s.settings, theme: profile.theme },
        }));
      },

      /* ─── Settings ──────────────────────────────────────────── */

      setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),
      setSearchEngine: (searchEngine) => set((s) => ({ settings: { ...s.settings, searchEngine } })),
      setZoom: (zoomLevel) =>
        set((s) => ({
          settings: { ...s.settings, zoomLevel: Math.max(50, Math.min(200, zoomLevel)) },
        })),
      toggleBookmarksBar: () =>
        set((s) => ({
          settings: { ...s.settings, showBookmarksBar: !s.settings.showBookmarksBar },
        })),
      setHomePage: (homePage) => set((s) => ({ settings: { ...s.settings, homePage } })),

      /* ─── Panels ────────────────────────────────────────────── */

      toggleHistory: () => set((s) => ({ showHistory: !s.showHistory, showSettings: false })),
      toggleSettings: () => set((s) => ({ showSettings: !s.showSettings, showHistory: false })),
      setFindText: (findText) => set({ findText }),
      toggleFind: () => set((s) => ({ showFind: !s.showFind, findText: s.showFind ? '' : s.findText })),
    }),
    {
      name: 'rmhbrowser-store',
      partialize: (s) => ({
        bookmarks: s.bookmarks,
        history: s.history.slice(0, 200),
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        settings: s.settings,
      }),
    },
  ),
);

export { NEW_TAB_URL, SEARCH_URLS };
