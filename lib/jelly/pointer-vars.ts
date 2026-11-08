/**
 * The pointer variable (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3 "Soft
 * body is CSS").
 *
 * ONE delegated service writes `--px` / `--py` — the pointer's position as a percentage of the host's box — on the
 * single jelly host under a fine pointer. CSS reads them to place the plasma wake under the hovering pointer and the
 * dent's light dot under a press (`app/jelly-material.css` §8). It replaces the fallback cursor light
 * (`lib/liquid/runtime.ts`, which appended a span per host and moved it per pointer move) and the soft-body physics'
 * pointer tracking. Nothing else moves: hover plump, press squash and the release spring are CSS transitions.
 *
 * Cost rules:
 * - **One fan-out.** Input arrives through the jelly pointer hub (`lib/jelly/pointer.ts`, `onJellyPointer`); this
 *   module adds no pointer listener of its own. Frames come from the one jelly frame driver (`lib/jelly/frame.ts`).
 * - **One rect read per host change.** The host is resolved when the pointer enters a new element (one `closest()`),
 *   its rect is read on the next frame and cached; a move reads nothing. A scroll (capture, passive) only drops the
 *   cache, so the next frame reads the box once more where it now is.
 * - **One write per frame, only while over a host.** A move stores the coordinates and wakes the driver, which writes
 *   both variables (only when they changed) and goes back to sleep. Off a host nothing is scheduled at all.
 * - **Cleared on leave.** Moving to another host moves the variables; leaving every host, `pointercancel`, and leaving
 *   the window remove them, so nothing stays lit.
 * - **Fine pointers only.** A `(hover: none)` / coarse pointer device installs nothing — no listener, no write — and
 *   touch input on a hybrid device is ignored (touch has no hover, and the press is the CSS `:active` spring).
 * - **Opt-outs.** A host that opts out (`jellyOptedOut`: `data-jelly="off"` and its aliases, the globe) is skipped for
 *   the host around it (a JellyGroup's flat member lights the group). Inside an opt-out scope (`data-jelly-scope="off"`,
 *   a game's `data-jelly-zone="playfield"`) nothing is written, nor on a native-material route
 *   (`html.native-material`) or while a game is in play (`html[data-game-state='playing']`).
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

const pct = (v: number) => `${+Math.min(100, Math.max(0, v)).toFixed(1)}%`;

/**
 * Install the pointer variable service on `doc`. Returns the teardown, which unsubscribes, removes its scroll
 * listener and clears the variables from the current host.
 */
export function installPointerVars(doc: Document = document): () => void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win || typeof win.matchMedia !== 'function') return () => {};
  if (!win.matchMedia(FINE_POINTER_QUERY).matches) return () => {};
  const root = doc.documentElement;

  let host: HTMLElement | null = null;
  let rect: { left: number; top: number; width: number; height: number } | null = null;
  /** The last element the pointer was over: the host is resolved again only when it changes. */
  let lastTarget: EventTarget | null = null;
  let x = 0;
  let y = 0;
  let written: [string, string] | null = null;

  const blocked = () =>
    root.classList.contains('native-material') ||
    root.getAttribute('data-game-state') === 'playing';

  const clear = () => {
    if (host) {
      host.style.removeProperty('--px');
      host.style.removeProperty('--py');
    }
    host = null;
    rect = null;
    written = null;
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
    if (!host) return false;
    if (blocked() || !host.isConnected) {
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

  const track = (e: PointerEvent) => {
    if (!HOVERING.has(e.pointerType)) return;
    if (e.target !== lastTarget) {
      lastTarget = e.target;
      const next = blocked() ? null : hostFor(e.target);
      if (next !== host) {
        clear();
        host = next;
      }
    }
    if (!host) return;
    x = e.clientX;
    y = e.clientY;
    driver.wake();
  };
  const cancel = () => {
    lastTarget = null;
    clear();
  };
  const out = (e: PointerEvent) => {
    // Leaving the window (no element to go to): nothing is under the pointer any more.
    if (!e.relatedTarget) cancel();
  };
  const invalidate = () => {
    rect = null;
  };

  const offs = [
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
    clear();
    lastTarget = null;
  };
}
