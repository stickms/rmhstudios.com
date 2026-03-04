/** Shared center-column width state so PageLayout ↔ FeedLayout transitions animate. */

export const DEFAULT_WIDTH = 648;
export const WIDE_WIDTH = 800;

let lastWidth = DEFAULT_WIDTH;

export function getLastCenterWidth() {
  return lastWidth;
}

export function setLastCenterWidth(w: number) {
  lastWidth = w;
}
