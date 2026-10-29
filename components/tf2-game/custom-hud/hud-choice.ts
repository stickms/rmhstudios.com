/**
 * The HUD the game draws — one per page, shared by the HUD layer, the pause
 * menu's HUD view, the in-game editor and the play page's `?hud=` handoff.
 *
 * Switching never flashes: the new HUD is loaded and prepared (files, fonts,
 * textures, animations — lib/tf2-game/client/custom-hud/renderer.ts) while the
 * old one stays on screen, and only then swapped in. The choice is remembered
 * in localStorage (selection.ts); a draft the HUD editor saves in another tab
 * is picked up when it is the one in use.
 */
'use client';

import { create } from 'zustand';
import { prepareHud, type PreparedHud } from '@/lib/tf2-game/client/custom-hud/renderer';
import {
  DEFAULT_SELECTION,
  DRAFT_CHANNEL,
  isDraftSavedMessage,
  loadSelection,
  saveSelection,
  selectionKey,
  type HudSelection,
} from '@/lib/tf2-game/client/custom-hud/selection';
import { HudLoadError, loadHud, type LoadedHud } from '@/lib/tf2-game/client/custom-hud/source';

export type HudChoiceError = 'missing' | 'forbidden' | 'network';

export interface HudChoiceState {
  /** What the player picked (the active HUD once it has loaded). */
  selection: HudSelection;
  /** The custom HUD drawn now; null = the game's own (default) HUD. */
  active: PreparedHud | null;
  /** The selection being loaded, if any. */
  pending: string | null;
  error: HudChoiceError | null;
  /** The in-game HUD editor is open (the game pauses offline and gives it the keys). */
  editorOpen: boolean;
  /** Which selection the HUD editor's store holds (so reopening it keeps the work). */
  editorKey: string | null;

  /** Read the remembered choice once per page. */
  init(): void;
  /** Switch HUD. Resolves true once it is drawn (false: it failed or a later choice won). */
  choose(selection: HudSelection, opts?: { persist?: boolean }): Promise<boolean>;
  /** Use a HUD that is already loaded (the editor's "Test in game"). */
  apply(hud: LoadedHud, opts?: { persist?: boolean }): Promise<boolean>;
  setEditorOpen(open: boolean): void;
  setEditorKey(key: string | null): void;
  clearError(): void;
}

let started = false;
let seq = 0;

function errorOf(e: unknown): HudChoiceError {
  return e instanceof HudLoadError ? e.reason : 'network';
}

export const useHudChoice = create<HudChoiceState>((set, get) => {
  const swapIn = async (hud: LoadedHud, ticket: number): Promise<boolean> => {
    const prepared = await prepareHud(hud);
    if (ticket !== seq) return false;
    set({ active: prepared, pending: null, error: null });
    return true;
  };

  return {
    selection: DEFAULT_SELECTION,
    active: null,
    pending: null,
    error: null,
    editorOpen: false,
    editorKey: null,

    init() {
      if (started || typeof window === 'undefined') return;
      started = true;
      const stored = loadSelection();
      if (stored.kind !== 'default') void get().choose(stored, { persist: false });
      try {
        const channel = new BroadcastChannel(DRAFT_CHANNEL);
        channel.onmessage = (e: MessageEvent) => {
          const s = get();
          if (!isDraftSavedMessage(e.data) || s.editorOpen) return;
          if (s.selection.kind === 'draft' && s.selection.id === e.data.id)
            void s.choose(s.selection, { persist: false });
        };
      } catch {
        /* no BroadcastChannel: a reload picks the draft up */
      }
    },

    async choose(selection, opts = {}) {
      const ticket = ++seq;
      const key = selectionKey(selection);
      if (opts.persist !== false) saveSelection(selection);
      if (selection.kind === 'default') {
        set({ selection, active: null, pending: null, error: null });
        return true;
      }
      set({ selection, pending: key, error: null });
      try {
        const hud = await loadHud(selection);
        if (ticket !== seq) return false;
        return await swapIn(hud, ticket);
      } catch (e) {
        if (ticket === seq) set({ pending: null, error: errorOf(e) });
        return false;
      }
    },

    async apply(hud, opts = {}) {
      const ticket = ++seq;
      if (opts.persist !== false) saveSelection(hud.selection);
      set({ selection: hud.selection, pending: selectionKey(hud.selection), error: null });
      try {
        return await swapIn(hud, ticket);
      } catch (e) {
        if (ticket === seq) set({ pending: null, error: errorOf(e) });
        return false;
      }
    },

    setEditorOpen(open) {
      set({ editorOpen: open });
    },
    setEditorKey(key) {
      set({ editorKey: key });
    },
    clearError() {
      set({ error: null });
    },
  };
});
