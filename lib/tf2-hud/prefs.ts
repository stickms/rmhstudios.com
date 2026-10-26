/**
 * Per-viewer editor preferences. Kept in localStorage — they are conveniences,
 * not data: losing them (private window, cleared storage) costs a click.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Tf2HudTheme = 'dark' | 'light' | 'high-contrast';

export interface Tf2HudPrefs {
  theme: Tf2HudTheme;
  /** Left/right panel widths, as percentages of the workspace. */
  treeOpen: boolean;
  rightOpen: boolean;
  rightTab: 'inspector' | 'code' | 'test' | 'history' | 'diff' | 'problems' | 'assets';
  treeFilter: 'all' | 'modified' | 'problems';
  /** Save signed-in HUDs to the account in the background. */
  cloudAutosave: boolean;
  setTheme(theme: Tf2HudTheme): void;
  set<K extends keyof Omit<Tf2HudPrefs, 'set' | 'setTheme'>>(key: K, value: Tf2HudPrefs[K]): void;
}

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    // Storage can throw (blocked cookies, private windows); fall back to memory.
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useTf2HudPrefs = create<Tf2HudPrefs>()(
  persist(
    (set) => ({
      theme: 'dark',
      treeOpen: true,
      rightOpen: true,
      rightTab: 'inspector',
      treeFilter: 'all',
      cloudAutosave: true,
      setTheme: (theme) => set({ theme }),
      set: (key, value) => set({ [key]: value } as Partial<Tf2HudPrefs>),
    }),
    { name: 'rmh-tf2-hud-prefs', storage: safeStorage, version: 1 },
  ),
);
