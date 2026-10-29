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

/** The device's safe-area insets in CSS px (notch, rounded corners, home indicator). */
export interface HudInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: HudInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface HudContextValue {
  store: HudStore;
  layout: HudLayout;
  /** The whole game area (the crosshair and full-screen overlays centre on it). */
  screen: HudScreen;
  settings: GameSettings;
  /** Safe-area insets: layout panels are placed inside them (absent: none). */
  safe?: HudInsets;
}

/** The part of `screen` inside the safe-area insets, where the layout panels go. */
export function safeScreen(screen: HudScreen, safe: HudInsets = NO_INSETS): HudScreen {
  return { w: Math.max(1, screen.w - safe.left - safe.right), h: Math.max(1, screen.h - safe.top - safe.bottom) };
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

/**
 * The absolute-position style for a named layout panel (undefined when the layout hides it). Panels
 * are laid out inside the safe area, as a console's title-safe region: nothing under a notch or the
 * home indicator.
 */
export function usePanelStyle(name: string): CSSProperties | undefined {
  const { layout, screen, safe = NO_INSETS } = useHudContext();
  const panel = layout[name];
  if (!panel || panel.visible === false) return undefined;
  const inner = safeScreen(screen, safe);
  const r = resolvePanel(panel, inner, hudScale(inner));
  return { left: r.left + safe.left, top: r.top + safe.top, width: r.width, height: r.height, zIndex: panel.zpos ?? 0 };
}
