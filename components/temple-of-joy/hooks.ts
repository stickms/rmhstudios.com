/**
 * How the temple reads its own state.
 *
 * The game ticks on every animation frame, so the naive
 * `useTempleStore(s => s.joy)` would re-render the tree sixty times a second —
 * and the blessing list is three hundred rows. Three access patterns instead,
 * chosen by what the value actually is:
 *
 * - `useTempleValue` — discrete state that changes on a user action (the open
 *   tab, the theme, a dialog flag). Straight zustand subscription; instant.
 * - `useTempleSnapshot` — continuous state that only needs to *look* live
 *   (prices, affordability, cooldowns, growth). Sampled on a shared interval.
 * - `<LiveValue>` (in `ui.tsx`) — the headline figures, written straight into a
 *   DOM node every frame with no React render at all.
 */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTempleStore } from '@/lib/temple-of-joy/store';

type Store = ReturnType<typeof useTempleStore.getState>;

/**
 * Discrete state. Re-renders only when the selected value actually changes.
 *
 * Written against `useSyncExternalStore` rather than calling the zustand hook,
 * for one reason: zustand v5 serves `getInitialState()` as the *server*
 * snapshot, so anything selected through it reads the state as of store
 * creation during a server render — which is invisible in the browser and
 * quietly wrong everywhere else, including in a render test. The temple is
 * lazy-loaded behind an auth gate and never server-renders in anger, so there
 * is no hydration mismatch to protect against and reading the live state is
 * simply more correct.
 *
 * `select` must return a primitive or a stable reference. A selector that
 * builds a fresh object on every call will loop — the same constraint zustand
 * itself imposes, and the reason `useTempleSnapshot` exists for derived state.
 */
export function useTempleValue<T>(select: (s: Store) => T): T {
  const latest = useRef(select);
  latest.current = select;
  const read = () => latest.current(useTempleStore.getState());
  return useSyncExternalStore(useTempleStore.subscribe, read, read);
}

/**
 * A shared heartbeat. One interval per cadence for the whole tree rather than
 * one per component, so twenty rows sampling at 250ms cost one timer.
 */
const beats = new Map<number, { listeners: Set<() => void>; timer: number }>();

function subscribeBeat(ms: number, onChange: () => void): () => void {
  let beat = beats.get(ms);
  if (!beat) {
    beat = { listeners: new Set(), timer: 0 };
    beats.set(ms, beat);
    beat.timer = window.setInterval(() => {
      for (const listener of [...beat!.listeners]) listener();
    }, ms);
  }
  beat.listeners.add(onChange);

  return () => {
    const current = beats.get(ms);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      window.clearInterval(current.timer);
      beats.delete(ms);
    }
  };
}

/**
 * Sample derived game state on a fixed cadence.
 *
 * `read` runs against the live store on every beat; the component re-renders
 * only when the result differs from last time (shallow-compared), so a row
 * whose price and affordability are unchanged costs nothing but the read.
 */
export function useTempleSnapshot<T>(read: (s: Store) => T, ms = 250): T {
  const [value, setValue] = useState(() => read(useTempleStore.getState()));
  const latest = useRef(read);
  latest.current = read;
  const previous = useRef(value);
  previous.current = value;

  useEffect(() => {
    const sample = () => {
      const next = latest.current(useTempleStore.getState());
      if (!shallowEqual(previous.current, next)) {
        previous.current = next;
        setValue(next);
      }
    };
    sample();
    return subscribeBeat(ms, sample);
  }, [ms]);

  return value;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Flag a row for one animation after a purchase.
 *
 * A list where every row looks identical before and after a click reads as
 * broken, and the price change alone is too subtle to notice while scrolling.
 * Returns the id currently flashing, plus the setter to call on purchase.
 */
export function useFlash(ms = 420): [string | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (next: string) => {
    window.clearTimeout(timer.current);
    setId(next);
    timer.current = window.setTimeout(() => setId(null), ms);
  };

  return [id, flash];
}

/**
 * Paint the document itself in the temple's colours.
 *
 * `.toj` is `position: fixed; inset: 0`, so it covers the layout viewport and
 * nothing else. Everything outside it — the strip behind the status bar, the
 * one behind iOS Safari's floating bottom bar, the overscroll gutter — is
 * painted by the document, and the document was painting white.
 *
 * Two reasons, both in `globals.css`. `body { background: var(--site-bg) }`
 * with `min-height: 100%` covers whatever the root element was given, so the
 * inline theme script's `documentElement.style.backgroundColor` never showed.
 * And a game route is in `THEME_EXCLUDED_ROUTES`, so no `style-*` class is
 * applied and `--site-bg` keeps its light default however dark the rest of the
 * user's site is. A dark temple in a white frame, permanently.
 *
 * So the game paints the document for as long as it is on screen, reading its
 * OWN ground rather than a copy of it — `--toj-ground` resolves through
 * `data-theme`, so Vespers follows for free — and puts back exactly what it
 * found on the way out.
 *
 * The `theme-color` tag is the one that tints Safari's chrome, and `__root.tsx`
 * deliberately omits it site-wide because the site's chrome is a gradient
 * aurora that a flat bar cannot match. It says so, and says a route whose own
 * colour IS flat may set one. This is that route: at the very top and bottom
 * the room is its ground colour and nothing else. The tag is marked
 * `data-toj-theme` so it can never be confused with the site's own
 * `data-rmh-theme` one, which the site's runtime mirror is the only thing
 * allowed to touch.
 */
export function useDocumentTheme(ref: React.RefObject<HTMLElement | null>): void {
  const theme = useTempleValue((s) => s.theme);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ground = getComputedStyle(el).getPropertyValue('--toj-ground').trim();
    if (!ground) return;

    const html = document.documentElement;
    const { body } = document;
    const before = {
      htmlBg: html.style.backgroundColor,
      htmlScheme: html.style.colorScheme,
      bodyBg: body.style.backgroundColor,
    };

    html.style.backgroundColor = ground;
    body.style.backgroundColor = ground;
    // Dawn is a cream page and Vespers a near-black one; the browser's own
    // furniture — scrollbars, form controls, the rubber-band gutter — should
    // agree with whichever is up.
    html.style.colorScheme = theme === 'vespers' ? 'dark' : 'light';

    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = ground;
    meta.setAttribute('data-toj-theme', '');
    document.head.appendChild(meta);

    return () => {
      html.style.backgroundColor = before.htmlBg;
      html.style.colorScheme = before.htmlScheme;
      body.style.backgroundColor = before.bodyBg;
      meta.remove();
    };
  }, [ref, theme]);
}

