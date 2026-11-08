/**
 * The pointer variable (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3 "Soft
 * body is CSS").
 *
 * ONE delegated service writes `--px` / `--py` — the pointer's position as a percentage of the host's box — on the
 * single jelly host under a fine pointer. CSS reads them to place the plasma wake under the hovering pointer and the
 * dent's light dot under a press (`app/jelly-material.css` §8). It replaces the fallback cursor light
 * (which appended a span per host and moved it per pointer move) and the soft-body physics' pointer tracking, both
 * deleted. Nothing else moves: hover plump, press squash and the release spring are CSS transitions.
 *
 * It also writes `--jelly-s`, the host's larger side in px (unitless), on the hovered element and every soft-body host
 * around it, so the CSS can cap each pose to the 4 px edge bound (`MOTION_BOUNDS.maxEdgeTravelPx`): edge travel is
 * `S · |scale − 1| / 2`, and a pose is clamped at `--jelly-edge-reach / --jelly-s` (CSS assumes 1000 until it is
 * written, a keyboard press for instance). Ancestors are sized too because they move with it (a card plumps while its
 * button is hovered), and they are the ones big enough to need it.
 *
 * Cost rules:
 * - **One fan-out.** Input arrives through the jelly pointer hub (`lib/jelly/pointer.ts`, `onJellyPointer`); this
 *   module adds no pointer listener of its own. Frames come from the one jelly frame driver (`lib/jelly/frame.ts`).
 * - **One rect read per change.** The host (and the sized chain) is resolved when the pointer enters a new element
 *   (`closest()` only); the rects are read on the next frame, once each, and the host's is cached; a move reads
 *   nothing. A scroll (capture, passive) only drops the cached position rect (sizes do not change with scrolling).
 * - **One write per frame, only while over a host.** A move stores the coordinates and wakes the driver, which writes
 *   the variables (only when they changed) and goes back to sleep. Off a host nothing is scheduled at all.
 * - **Cleared on leave.** Moving to another host moves the variables; leaving every host, `pointercancel`, and leaving
 *   the window remove them, so nothing stays lit.
 * - **Touch presses are sized, nothing else.** Touch has no hover: a touch `pointerdown` sizes the pressed chain at
 *   once (one rect read each, no frame), and `pointerup` / `pointercancel` clear it. On a `(hover: none)` device that is
 *   ALL this installs: three hub subscriptions, no movement tracking, no frame, no scroll listener, no `--px`.
 * - **Opt-outs.** A host that opts out (`jellyOptedOut`: `data-jelly="off"` and its aliases, the globe) is skipped for
 *   the host around it (a JellyGroup's flat member lights the group) and is never sized. Inside an opt-out scope
 *   (`data-jelly-scope="off"`, a game's `data-jelly-zone="playfield"`) nothing is written, nor on a native-material
 *   route (`html.native-material`) or while a game is in play (`html[data-game-state='playing']`).
 *
 * Client-only; nothing runs at import. Mounted once per document by `hooks/useLiquidInteractions.ts`.
 */
import { drive } from './frame';
import { onJellyPointer } from './pointer';
import { FINE_POINTER_QUERY, JELLY_SELECTOR, OPT_OUT_SCOPE_SELECTOR, jellyOptedOut } from './tiers';

/** The driver order: after the frame's producers, before anything that would read the variables. */
const ORDER = 25;
/** Pointer types that hover. */
const HOVERING = new Set(['mouse', 'pen']);
/** Everything the CSS soft body may move (app/jelly-material.css §8): the jelly hosts plus the bare controls. */
const SIZED_SELECTOR = `${JELLY_SELECTOR},button,[role="button"],[role="tab"],[role="menuitem"],[role="switch"],[role="option"],summary,[data-fluid-press]`;
/** A sized chain never climbs further than this (the page's outer wrappers are panes, never moved). */
const MAX_CHAIN = 8;

const pct = (v: number) => `${+Math.min(100, Math.max(0, v)).toFixed(1)}%`;

type Box = { left: number; top: number; width: number; height: number };

/**
 * Install the pointer variable service on `doc`. Returns the teardown, which unsubscribes, removes its scroll
 * listener and clears every variable it wrote.
 */
