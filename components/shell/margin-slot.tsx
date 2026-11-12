import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The DOM node in the shell's margin column that pages may portal content into (Steel L6).
 *
 * A page contributes margin content through `PageLayout`'s `rightSidebar` prop. It is delivered by **portal** rather than
 * by lifting the node into shell state on purpose: a `setState(node)` in an effect re-runs on every render (the element
 * is a fresh object each time) and loops forever. A portal re-renders the children in place with no shell state at all.
 *
 * The node is `null` until the margin mounts, that is during SSR and below 1280px where the margin is not displayed, so
 * callers must tolerate it being absent. Margin content is supplementary, never load-bearing.
 */
interface MarginSlot {
  node: HTMLElement | null;
  setNode: (node: HTMLElement | null) => void;
}

const MarginSlotContext = createContext<MarginSlot>({ node: null, setNode: () => {} });

/** Wraps the content column and the margin so the first can portal into the second. Renders no element. */
export function MarginSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ node, setNode }), [node]);
  return <MarginSlotContext.Provider value={value}>{children}</MarginSlotContext.Provider>;
}

/** The margin's page slot, for `ContextRail`. */
export function useMarginSlot(): HTMLElement | null {
  return useContext(MarginSlotContext).node;
}

/** A callback ref for the element that IS the slot. Used once, by `MarginColumn`. */
export function useMarginSlotRef(): (node: HTMLElement | null) => void {
  return useContext(MarginSlotContext).setNode;
}
