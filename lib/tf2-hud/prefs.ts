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
  rightTab:
    | 'inspector'
    | 'blocks'
    | 'code'
    | 'scheme'
    | 'test'
    | 'history'
    | 'diff'
    | 'problems'
    | 'assets';
  /** What an inspector edit does to a panel that is in a block. */
  blockScope: 'block' | 'panel';
  treeFilter: 'all' | 'modified' | 'problems';
  /** Save signed-in HUDs to the account in the background. */
  cloudAutosave: boolean;
  /** TF2 language for `#Token` strings (`tf_<language>.txt`); '' follows the site's language (English when the game lacks it). */
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
      blockScope: 'block',
      treeFilter: 'all',
      cloudAutosave: true,
      language: '',
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
