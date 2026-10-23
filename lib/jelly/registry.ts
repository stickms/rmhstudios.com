/**
 * The jelly registry: the one place that knows which jelly hosts exist, which are on screen, and where they are
 * (master plan §4.3). The shader engine, the CSS carriers, the soft-body physics and the arcs all read it, so four
 * services cost one IntersectionObserver, one ResizeObserver and one MutationObserver instead of four of each.
 *
 * ## What it never does
 *
 * - Run a frame. There is no `requestAnimationFrame` here: it is driven entirely by observer callbacks, a scroll-end
 *   timer and `resize`.
 * - Read layout per pointer event. Rects are cached: the IntersectionObserver hands them over for free, and one batched
 *   `getBoundingClientRect` pass refreshes the visible set at scroll end, on resize and after a size change. While a
 *   scroll is in flight the cache is stale by design; consumers that need an exact rect at one moment (an arc strike)
 *   re-read just the elements involved.
 * - Touch `window` at import. Everything starts in {@link createJellyRegistry}, so the module is SSR-safe.
 *
 * Mutations are batched: the MutationObserver only queues roots, and one timer pass resolves them, so a route render
 * that adds a thousand nodes costs one `querySelectorAll` per added subtree root, once.
 *
 * ## Lost layers
 *
 * The services inject nodes React does not know about (`JELLY_LAYER_SELECTOR`: the `.jelly-flow` carrier, the rim
 * canvas, the `.jelly-haze-canvas`). React never removes them on its own paths — except `setTextContent`, which wipes
 * every child of a host whose children become a lone string (a `<Button>` going "Save" → "Saved" or icon → text). The
 * host keeps its membership, so nothing else would tell the services their node is gone and their `data-jelly-flow` /
 * `data-liquid-canvas` attribute is now a lie. A removed node that matches the layer selector, from a host that is
 * still connected, therefore counts as a change: consumers are notified in the same batched mutation pass, and
 * re-check their own nodes there (a `parentNode` comparison — no layout read). A service removing its own node costs
 * one extra no-op pass.
 */
import {
  GLOBE_SELECTOR,
  JELLY_LAYER_SELECTOR,
  JELLY_SELECTOR,
  jellyOptedOut,
  type JellyBudget,
} from './tiers';

/** Elements that match a role but are never jelly hosts (they draw themselves, or are the globe / eversion layers). */
export const REGISTRY_EXCLUDE = `${GLOBE_SELECTOR},.radial-hub__orb,.eversion-overlay,.evert-ghost,canvas,video,iframe`;

/** Attributes whose change can make an element (or its subtree) join or leave the registry. */
const WATCHED_ATTRIBUTES = [
  'class',
  'data-jelly',
  'data-jelly-scope',
  'data-jelly-zone',
  'data-slot',
  'data-evert',
  'data-liquid-glass',
  'data-liquid-material',
  'data-liquid-motion',
  'data-fluid-press',
  'data-sonner-toast',
];

/** Quiet time after the last `scroll` that counts as scroll end (where `scrollend` is missing). */
export const SCROLL_END_MS = 150;
/** Coalescing delay for size-driven rect refreshes and mutation batches. */
const SETTLE_MS = 32;

export type JellyRole = 'overlay' | 'chrome' | 'pane' | 'fill' | 'control' | 'other';

/** Ambient-slot priority (04 §3.1): overlay → chrome → pane → fill → control. Lower is first. */
export const ROLE_PRIORITY: Readonly<Record<JellyRole, number>> = {
  overlay: 0,
  chrome: 1,
  pane: 2,
  fill: 3,
  control: 4,
  other: 5,
};

export interface JellyRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface JellyEntry {
  readonly el: Element;
  readonly role: JellyRole;
  /** Discovery order: a stable tie-break. */
  readonly order: number;
  /** Intersecting the viewport (rootMargin 0). */
  visible: boolean;
  /** Viewport rect at the last refresh (see {@link JellyRegistry.epoch}). */
  rect: JellyRect;
}

