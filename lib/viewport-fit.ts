/** Pure viewport-edge correction shared by floating menus and popovers. */

export interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Translation required to place a rendered rect fully inside the viewport. */
export function viewportFitTranslation(
  rect: ViewportRect,
  bounds: ViewportBounds,
): { x: number; y: number } {
  let x = 0;
  let y = 0;

  if (rect.right > bounds.right) x = bounds.right - rect.right;
  if (rect.left + x < bounds.left) x = bounds.left - rect.left;
  if (rect.bottom > bounds.bottom) y = bounds.bottom - rect.bottom;
  if (rect.top + y < bounds.top) y = bounds.top - rect.top;

  return { x, y };
}
