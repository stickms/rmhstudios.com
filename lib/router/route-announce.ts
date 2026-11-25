/**
 * What a screen reader hears after a client-side navigation, and when focus follows it.
 *
 * The site is a single-page app: following a link swaps content with no page load, so
 * assistive technology hears nothing unless the page says so. Everything here is pure; the
 * router subscription, the listeners and the DOM writes are in `route-announce-client.ts`.
 */

/** The site name the title helpers append; it is the same on every page, so it is not announced. */
const SITE_SUFFIX = /\s*[|—–-]\s*RMH Studios\s*$/i;

/** The announced words for a document title: the page's own name, without the site suffix. */
export function announcementText(title: string | null | undefined): string {
  if (typeof title !== 'string') return '';
  const stripped = title.replace(SITE_SUFFIX, '').trim();
  // A title that was only the site name names no page.
  return /^RMH Studios$/i.test(stripped) ? '' : stripped;
}

type Located = { pathname: string };

function normalised(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * True when the navigation changed the pathname. A search- or hash-only change (a filter, a
 * game's tab, an in-page anchor) is the same page and announces nothing.
 */
export function pathnameChanged(from: Located | null | undefined, to: Located): boolean {
  if (!from) return false; // the first load is the browser's own page load, which it announces
  return normalised(from.pathname) !== normalised(to.pathname);
}

export type InputKind = 'keyboard' | 'pointer' | 'none';

/** The last input before a navigation, from the two events the tracker listens to. */
export function nextInputKind(current: InputKind, eventType: string): InputKind {
  if (eventType === 'keydown') return 'keyboard';
  if (eventType === 'pointerdown') return 'pointer';
  return current;
}

export interface FocusMoveInput {
  input: InputKind;
  /** Focus is on `<body>` (or nowhere) once the new page has rendered. */
  focusOnBody: boolean;
  /** `html.app-route`: a full-screen game or app, which manages its own focus. */
  appRoute: boolean;
}

/**
 * Whether focus moves to `#main-content` after the navigation: on the site tier only, when
 * the navigation began at the keyboard, or when the element that had focus is gone and focus
 * fell to `<body>`. A pointer-started navigation that left focus on a link keeps it there.
 */
export function shouldMoveFocus({ input, focusOnBody, appRoute }: FocusMoveInput): boolean {
  if (appRoute) return false;
  return input === 'keyboard' || focusOnBody;
}
