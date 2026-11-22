/**
 * Pinned posts in communities (s09-06), pure part: the cap, the refusal sentence and the one move a menu item makes.
 * Moderators pin up to three top-level posts; the order is theirs (position 0 leads).
 */

/** Most posts a community can pin. */
export const PIN_LIMIT = 3;

/** The sentence for the fourth pin (also the server's `error`; the menu shows its own translation). */
export const PIN_LIMIT_MESSAGE = 'A community can pin three posts. Unpin one first.';

export type PinDirection = 'up' | 'down';

/** Where a pinned post can move to. The first cannot go up, the last cannot go down. */
export function pinMoves(order: readonly string[], postId: string): { up: boolean; down: boolean } {
  const i = order.indexOf(postId);
  return { up: i > 0, down: i >= 0 && i < order.length - 1 };
}

/** The order after moving one post a place, or `null` when it cannot move that way. */
export function movePinned(order: readonly string[], postId: string, dir: PinDirection): string[] | null {
  const i = order.indexOf(postId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return null;
  const next = [...order];
  [next[i], next[j]] = [next[j] as string, next[i] as string];
  return next;
}

/** Refusals the pin endpoints answer with, as `code` on a 4xx body. */
export type PinErrorCode = 'not_found' | 'pin_limit' | 'order_mismatch';
