/**
 * Scene registry — the seam between the DOM route tree and the canvas stage.
 *
 * A converted route renders `<CanvasPage>` (in the normal react-dom tree,
 * with full router/query/i18n context), which registers its SCENE — a
 * component rendered inside the Konva stage — plus the props snapshot the
 * scene draws from. StageHost subscribes here and mounts the active scene.
 * Because CanvasPage re-registers on every render, loader/query updates in
 * the DOM tree flow into the canvas without any cross-reconciler context
 * bridging.
 */

import { create } from "zustand";
import type { ComponentType } from "react";

export type ShellVariant = "site" | "fullscreen";

export interface SceneEntry {
  /** Unique id — the route id (e.g. "/privacy"). */
  id: string;
  scene: ComponentType<Record<string, unknown>>;
  /** Props snapshot captured in the DOM tree (loader data, callbacks). */
  props: Record<string, unknown>;
  shell: ShellVariant;
  title?: string;
}

interface SceneRegistry {
  active: SceneEntry | null;
  register: (entry: SceneEntry) => void;
  unregister: (id: string) => void;
}

export const useSceneRegistry = create<SceneRegistry>((set, get) => ({
  active: null,
  register: (entry) => {
    const current = get().active;
    // Skip no-op re-registrations to avoid render loops from CanvasPage
    // re-rendering; props identity changes DO re-register (data flow).
    if (
      current &&
      current.id === entry.id &&
      current.scene === entry.scene &&
      current.props === entry.props &&
      current.shell === entry.shell
    ) {
      return;
    }
    set({ active: entry });
  },
  unregister: (id) => {
    if (get().active?.id === id) set({ active: null });
  },
}));
