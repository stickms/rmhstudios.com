/**
 * Feed keyboard navigation: the pure half (sprint 08 07).
 *
 * `j` / `k` move DOM focus from post to post and a few single keys act on the post that has focus. The key bindings
 * are declared in `registry.ts` (`FEED_NAV_SHORTCUTS`); the handler that moves focus and runs the actions is
 * `components/feed/feed-nav.tsx`. This file holds what needs no DOM: the index arithmetic, the rule for where the keys
 * are off, and the ids.
 */

import { isTypingTarget as isTextField } from './registry';

/** The ids of the nine bindings, in the order the help overlay lists them. */
export const FEED_NAV_IDS = [
  'feed.nav.next',
  'feed.nav.prev',
  'feed.nav.open',
  'feed.nav.like',
  'feed.nav.reply',
  'feed.nav.repost',
  'feed.nav.save',
  'feed.nav.reveal',
  'feed.nav.leave',
] as const;

export type FeedNavId = (typeof FEED_NAV_IDS)[number];

export function isFeedNavId(id: string): id is FeedNavId {
  return (FEED_NAV_IDS as readonly string[]).includes(id);
}

/** The post to move to after `current` among `count` posts. `current < 0` means none has focus: start at the first. */
export function nextIndex(current: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return 0;
  return Math.min(current + 1, count - 1);
}

/** The post to move to before `current`. With none focused, `k` goes to the first too. It never wraps. */
export function prevIndex(current: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return 0;
  return Math.max(current - 1, 0);
}

/**
 * The first post in view for a `j` with no post focused: the first whose bottom edge is below the top of the viewport
 * and whose top edge is above its bottom. Falls back to the first post when none is in view.
 */
export function firstInView(
  rects: ReadonlyArray<{
    top: number;
    bottom: number;
  }>,
  viewportHeight: number,
): number {
  if (rects.length === 0) return -1;
  const i = rects.findIndex((r) => r.bottom > 0 && r.top < viewportHeight);
  return i < 0 ? 0 : i;
}

/** Text fields, selects and rich-text widgets: the keys are typing there. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false; // no DOM (a server render)
  return isTextField(target);
}

/** Roles whose contents own the keyboard while they are open. */
export const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';

/** What counts as an open dialog or menu anywhere on the page (focus can sit on `body` behind a modal). */
export const OPEN_OVERLAY_SELECTOR =
  '[role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden]), [role="menu"]:not([hidden]), [aria-modal="true"]';

/** Is the target inside a dialog or a menu? */
export function isOverlayTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null;
}

/**
 * Should the feed keys do nothing for this event? True in a text field, inside a dialog or a menu, and while any
 * dialog or menu is open anywhere on the page (focus can be on `body` behind a modal).
 */
export function feedKeysOff(target: EventTarget | null, root: ParentNode | null): boolean {
  if (isTypingTarget(target) || isOverlayTarget(target)) return true;
  return root?.querySelector(OPEN_OVERLAY_SELECTOR) != null;
}
