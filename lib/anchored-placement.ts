/**
 * Pure placement maths for a menu anchored to a trigger in the page
 * (`components/ui/anchored-menu`). Kept separate from the component for the same
 * reason `viewport-fit.ts` is: the interesting part is arithmetic about
 * rectangles, and arithmetic is worth testing without a DOM.
 *
 * The panel is `position: fixed`, so the result is expressed as viewport-edge
 * offsets — the edge each value is measured from is named by `side`/`align`.
 */

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The usable viewport box: already inset by the edge margin and safe areas. */
export interface PlacementBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type PlacementSide = 'top' | 'bottom';
export type PlacementAlign = 'start' | 'end';

export interface PlacementInput {
  anchor: AnchorRect;
  /** The panel's height with no cap applied. */
  panelHeight: number;
  bounds: PlacementBounds;
  viewport: { width: number; height: number };
  /** Preferred side. Kept whenever it can hold the whole panel. */
  side: PlacementSide;
  align: PlacementAlign;
  /** Gap between the trigger and the panel. */
  gap: number;
}

export interface Placement {
  side: PlacementSide;
  /** Distance from the viewport edge opposite `side` (`top`/`bottom` in CSS). */
  offset: number;
  /** Distance from the viewport edge named by `align` (`left`/`right` in CSS). */
  inset: number;
  /** Cap for the room the chosen side actually has; overflow scrolls. */
  maxHeight: number;
}

/**
 * Resolve which side a menu opens on, where it sits, and how tall it may be.
 *
 * The preferred side wins while it can hold the whole panel. When it cannot,
 * the side with MORE room wins — not the other side unconditionally, which is
 * the trap: the composer sits near the top of the feed, so a tall menu asking
 * to open upward has too little room above, but often even less below, and
 * flipping on the first failed fit would make it worse.
 */
export function resolveAnchoredPlacement({
  anchor,
  panelHeight,
  bounds,
  viewport,
  side,
  align,
  gap,
}: PlacementInput): Placement {
  const roomAbove = anchor.top - gap - bounds.top;
  const roomBelow = bounds.bottom - anchor.bottom - gap;
  const preferredRoom = side === 'top' ? roomAbove : roomBelow;
  const resolved: PlacementSide =
    preferredRoom >= panelHeight ? side : roomAbove > roomBelow ? 'top' : 'bottom';
  const room = resolved === 'top' ? roomAbove : roomBelow;

  return {
    side: resolved,
    offset: resolved === 'top' ? viewport.height - anchor.top + gap : anchor.bottom + gap,
    inset:
      align === 'end'
        ? Math.max(viewport.width - bounds.right, viewport.width - anchor.right)
        : Math.max(bounds.left, anchor.left),
    maxHeight: Math.max(0, Math.min(panelHeight, room)),
  };
}
