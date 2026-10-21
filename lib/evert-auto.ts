/**
 * Every control everts, not only the ones somebody tagged (owner, 2026-10-21: "ensure the eversion ALWAYS PLAYS ON
 * EVERY BUTTON, INPUT BOX, ETC" and "if an animation doesn't exist for a specific interactive UI element create one
 * the same way we did globe eversion").
 *
 * The state layer (globals.css §7.3) is opt-in: a control carrying `data-evert` turns its state out of the press
 * point on a spring. The shared primitives carry it, but the site has hundreds of hand-made buttons, links, tabs and
 * fields that do not, and they changed state with a colour fade or not at all. This adopts them on first contact,
 * from the same delegated listener that writes the point (`hooks/useEvertPoint.ts`), so nothing has to remember to:
 *
 * - **A control whose `::before` is free** is tagged `data-evert="auto"` and gets the very same layer as a tagged
 *   one. It is armed first (`data-evert-arming` holds the layer at rest for one style pass), so a control adopted by
 *   the hover or focus that is already on it still everts out of the point instead of popping in.
 * - **A control that cannot hold the layer** — a text field, a textarea or a select (replaced elements have no
 *   pseudo-elements), or one whose `::before` the site already uses — gets a ghost instead: one shared,
 *   body-level `.evert-ghost` laid over its box, its own shape (the control's computed radius), that everts out of
 *   the same point on the same spring. Two of them: one for hover and press, one that stays on the focused field.
 *   They are positioned with `translate` (the compositor), re-placed only on scroll and resize while one is up, and
 *   never per frame.
 *
 * What is left alone: controls with their own state animation (the switch, native checkboxes and radios, the hub's
 * orb and globe), anything under `[data-evert-off]`, the effect's own layers, and anything as large as half the
 * viewport (a full-screen catcher would turn the whole screen over).
 */

/** What can change state under a pointer or a key. */
export const INTERACTIVE = [
  'button',
  'a[href]',
  'summary',
  'select',
  'textarea',
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"])',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="treeitem"]',
].join(', ');

/** Never adopted: their own animation, an opt-out, or the effect's own layers. */
const LEFT_ALONE =
  '[data-evert-off], [data-evert-off] *, [data-slot="switch"], [data-globe-surface], .radial-hub__orb, .radial-hub__overlay *, .eversion-overlay *, .evert-popup';

/** Elements with no pseudo-elements of their own. */
const REPLACED = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export type EvertMode = 'layer' | 'ghost' | null;

const decided = new WeakMap<Element, EvertMode>();

/** The nearest control under `target` that should evert: tagged already, or one to adopt. */
export function controlAt(target: EventTarget | null): HTMLElement | null {
  const el = (target as Element | null)?.closest?.<HTMLElement>(`[data-evert], ${INTERACTIVE}`);
  if (!el || el.matches(LEFT_ALONE)) return null;
  return el;
}

function pseudoFree(el: Element, which: '::before' | '::after'): boolean {
  const content = getComputedStyle(el, which).content;
  return content === 'none' || content === 'normal' || content === '';
}

/** Has an absolutely positioned descendant whose containing block a `relative` would change. */
function anchorsDescendants(el: Element): boolean {
  const all = el.getElementsByTagName('*');
  // A control is small; a large subtree is not a control worth a full walk.
  if (all.length > 60) return true;
  for (let i = 0; i < all.length; i++) {
    const p = getComputedStyle(all[i]!).position;
    if (p === 'absolute' || p === 'fixed') return true;
  }
  return false;
}

/**
 * Decide how `el` everts (once per element): its own layer, a ghost, or not at all. Tags it on the first call when
 * it takes the layer.
 */
export function adopt(el: HTMLElement): EvertMode {
  if (el.hasAttribute('data-evert')) return 'layer';
  const known = decided.get(el);
  if (known !== undefined) return known;
  let mode: EvertMode;
  const style = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (style.display === 'contents' || style.display === 'none') mode = null;
  else if (r.width * r.height > 0.5 * window.innerWidth * window.innerHeight) mode = null;
  else if (REPLACED.has(el.tagName)) mode = 'ghost';
  else if (!pseudoFree(el, '::before')) mode = 'ghost';
  else if (style.position === 'static' && anchorsDescendants(el)) mode = 'ghost';
  else mode = 'layer';
  decided.set(el, mode);
  if (mode === 'layer') {
    // Held at rest for one style pass, so the state already on it (the hover that found it, the focus that
    // moved to it) everts in instead of popping.
    el.setAttribute('data-evert-arming', '');
    el.setAttribute('data-evert', 'auto');
    void getComputedStyle(el, '::before').scale;
    el.removeAttribute('data-evert-arming');
  }
  return mode;
}