export interface JellyPoint {
  x: number;
  y: number;
}

export interface JellyRegistry {
  /** Visible entries with cached rects. The array is rebuilt on change, so holding it is safe. */
  visible(): readonly JellyEntry[];
  /**
   * The entries that get an ambient haze canvas: visible, ranked by role then distance to `focus` (the pointer on a
   * fine pointer; omitted = viewport centre), capped by `hazeSlots` and — when given a budget — by its animated area.
   */
  ambientSlots(
    budget: Pick<JellyBudget, 'hazeSlots'> | number,
    focus?: JellyPoint | null,
  ): JellyEntry[];
  /** Same ranking, capped by `carriers` (or a plain count — physics passes `budget.bodies`). */
  liveSet(budget: Pick<JellyBudget, 'carriers'> | number, focus?: JellyPoint | null): JellyEntry[];
  entryFor(el: Element): JellyEntry | undefined;
  /** Called after membership, visibility or the rect cache changes. Returns the unsubscribe. */
  onChange(cb: () => void): () => void;
  /** True between the first `scroll` and scroll end: rects are stale and ambient work should hold. */
  readonly scrolling: boolean;
  /** Bumped on every rect refresh, so consumers can cache derived geometry by epoch. */
  readonly epoch: number;
  /** One batched rect read for every visible entry. Called for you at scroll end and on resize. */
  refresh(): void;
  dispose(): void;
}

/**
 * Whether `el` is a jelly host: matches {@link JELLY_SELECTOR}, is not one of the {@link REGISTRY_EXCLUDE} layers, and
 * is not opted out (which includes the liquid globe's own elements, `GLOBE_SELECTOR`). The registry's whole admission
 * rule — every service that walks the registry (carriers, arcs, physics neighbours) inherits it.
 */
export function isJellyHost(el: Element): boolean {
  return el.matches(JELLY_SELECTOR) && !el.matches(REGISTRY_EXCLUDE) && !jellyOptedOut(el);
}

const roleOf = (el: Element): JellyRole =>
  el.matches('.glass-overlay,[data-sonner-toast]')
    ? 'overlay'
    : el.matches('.glass-chrome')
      ? 'chrome'
      : el.matches('.glass-pane,.app-glass')
        ? 'pane'
        : el.matches(
              // The app tier's adapter surfaces (components/shared/app-theme.css) are cards.
              '.glass-fill,.glass-interactive,[data-jelly="card"],[data-liquid-surface],.app-theme [class~="bg-(--app-surface)"]',
            )
          ? 'fill'
          : el.matches(
                '.glass-inset,[data-evert],[data-slot="button"],[data-slot="input"],[data-slot="textarea"],[data-jelly="control"]',
              )
            ? 'control'
            : 'other';

const EMPTY_RECT: JellyRect = { left: 0, top: 0, width: 0, height: 0 };

const toRect = (r: { left: number; top: number; width: number; height: number }): JellyRect => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/**
 * Rank `entries` for slot assignment: role priority first, then squared distance from the rect centre to `focus`,
 * then discovery order. Pure; exported for the tests and for consumers that rank a subset.
 */
export function rankEntries(entries: readonly JellyEntry[], focus: JellyPoint): JellyEntry[] {
  const dist = (e: JellyEntry) => {
    const dx = e.rect.left + e.rect.width / 2 - focus.x;
    const dy = e.rect.top + e.rect.height / 2 - focus.y;
    return dx * dx + dy * dy;
  };
  return [...entries].sort(
    (a, b) =>
      ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] || dist(a) - dist(b) || a.order - b.order,
  );
}

/**
 * Take ranked entries up to `count`, and — when `maxArea` is finite — skip any entry that would push the summed area
 * past it (a smaller one further down may still fit). Pure.
 */
