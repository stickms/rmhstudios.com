/**
 * Per-viewer editor preferences. Kept in localStorage — they are conveniences,
 * not data: losing them (private window, cleared storage) costs a click.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Tf2HudPrefs {
  /** Left/right panel widths, as percentages of the workspace. */
  treeOpen: boolean;
  rightOpen: boolean;
  rightTab: 'inspector' | 'code' | 'scheme' | 'test' | 'history' | 'diff' | 'problems' | 'assets';
  treeFilter: 'all' | 'modified' | 'problems';
  /** Save signed-in HUDs to the account in the background. */
  cloudAutosave: boolean;
  /** TF2 language for `#Token` strings (`tf_<language>.txt`); English unless changed. */
  language: string;
  /** Most recently picked colours (VGUI `r g b a` literals), newest first. */
  recentColors: string[];
  pushRecentColor(literal: string): void;
  set<K extends keyof Omit<Tf2HudPrefs, 'set' | 'pushRecentColor'>>(
    key: K,
    value: Tf2HudPrefs[K],
  ): void;
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
      treeOpen: true,
      rightOpen: true,
      rightTab: 'inspector',
      treeFilter: 'all',
      cloudAutosave: true,
      language: 'english',
      recentColors: [],
      pushRecentColor: (literal) =>
        set((s) => ({
          recentColors: [literal, ...s.recentColors.filter((c) => c !== literal)].slice(0, 12),
        })),
      set: (key, value) => set({ [key]: value } as Partial<Tf2HudPrefs>),
    }),
    { name: 'rmh-tf2-hud-prefs', storage: safeStorage, version: 1 },
  ),
);
