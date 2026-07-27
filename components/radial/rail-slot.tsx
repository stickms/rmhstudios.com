'use client';

import { createContext, useContext } from 'react';

/**
 * The DOM node in the shell's live rail that pages may portal content into.
 *
 * A page contributes rail content through `PageLayout`'s `rightSidebar` prop.
 * It is delivered by **portal** rather than by lifting the node into shell state
 * on purpose: a `setState(node)` in an effect re-runs on every render (the
 * element is a fresh object each time) and loops forever. A portal re-renders
 * the children in place with no shell state at all.
 *
 * `null` until the rail mounts — i.e. during SSR and below the rail's
 * breakpoint — so callers must tolerate it being absent.
 */
export const RailSlotContext = createContext<HTMLElement | null>(null);

export function useRailSlot(): HTMLElement | null {
  return useContext(RailSlotContext);
}
