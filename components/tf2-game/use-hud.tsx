/**
 * React access to the HUD store (`lib/tf2-game/client/hud-store.ts`), the
 * screen geometry (the virtual-unit scale and the layout table) and the
 * player's settings, shared by every HUD panel through context.
 */
'use client';

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { HudState } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import type { GameSettings } from '@/lib/tf2-game/client/settings';
import { hudScale, resolvePanel, type HudLayout, type HudScreen } from './hud-layout';

export interface HudContextValue {
  store: HudStore;
  layout: HudLayout;
  screen: HudScreen;
  settings: GameSettings;
}

const HudContext = createContext<HudContextValue | null>(null);

export function HudProvider({ value, children }: { value: HudContextValue; children: ReactNode }) {
  return <HudContext.Provider value={value}>{children}</HudContext.Provider>;
}

export function useHudContext(): HudContextValue {
  const v = useContext(HudContext);
  if (!v) throw new Error('HUD components must be inside <HudProvider>');
  return v;
}

/** The current HUD snapshot. */
export function useHudState(): HudState {
  const { store } = useHudContext();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The absolute-position style for a named layout panel (undefined when the layout hides it). */
export function usePanelStyle(name: string): CSSProperties | undefined {
  const { layout, screen } = useHudContext();
  const panel = layout[name];
  if (!panel || panel.visible === false) return undefined;
  const r = resolvePanel(panel, screen, hudScale(screen));
  return { left: r.left, top: r.top, width: r.width, height: r.height, zIndex: panel.zpos ?? 0 };
}