/* ── The ghosts ────────────────────────────────────────────────────────────── */

export type GhostKind = 'hover' | 'focus';

interface Ghost {
  el: HTMLElement;
  target: HTMLElement | null;
}

const ghosts: Partial<Record<GhostKind, Ghost>> = {};
let following = false;

function ghostFor(kind: GhostKind): Ghost {
  let g = ghosts[kind];
  if (!g || !g.el.isConnected) {
    const el = document.createElement('div');
    el.className = 'evert-ghost';
    el.setAttribute('data-kind', kind);
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    g = { el, target: null };
    ghosts[kind] = g;
  }
  return g;
}

function place(g: Ghost): void {
  const t = g.target;
  if (!t || !t.isConnected) return;
  const r = t.getBoundingClientRect();
  g.el.style.translate = `${r.left.toFixed(1)}px ${r.top.toFixed(1)}px`;
  const w = `${r.width.toFixed(1)}px`;
  const h = `${r.height.toFixed(1)}px`;
  if (g.el.style.width !== w) g.el.style.width = w;
  if (g.el.style.height !== h) g.el.style.height = h;
}

const reflow = () => {
  for (const g of Object.values(ghosts)) if (g?.target) place(g);
};

function follow(on: boolean): void {
  if (on === following) return;
  following = on;
  const opts = { capture: true, passive: true } as const;
  if (on) {
    window.addEventListener('scroll', reflow, opts);
    window.addEventListener('resize', reflow, opts);
  } else {
    window.removeEventListener('scroll', reflow, opts);
    window.removeEventListener('resize', reflow, opts);
  }
}

/**
 * Turn the `kind` ghost out of (x, y) over `target` (client px; `null` = the centre). Moving it to a different
 * control starts it from rest there, so it never slides from one control to the next.
 */
export function showGhost(
  kind: GhostKind,
  target: HTMLElement,
  x: number | null,
  y: number | null,
): void {
  const g = ghostFor(kind);
  const r = target.getBoundingClientRect();
  if (g.target !== target) {
    g.el.removeAttribute('data-on');
    g.el.removeAttribute('data-pressed');
    g.el.style.transition = 'none';
    g.target = target;
    g.el.style.borderRadius = getComputedStyle(target).borderRadius;
    place(g);
    void g.el.offsetWidth;
    g.el.style.transition = '';
  }
  const px = x === null ? r.width / 2 : Math.min(Math.max(x - r.left, 0), r.width);
  const py = y === null ? r.height / 2 : Math.min(Math.max(y - r.top, 0), r.height);
  g.el.style.setProperty('--evert-x', `${px.toFixed(1)}px`);
  g.el.style.setProperty('--evert-y', `${py.toFixed(1)}px`);
  g.el.setAttribute('data-on', '');
  follow(true);
}

/** Swallow the `kind` ghost back into (x, y) (or where it came out of). */
export function hideGhost(kind: GhostKind, target?: HTMLElement, x?: number, y?: number): void {
  const g = ghosts[kind];
  if (!g || !g.target || (target && g.target !== target)) return;
  if (x !== undefined && y !== undefined) {
    const r = g.target.getBoundingClientRect();
    g.el.style.setProperty(
      '--evert-x',
      `${Math.min(Math.max(x - r.left, 0), r.width).toFixed(1)}px`,
    );
    g.el.style.setProperty(
      '--evert-y',
      `${Math.min(Math.max(y - r.top, 0), r.height).toFixed(1)}px`,
    );
  }
  g.el.removeAttribute('data-on');
  g.el.removeAttribute('data-pressed');
  if (!Object.values(ghosts).some((o) => o?.el.hasAttribute('data-on'))) follow(false);
}

/** Deepen the hover ghost while a press is down on its control. */
export function pressGhost(target: HTMLElement, on: boolean): void {
  const g = ghosts.hover;
  if (!g || g.target !== target) return;
  if (on) g.el.setAttribute('data-pressed', '');
  else g.el.removeAttribute('data-pressed');
}

/** The control a ghost is on, or `null`. */
export function ghostTarget(kind: GhostKind): HTMLElement | null {
  return ghosts[kind]?.target ?? null;
}

/** Remove both ghosts (the listener unmounting). */
export function disposeGhosts(): void {
  follow(false);
  for (const kind of ['hover', 'focus'] as const) {
    ghosts[kind]?.el.remove();
    delete ghosts[kind];
  }
}