export function installPointerVars(doc: Document = document): () => void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win || typeof win.matchMedia !== 'function') return () => {};
  const fine = win.matchMedia(FINE_POINTER_QUERY).matches;
  const root = doc.documentElement;

  const blocked = () =>
    root.classList.contains('native-material') ||
    root.getAttribute('data-game-state') === 'playing';

  /** The soft-body hosts under `target`, innermost first: what `--jelly-s` is written on. */
  const chainFor = (target: EventTarget | null): HTMLElement[] => {
    const t = target as Element | null;
    if (!t || typeof t.closest !== 'function' || t.closest(OPT_OUT_SCOPE_SELECTOR)) return [];
    const out: HTMLElement[] = [];
    let el = t.closest<HTMLElement>(SIZED_SELECTOR);
    while (el && out.length < MAX_CHAIN) {
      if (!jellyOptedOut(el)) out.push(el);
      el = el.parentElement?.closest<HTMLElement>(SIZED_SELECTOR) ?? null;
    }
    return out;
  };
  /** Size `chain` (one rect read each); returns the rects read, for reuse. */
  const writeSizes = (chain: readonly HTMLElement[]): Map<HTMLElement, Box> => {
    const rects = new Map<HTMLElement, Box>();
    for (const el of chain) {
      const r = el.getBoundingClientRect();
      rects.set(el, r);
      el.style.setProperty('--jelly-s', `${Math.max(1, Math.round(Math.max(r.width, r.height)))}`);
    }
    return rects;
  };
  const clearSizes = (chain: readonly HTMLElement[]) => {
    for (const el of chain) el.style.removeProperty('--jelly-s');
  };

  // ── Touch: size the pressed chain, nothing else ─────────────────────────
  let pressed: HTMLElement[] = [];
  const releasePress = () => {
    clearSizes(pressed);
    pressed = [];
  };
  const press = (e: PointerEvent) => {
    if (fine && HOVERING.has(e.pointerType)) return;
    releasePress();
    if (blocked()) return;
    pressed = chainFor(e.target);
    writeSizes(pressed);
  };
  const touchOffs = [
    onJellyPointer('pointerdown', press, win),
    onJellyPointer('pointerup', releasePress, win),
  ];
  if (!fine) {
    const offCancel = onJellyPointer('pointercancel', releasePress, win);
    return () => {
      for (const off of touchOffs) off();
      offCancel();
      releasePress();
    };
  }

  // ── Fine pointer: the hover host's position and the sized chain ─────────
  let host: HTMLElement | null = null;
  let rect: Box | null = null;
  /** The last element the pointer was over: the host is resolved again only when it changes. */
  let lastTarget: EventTarget | null = null;
  let x = 0;
  let y = 0;
  let written: [string, string] | null = null;
  /** The chain sized now, and the one the next frame sizes (null: unchanged). */
  let sized: HTMLElement[] = [];
  let nextChain: HTMLElement[] | null = null;

  const clear = () => {
    if (host) {
      host.style.removeProperty('--px');
      host.style.removeProperty('--py');
    }
    host = null;
    rect = null;
    written = null;
  };
  const clearAll = () => {
    clear();
    clearSizes(sized);
    sized = [];
    nextChain = null;
  };

  /** The jelly host for `target`: the nearest host that has not opted out, none inside an opt-out scope. */
  const hostFor = (target: EventTarget | null): HTMLElement | null => {
    const t = target as Element | null;
    if (!t || typeof t.closest !== 'function') return null;
    if (t.closest(OPT_OUT_SCOPE_SELECTOR)) return null;
    let el = t.closest<HTMLElement>(JELLY_SELECTOR);
    while (el && jellyOptedOut(el))
      el = el.parentElement?.closest<HTMLElement>(JELLY_SELECTOR) ?? null;
    return el;
  };

  const paint = () => {
    if (blocked()) {
      clearAll();
      return false;
    }
    if (nextChain) {
      const keep = new Set(nextChain);
      clearSizes(sized.filter((el) => !keep.has(el)));
      const rects = writeSizes(nextChain.filter((el) => el.isConnected));
      sized = nextChain;
      nextChain = null;
      if (host && rects.has(host)) rect = rects.get(host)!;
    }
    if (!host) return false;
    if (!host.isConnected) {
      clear();
      return false;
    }
    rect ??= host.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return false;
    const px = pct(((x - rect.left) / rect.width) * 100);
    const py = pct(((y - rect.top) / rect.height) * 100);
    if (written?.[0] !== px) host.style.setProperty('--px', px);
    if (written?.[1] !== py) host.style.setProperty('--py', py);
    written = [px, py];
    return false;
  };
  const driver = drive(paint, { order: ORDER }, win);

  const sameChain = (a: readonly HTMLElement[], b: readonly HTMLElement[]) =>
    a.length === b.length && a.every((el, i) => el === b[i]);

  const track = (e: PointerEvent) => {
    if (!HOVERING.has(e.pointerType)) return;
    if (e.target !== lastTarget) {
      lastTarget = e.target;
      const off = blocked();
      const next = off ? null : hostFor(e.target);
      if (next !== host) {
        clear();
        host = next;
      }
      const chain = off ? [] : chainFor(e.target);
      if (!sameChain(chain, nextChain ?? sized)) {
        if (chain.length) nextChain = chain;
        else {
          clearSizes(sized);
          sized = [];
          nextChain = null;
        }
      }
    }
    if (!host && !nextChain) return;
    x = e.clientX;
    y = e.clientY;
    driver.wake();
  };
  const cancel = () => {
    lastTarget = null;
    clearAll();
    releasePress();
  };
  const out = (e: PointerEvent) => {
    // Leaving the window (no element to go to): nothing is under the pointer any more.
    if (!e.relatedTarget) cancel();
  };
  const invalidate = () => {
    rect = null;
  };

  const offs = [
    ...touchOffs,
    onJellyPointer('pointerover', track, win),
    onJellyPointer('pointermove', track, win),
    onJellyPointer('pointercancel', cancel, win),
    onJellyPointer('pointerout', out, win),
  ];
  doc.addEventListener('scroll', invalidate, { capture: true, passive: true });

  return () => {
    for (const off of offs) off();
    doc.removeEventListener('scroll', invalidate, true);
    driver.stop();
    clearAll();
    releasePress();
    lastTarget = null;
  };
}
