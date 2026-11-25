/**
 * The route announcer's browser half (`components/shell/RouteAnnouncer.tsx` is the live region).
 *
 * One subscription to the router's `onResolved` event and two passive capture listeners that
 * remember whether the last input was a key press or a pointer press. Nothing observes the DOM
 * and nothing runs between navigations (B3, R5): the title is read from the router's resolved
 * matches, never by watching the document.
 */
import {
  announcementText,
  nextInputKind,
  pathnameChanged,
  shouldMoveFocus,
  type InputKind,
} from '@/lib/router/route-announce';

export const ROUTE_ANNOUNCER_ID = 'route-announcer';
export const MAIN_CONTENT_ID = 'main-content';

interface ResolvedEvent {
  fromLocation?: { pathname: string };
  toLocation: { pathname: string };
}

interface RouterLike {
  subscribe: (event: 'onResolved', fn: (event: ResolvedEvent) => void) => unknown;
  state: { matches: ReadonlyArray<{ meta?: unknown }> };
}

interface FocusableLike {
  focus: (options?: { preventScroll?: boolean }) => void;
}

interface DocLike {
  title: string;
  body: unknown;
  activeElement: unknown;
  documentElement: { classList: { contains: (name: string) => boolean } };
  getElementById: (
    id: string,
  ) => (FocusableLike & { textContent: string | null; dataset?: Record<string, string | undefined> }) | null;
  addEventListener: (type: string, fn: () => void, options: { capture: boolean; passive: boolean }) => void;
  removeEventListener: (type: string, fn: () => void, options: { capture: boolean }) => void;
}

interface ActiveLike {
  isConnected?: boolean;
  isContentEditable?: boolean;
  tagName?: string;
  closest?: (selector: string) => unknown;
}

/**
 * Focus that must stay where it is: a field the user is typing in, or anything inside an open
 * dialog. (Only consulted for a keyboard-started navigation; a removed element is not held.)
 */
function focusIsHeld(active: unknown): boolean {
  const el = active as ActiveLike | null;
  if (!el || el.isConnected === false) return false;
  if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName ?? '')) return true;
  return Boolean(el.closest?.('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'));
}

/** The title the router resolved: the deepest match that names one, as the document title does. */
function resolvedTitle(matches: ReadonlyArray<{ meta?: unknown }>): string | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const meta = matches[i]?.meta;
    if (!Array.isArray(meta)) continue;
    for (const entry of meta) {
      const title = (entry as { title?: unknown } | null | undefined)?.title;
      if (typeof title === 'string' && title.trim() !== '') return title;
    }
  }
  return undefined;
}

/**
 * Browser-only, once per page load (app/router.tsx latches it). Returns a function that removes
 * the listeners and the subscription's effect, for tests.
 */
export function installRouteAnnouncer(router: RouterLike, doc: DocLike = document as unknown as DocLike): () => void {
  let input: InputKind = 'none';
  let live = true;

  const onKey = () => {
    input = nextInputKind(input, 'keydown');
  };
  const onPointer = () => {
    input = nextInputKind(input, 'pointerdown');
  };
  doc.addEventListener('keydown', onKey, { capture: true, passive: true });
  doc.addEventListener('pointerdown', onPointer, { capture: true, passive: true });

  router.subscribe('onResolved', (event) => {
    if (!live) return;
    const startedBy = input;
    input = 'none';
    if (!pathnameChanged(event.fromLocation, event.toLocation)) return;

    const region = doc.getElementById(ROUTE_ANNOUNCER_ID);
    if (region) {
      const text = announcementText(resolvedTitle(router.state.matches) ?? doc.title) || region.dataset?.fallback || '';
      // Cleared and rewritten, so a repeat of the same title is heard again.
      region.textContent = '';
      region.textContent = text;
    }

    const active = doc.activeElement;
    const focusOnBody = !active || active === doc.body;
    if (
      !(startedBy === 'keyboard' && !focusOnBody && focusIsHeld(active)) &&
      shouldMoveFocus({ input: startedBy, focusOnBody, appRoute: doc.documentElement.classList.contains('app-route') })
    ) {
      doc.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true });
    }
  });

  return () => {
    live = false;
    doc.removeEventListener('keydown', onKey, { capture: true });
    doc.removeEventListener('pointerdown', onPointer, { capture: true });
  };
}
