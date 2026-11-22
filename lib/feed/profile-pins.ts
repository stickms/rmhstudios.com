/**
 * Pinned posts on a profile (sprint 05 #19), the parts that need no database.
 *
 * A member pins up to three of their own posts. The order is stored in `pinnedAt` itself (earlier is higher), so no
 * column was added: pinning stamps a time later than every other pin, and moving a post swaps two `pinnedAt` values.
 */

/** How many posts a member can pin at once. */
export const PIN_LIMIT = 3;

/** Dispatched on `window` after a pin is added, removed or moved, so an open profile loads its first page again. */
export const PROFILE_PINS_CHANGED = 'rmh:profile-pins-changed';

export type PinDirection = 'up' | 'down';

export interface PinSlot {
  id: string;
  pinnedAt: Date;
}

/** A pin's place among the member's live pins: 1 is the top of the profile. */
export interface PinPlace {
  /** 1-based; `null` when the post is not pinned. */
  order: number | null;
  /** How many live pins the member has. */
  count: number;
}

/** Oldest `pinnedAt` first, the order a profile shows them. Equal times fall back to the id so the order is stable. */
export function sortPins<T extends PinSlot>(pins: readonly T[]): T[] {
  return [...pins].sort(
    (a, b) => a.pinnedAt.getTime() - b.pinnedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function pinPlace(pins: readonly PinSlot[], postId: string): PinPlace {
  const index = sortPins(pins).findIndex((p) => p.id === postId);
  return {
    order: index < 0 ? null : index + 1,
    count: pins.length,
  };
}

/** True when a new pin has no slot left. */
export function pinsAreFull(count: number): boolean {
  return count >= PIN_LIMIT;
}

/**
 * The `pinnedAt` a new pin takes: now, but never earlier than (or equal to) the last pin, so it always lands last even
 * if the clocks of two servers disagree by a few milliseconds.
 */
export function nextPinnedAt(pins: readonly PinSlot[], now: Date): Date {
  let last = -Infinity;
  for (const p of pins) last = Math.max(last, p.pinnedAt.getTime());
  return new Date(Math.max(now.getTime(), last + 1));
}

export interface PinSwap {
  /** The post that moves, and the time it takes. */
  moved: PinSlot;
  /** The neighbour it trades places with, and the time it takes. */
  neighbour: PinSlot;
}

/**
 * Trading places with the neighbour above (`up`) or below (`down`): each takes the other's `pinnedAt`. `null` when
 * the post is not pinned or already at that end.
 */
export function swapWithNeighbour(pins: readonly PinSlot[], postId: string, direction: PinDirection): PinSwap | null {
  const ordered = sortPins(pins);
  const index = ordered.findIndex((p) => p.id === postId);
  if (index < 0) return null;
  const other = ordered[direction === 'up' ? index - 1 : index + 1];
  if (!other) return null;
  const self = ordered[index]!;
  return {
    moved: {
      id: self.id,
      pinnedAt: other.pinnedAt,
    },
    neighbour: {
      id: other.id,
      pinnedAt: self.pinnedAt,
    },
  };
}

/** The server's refusal text when no slot is left (the menu shows its own translated sentence for the same case). */
export function pinLimitMessage(): string {
  return `You can pin up to ${PIN_LIMIT} posts. Unpin one first.`;
}

/** Which move rows a pinned post's menu offers. */
export function moveOptions(place: PinPlace): {
  up: boolean;
  down: boolean;
} {
  if (place.order === null)
    return {
      up: false,
      down: false,
    };
  return {
    up: place.order > 1,
    down: place.order < place.count,
  };
}
