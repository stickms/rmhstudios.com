'use client';

/**
 * The desktop's state: open windows, the sandboxed file system, icon
 * positions and personalization. A Zustand store so any window, the taskbar
 * and the desktop can act on it without threading callbacks through the tree.
 *
 * Persisted to the viewer's localStorage (`dunesday:os`) — except the open
 * windows, which belong to a session: logging off closes them, as it should.
 * Each app's last window placement IS persisted, so a reopened window comes
 * back where you left it.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as V from '@/lib/dunesday/vfs';

export type AppId =
  | 'welcome'
  | 'planner'
  | 'calendar'
  | 'explorer'
  | 'messenger'
  | 'sync'
  | 'player'
  | 'notepad'
  | 'paint'
  | 'photos'
  | 'calculator'
  | 'cmd'
  | 'taskmgr'
  | 'ie'
  | 'minesweeper'
  | 'solitaire'
  | 'spider'
  | 'personalize'
  | 'properties'
  | 'aquarium'
  | 'about'
  | 'run'
  | 'dialog';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Win extends Rect {
  id: string;
  app: AppId;
  /** Free-form per-instance input: a folder to open, a file to edit, a title id… */
  params?: Record<string, string | undefined>;
  /** Overrides the app's title (e.g. "notes.txt - Notepad"). */
  title?: string;
  z: number;
  min: boolean;
  max: boolean;
  snap: 'left' | 'right' | null;
}

export type Wallpaper = 'meadow' | 'arrakis' | 'aurora' | 'harmony';
export type GlassColor =
  'sky' | 'twilight' | 'seafoam' | 'leaf' | 'ruby' | 'gold' | 'slate' | 'violet';

export interface Prefs {
  wallpaper: Wallpaper;
  glass: GlassColor;
  transparency: boolean;
  iconSize: 'small' | 'medium' | 'large';
  screensaverMin: number;
  textScale: 1 | 1.25 | 1.5;
  highContrast: boolean;
  reduceMotion: boolean;
  showGadgets: boolean;
  autoArrange: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  wallpaper: 'meadow',
  glass: 'sky',
  transparency: true,
  iconSize: 'medium',
  screensaverMin: 0,
  textScale: 1,
  highContrast: false,
  reduceMotion: false,
  showGadgets: true,
  autoArrange: false,
};

export interface OsState {
  // session
  windows: Win[];
  zTop: number;
  activeId: string | null;
  peek: boolean;
  snapPreview: 'left' | 'right' | 'max' | null;
  clipboard: { op: 'copy' | 'cut'; ids: string[] } | null;
  // persisted
  vfs: V.Vfs;
  vfsUser: string | null;
  iconPos: Record<string, { col: number; row: number }>;
  /** Desktop gadget offsets from their default spot in the sidebar column. */
  gadgetPos: Record<string, { x: number; y: number }>;
  placements: Partial<Record<AppId, Rect>>;
  prefs: Prefs;
  firstRun: boolean;
}

export interface OsActions {
  open: (
    app: AppId,
    opts?: { params?: Win['params']; title?: string; rect?: Partial<Rect>; reuse?: boolean },
  ) => string;
  close: (id: string) => void;
  closeAll: () => void;
  focus: (id: string | null) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  setSnap: (id: string, snap: Win['snap'] | 'max') => void;
  setRect: (id: string, rect: Partial<Rect>) => void;
  setTitle: (id: string, title: string) => void;
  setParams: (id: string, params: Win['params']) => void;
  showDesktop: () => void;
  setPeek: (peek: boolean) => void;
  setSnapPreview: (s: OsState['snapPreview']) => void;
  setClipboard: (c: OsState['clipboard']) => void;
  /** Apply a pure VFS operation; returns false (and leaves state alone) when it throws. */
  fs: (op: (vfs: V.Vfs) => V.Vfs) => V.VfsError | null;
  ensureVfs: (user: string, shortcuts: { id: string; name: string }[]) => void;
  setIconPos: (id: string, pos: { col: number; row: number }) => void;
  clearIconPos: () => void;
  setGadgetPos: (id: string, pos: { x: number; y: number }) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setFirstRun: (v: boolean) => void;
  resetSession: () => void;
}

const CASCADE = 28;

