/**
 * Stagger delay for the bookshelf `lib-rise` entrance animation (library.css).
 *
 * The delay follows raw reading order (DOM order == top-left → bottom-right),
 * so books cascade in order. We deliberately do NOT wrap by an assumed column
 * count: the shelf grid is responsive (`auto-fill, minmax(168px, 1fr)`), so any
 * fixed modulo makes the wave restart mid-shelf and books pop out of order.
 *
 * The delay is capped so long / lazily-appended lists stay bounded — items past
 * the cap (typically below the fold, or later infinite-scroll pages) share the
 * max delay instead of waiting ever-longer.
 */
const STEP_MS = 40;
const MAX_STEPS = 16;

export function shelfRiseDelay(index: number): string {
  return `${Math.min(index, MAX_STEPS) * STEP_MS}ms`;
}