/**
 * The stacked layout — altar above, list below.
 *
 * Stated once, because two things depend on the answer and neither is purely
 * CSS: where the COUNTER mounts (inside the room on a phone, above both columns
 * on a wide screen), and what object is doing the scrolling (the document when
 * stacked, the dock otherwise). It is the exact complement of the side-by-side
 * condition in `temple-of-joy.css`; keep the two in step.
 */
export const STACKED_QUERY = '(max-width: 33.99rem), (max-width: 61.99rem) and (min-height: 34.01rem)';

export function useStackedLayout(): boolean {
  return useMediaQuery(STACKED_QUERY);
}

/**
 * Where the navigation goes — and it is a *separate* question from the layout.
 *
 * It used to be the same question, and that is what made a phone in landscape
 * look broken. Sideways, the temple is two columns, so the tabs went into the
 * dock as a rail — a horizontal scroller in a 24rem column, holding ten
 * destinations. It showed three of them, the labels overlapped the glyphs
 * because a flex child in a scroller shrinks unless told not to, and the other
 * seven were behind a swipe on a strip that does not look like a scroller.
 *
 * So the two questions are asked separately now. **Layout** follows the shape of
 * the screen: two columns whenever it is wide, or short and wide. **Navigation**
 * follows the hand: below the desktop breakpoint a thumb is the pointer,
 * wherever the columns happen to be, so the bar goes along the bottom edge in
 * both layouts. Above it, the dock's wrapping grid rail shows all ten at once,
 * which is right for a mouse.
 *
 * The bar costs 3.5rem of a 390-pixel landscape screen and gives back the rail's
 * height inside the dock, which is where the list is.
 */
export const BAR_QUERY = '(max-width: 61.99rem)';

export function useBarNav(): boolean {
  return useMediaQuery(BAR_QUERY);
}

/**
 * A screen with no height to spend — a phone held sideways, essentially.
 *
 * The same threshold the stylesheet uses to lay the counter out on one line,
 * asked in JS because one thing about that row is not a style: the rate's
 * WORDING. "71.17 M joy per second" is sixty pixels wider than "71.17 M/s" on a
 * row that also has to hold a counter, four chips and a way out, and at 568px
 * the grid resolved that by truncating the rate to a single digit — which is
 * worse than not showing it. Shortening the sentence is the fix; ellipsising it
 * is not.
 */
export const SHORT_QUERY = '(max-height: 34rem)';

export function useShortViewport(): boolean {
  return useMediaQuery(SHORT_QUERY);
}

/**
 * Grow a windowed list as its end comes into view.
 *
 * An observer on a sentinel rather than arithmetic on `scrollTop`, because the
 * thing that scrolls is not the same object in both layouts: on a phone it is
 * the document, on a desktop it is the dock. The old check —
 * `scrollHeight - scrollTop - clientHeight` on the panel — reads zero for a
 * panel that no longer scrolls, which is indistinguishable from "you are at the
 * bottom", so it would have paged the entire list in at once on the layout with
 * the least memory to spare. A viewport-rooted observer is right in both, and
 * it accounts for clipping by any scrolling ancestor on the way up.
 *
 * `rootMargin` is the same 600px of lookahead the scroll maths used.
 */
export function useGrowOnApproach(
  hasMore: boolean,
  grow: () => void,
): React.RefObject<HTMLDivElement | null> {
  const sentinel = useRef<HTMLDivElement>(null);
  const onGrow = useRef(grow);
  onGrow.current = grow;

  useEffect(() => {
    const el = sentinel.current;
    if (!hasMore || !el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onGrow.current();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  return sentinel;
}