export function takeWithin(
  ranked: readonly JellyEntry[],
  count: number,
  maxArea = Infinity,
): JellyEntry[] {
  const out: JellyEntry[] = [];
  let area = 0;
  for (const e of ranked) {
    if (out.length >= count) break;
    const a = e.rect.width * e.rect.height;
    if (area + a > maxArea) continue;
    area += a;
    out.push(e);
  }
  return out;
}

const isElement = (n: Node | null | undefined): n is Element => !!n && n.nodeType === 1;

export function createJellyRegistry(doc: Document = document): JellyRegistry {
  const win = doc.defaultView;
  const entries = new Map<Element, JellyEntry>();
  const listeners = new Set<() => void>();
  let order = 0;
  let epoch = 0;
  let scrolling = false;
  let disposed = false;
  let visibleCache: JellyEntry[] | null = null;
  let viewportW = win?.innerWidth ?? 0;
  let viewportH = win?.innerHeight ?? 0;

  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let mutationTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingRoots = new Set<Element>();
  let pendingRemoval = false;
  /** A service layer was taken out of a still-connected host since the last pass (see "Lost layers"). */
  let pendingLayerLoss = false;

  const notify = () => {
    visibleCache = null;
    for (const fn of [...listeners]) fn();
  };

  const visibility = win
    ? new win.IntersectionObserver(
        (records) => {
          for (const r of records) {
            const e = entries.get(r.target);
            if (!e) continue;
            e.visible = r.isIntersecting;
            // The observer already measured it: take the rect for free.
            e.rect = toRect(r.boundingClientRect);
          }
          notify();
        },
        { rootMargin: '0px' },
      )
    : null;
  const sizes = win ? new win.ResizeObserver(() => scheduleRefresh()) : null;

  const eligible = isJellyHost;

  /** Returns true when membership changed. */
  const track = (el: Element): boolean => {
    if (!eligible(el)) return untrack(el);
    if (entries.has(el)) return false;
    entries.set(el, { el, role: roleOf(el), order: order++, visible: false, rect: EMPTY_RECT });
    visibility?.observe(el);
    sizes?.observe(el);
    return true;
  };
  const untrack = (el: Element): boolean => {
    if (!entries.delete(el)) return false;
    visibility?.unobserve(el);
    sizes?.unobserve(el);
    return true;
  };
  const trackTree = (root: Element): boolean => {
    let changed = track(root);
    root.querySelectorAll(JELLY_SELECTOR).forEach((el) => {
      if (track(el)) changed = true;
    });
    return changed;
  };

  const flushMutations = () => {
    mutationTimer = undefined;
    if (disposed) return;
    let changed = pendingLayerLoss;
    pendingLayerLoss = false;
    if (pendingRemoval) {
      pendingRemoval = false;
      for (const el of [...entries.keys()]) if (!el.isConnected && untrack(el)) changed = true;
    }
    for (const root of pendingRoots) if (root.isConnected && trackTree(root)) changed = true;
    pendingRoots.clear();
    if (changed) notify();
  };
  const scheduleMutations = () => {
    if (mutationTimer === undefined) mutationTimer = setTimeout(flushMutations, SETTLE_MS);
  };

  const tree = win
    ? new win.MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'attributes') {
            if (isElement(r.target)) pendingRoots.add(r.target);
            continue;
          }
          if (r.removedNodes.length) {
            pendingRemoval = true;
            // `matches` on the removed nodes only: no layout, no subtree walk.
            if (!pendingLayerLoss && isElement(r.target) && r.target.isConnected) {
              r.removedNodes.forEach((n) => {
                if (isElement(n) && n.matches(JELLY_LAYER_SELECTOR)) pendingLayerLoss = true;
              });
            }
          }
          r.addedNodes.forEach((n) => {
            // A service layer being (re)inserted is not content: never a host, never a subtree to walk.
            if (isElement(n) && !n.matches(JELLY_LAYER_SELECTOR)) pendingRoots.add(n);
          });
        }
        if (pendingRoots.size || pendingRemoval) scheduleMutations();
      })
    : null;

  const refresh = () => {
    if (disposed) return;
    if (win) {
      viewportW = win.innerWidth;
      viewportH = win.innerHeight;
    }
    // One read pass, no writes in between: a single layout at most.
    for (const e of entries.values()) if (e.visible) e.rect = toRect(e.el.getBoundingClientRect());
    epoch++;
    notify();
  };
  function scheduleRefresh() {
    if (scrolling || refreshTimer !== undefined) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      refresh();
    }, SETTLE_MS);
  }

  const scrollEnd = () => {
    if (scrollTimer !== undefined) clearTimeout(scrollTimer);
    scrollTimer = undefined;
    if (!scrolling) return;
    scrolling = false;
    refresh();
  };
  const onScroll = () => {
    scrolling = true;
    if (scrollTimer !== undefined) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(scrollEnd, SCROLL_END_MS);
  };
  const onResize = () => {
    scheduleRefresh();
  };

  if (win) {
    const root = doc.documentElement;
    trackTree(root);
    tree?.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRIBUTES,
    });
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
    doc.addEventListener('scrollend', scrollEnd, { capture: true, passive: true });
    win.addEventListener('resize', onResize, { passive: true });
  }

  const centre = (): JellyPoint => ({ x: viewportW / 2, y: viewportH / 2 });
  const visibleEntries = (): JellyEntry[] => {
    if (!visibleCache) visibleCache = [...entries.values()].filter((e) => e.visible);
    return visibleCache;
  };
  const pick = (
    count: number,
    viewports: number | undefined,
    focus: JellyPoint | null | undefined,
  ): JellyEntry[] => {
    if (count <= 0) return [];
    const maxArea =
      viewports === undefined ? Infinity : viewports * Math.max(1, viewportW * viewportH);
    return takeWithin(rankEntries(visibleEntries(), focus ?? centre()), count, maxArea);
  };

  return {
    visible: visibleEntries,
    ambientSlots: (budget, focus) =>
      typeof budget === 'number'
        ? pick(budget, undefined, focus)
        : pick(budget.hazeSlots, (budget as Partial<JellyBudget>).animatedViewports, focus),
    liveSet: (budget, focus) =>
      typeof budget === 'number'
        ? pick(budget, undefined, focus)
        : pick(budget.carriers, (budget as Partial<JellyBudget>).animatedViewports, focus),
    entryFor: (el) => entries.get(el),
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    get scrolling() {
      return scrolling;
    },
    get epoch() {
      return epoch;
    },
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      visibility?.disconnect();
      sizes?.disconnect();
      tree?.disconnect();
      for (const t of [scrollTimer, refreshTimer, mutationTimer])
        if (t !== undefined) clearTimeout(t);
      if (win) {
        doc.removeEventListener('scroll', onScroll, { capture: true });
        doc.removeEventListener('scrollend', scrollEnd, { capture: true });
        win.removeEventListener('resize', onResize);
      }
      entries.clear();
      listeners.clear();
      visibleCache = null;
    },
  };
}

// ── The shared instance ─────────────────────────────────────────────────────

const installed = new WeakMap<Document, { registry: JellyRegistry; refs: number }>();

/**
 * Mount the document's registry (reference-counted, so the integration hook and a test page can both install it) and
 * return the teardown. Consumers then read it with {@link jellyRegistry}.
 */
export function installJellyRegistry(doc: Document = document): () => void {
  const slot = installed.get(doc) ?? { registry: createJellyRegistry(doc), refs: 0 };
  installed.set(doc, slot);
  slot.refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--slot.refs > 0) return;
    slot.registry.dispose();
    if (installed.get(doc) === slot) installed.delete(doc);
  };
}

/** The document's installed registry, or null before {@link installJellyRegistry} (and always during SSR). */
export function jellyRegistry(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): JellyRegistry | null {
  return doc ? (installed.get(doc)?.registry ?? null) : null;
}