export const useOs = create<OsState & OsActions>()(
  persist(
    (set, get) => ({
      windows: [],
      zTop: 10,
      activeId: null,
      peek: false,
      snapPreview: null,
      clipboard: null,
      vfs: {},
      vfsUser: null,
      iconPos: {},
      gadgetPos: {},
      placements: {},
      prefs: DEFAULT_PREFS,
      firstRun: true,

      open: (app, opts = {}) => {
        const s = get();
        const reuse = opts.reuse ?? true;
        if (reuse) {
          const existing = s.windows.find(
            (w) =>
              w.app === app && JSON.stringify(w.params ?? {}) === JSON.stringify(opts.params ?? {}),
          );
          if (existing) {
            const z = s.zTop + 1;
            set({
              zTop: z,
              activeId: existing.id,
              windows: s.windows.map((w) => (w.id === existing.id ? { ...w, min: false, z } : w)),
            });
            return existing.id;
          }
        }
        const id = `${app}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const z = s.zTop + 1;
        const placed = s.placements[app];
        const offset = (s.windows.length % 8) * CASCADE;
        const base: Rect = {
          x: 80 + offset,
          y: 40 + offset,
          w: 760,
          h: 520,
          ...(placed ?? {}),
          ...opts.rect,
        };
        // A remembered placement opens where it was; a second copy cascades off it.
        if (placed && s.windows.some((w) => w.app === app)) {
          base.x += CASCADE;
          base.y += CASCADE;
        }
        const win: Win = {
          id,
          app,
          params: opts.params,
          title: opts.title,
          ...base,
          z,
          min: false,
          max: false,
          snap: null,
        };
        set({ windows: [...s.windows, win], zTop: z, activeId: id });
        return id;
      },
      close: (id) =>
        set((s) => {
          const windows = s.windows.filter((w) => w.id !== id);
          const top = [...windows].filter((w) => !w.min).sort((a, b) => b.z - a.z)[0];
          return { windows, activeId: s.activeId === id ? (top?.id ?? null) : s.activeId };
        }),
      closeAll: () => set({ windows: [], activeId: null }),
      focus: (id) =>
        set((s) => {
          if (!id) return { activeId: null };
          const z = s.zTop + 1;
          return {
            zTop: z,
            activeId: id,
            peek: false,
            windows: s.windows.map((w) => (w.id === id ? { ...w, z, min: false } : w)),
          };
        }),
      minimize: (id) =>
        set((s) => {
          const windows = s.windows.map((w) => (w.id === id ? { ...w, min: true } : w));
          const top = windows.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0];
          return { windows, activeId: top?.id ?? null };
        }),
      toggleMax: (id) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, max: !w.max, snap: null } : w)),
        })),
      setSnap: (id, snap) =>
        set((s) => ({
          windows: s.windows.map((w) =>
            w.id === id
              ? snap === 'max'
                ? { ...w, max: true, snap: null }
                : { ...w, snap, max: false }
              : w,
          ),
        })),
      setRect: (id, rect) =>
        set((s) => {
          const windows = s.windows.map((w) => (w.id === id ? { ...w, ...rect } : w));
          const win = windows.find((w) => w.id === id);
          const placements = win
            ? { ...s.placements, [win.app]: { x: win.x, y: win.y, w: win.w, h: win.h } }
            : s.placements;
          return { windows, placements };
        }),
      setTitle: (id, title) =>
        set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) })),
      setParams: (id, params) =>
        set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, params } : w)) })),
      showDesktop: () =>
        set((s) => {
          const anyOpen = s.windows.some((w) => !w.min);
          return {
            windows: s.windows.map((w) => ({ ...w, min: anyOpen })),
            activeId: null,
            peek: false,
          };
        }),
      setPeek: (peek) => set({ peek }),
      setSnapPreview: (snapPreview) => set({ snapPreview }),
      setClipboard: (clipboard) => set({ clipboard }),
      fs: (op) => {
        try {
          set({ vfs: op(get().vfs) });
          return null;
        } catch (e) {
          if (e instanceof V.VfsError) return e;
          throw e;
        }
      },
      ensureVfs: (user, shortcuts) =>
        set((s) => {
          if (!s.vfs[V.ROOT]) return { vfs: V.seed(user, shortcuts), vfsUser: user };
          // The profile folder follows whoever signs in on this browser.
          if (s.vfsUser !== user && s.vfs[V.HOME]) {
            return { vfs: { ...s.vfs, [V.HOME]: { ...s.vfs[V.HOME], name: user } }, vfsUser: user };
          }
          return {};
        }),
      setIconPos: (id, pos) => set((s) => ({ iconPos: { ...s.iconPos, [id]: pos } })),
      clearIconPos: () => set({ iconPos: {} }),
      setGadgetPos: (id, pos) => set((s) => ({ gadgetPos: { ...s.gadgetPos, [id]: pos } })),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setFirstRun: (firstRun) => set({ firstRun }),
      resetSession: () =>
        set({ windows: [], activeId: null, peek: false, snapPreview: null, clipboard: null }),
    }),
    {
      name: 'dunesday:os',
      version: 1,
      // The server renders the login screen with defaults; rehydrating after
      // mount (DunesdayOS calls `useOs.persist.rehydrate()`) keeps the first
      // client render identical to it.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        vfs: s.vfs,
        vfsUser: s.vfsUser,
        iconPos: s.iconPos,
        gadgetPos: s.gadgetPos,
        placements: s.placements,
        prefs: s.prefs,
        firstRun: s.firstRun,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<OsState>;
        return { ...current, ...p, prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}) } };
      },
    },
  ),
);
