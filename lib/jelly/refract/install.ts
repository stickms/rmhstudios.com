/**
 * Refractive glass: every main-site glass surface bends the page behind its rim.
 *
 * `installRefraction` is the document service (mounted by `hooks/useLiquidInteractions.ts` once the page has loaded and
 * idled). It decides WHICH hosts hold a layer and keeps each layer's picture in place; the drawing is CSS
 * (`app/jelly-refract.css`) and SVG filters (`./filters.ts`). It composes pieces that already exist rather than watching
 * the DOM itself: hosts, visibility and the scroll-end signal come from the jelly registry (`lib/jelly/registry.ts`: one
 * IntersectionObserver, one ResizeObserver, one batched MutationObserver), the picture from the scene feed and store
 * (`lib/liquid/glass/scene-feed.ts`, the globe's own snapshot), the tier and the budget from `lib/jelly/tiers.ts`.
 *
 * ## What it never does
 *
 * - Run a frame. There is no `requestAnimationFrame` here (`jelly-refract.test.ts` pins it): all work is a callback from an
 *   observer, a scroll-end timer, a scene change or an idle task, and a page at rest does nothing.
 * - Work while the page scrolls. In-flow hosts scroll WITH the picture behind them, so their layers keep their place;
 *   fixed and sticky hosts fade out at the first scroll event (the picture is of where the content was) and come back,
 *   re-placed by the scroll since the picture, when the scroll rests.
 * - Show a picture of the wrong thing. A layer's cover is 0 whenever there is no picture, the theme or the route has
 *   changed since it was taken, or it no longer covers the host's visible part (`./coverage.ts`).
 *
 * ## Budget
 *
 * Only on-screen hosts hold a layer, at most `JELLY_BUDGETS[tier].refractHosts` of them, nearest the viewport centre
 * first; the rest keep the lit rim. A fresh picture is requested at scroll rest only while a fixed, sticky or overlay
 * host holds a layer (spec call 5): those are the ones whose picture goes stale when the page moves under them.
 */
import { acquireSceneFeed, type SceneFeed } from '@/lib/liquid/glass/scene-feed';
import { SCENE_HIDE } from '@/lib/liquid/glass/scene';
import { innerRadius } from '@/lib/liquid/glass/policy';
import { installJellyRegistry, jellyRegistry, type JellyRegistry } from '../registry';
import { APP_HIGH_CONTRAST_SELECTOR, JELLY_BUDGETS, jellyTier, type JellyTier } from '../tiers';
import { placement } from './coverage';
import { acquireRefractFilter, type RefractFilter } from './filters';
import { createLayer, type LayerView, type RefractLayer } from './layer';
import { REFRACT, sizeClass } from './profile';
import { sceneImage, type SceneImage } from './scene-image';

/** The glass roles that refract (the `-inset` field only where it can hold a child: never an `<input>`). */
export const REFRACT_HOSTS = '.glass-fill,.glass-pane,.glass-chrome,.glass-overlay,.glass-inset';
/** Hosts that never refract: an opaque surface shows nothing behind it, a field is replaced content or is edited in place. */
export const REFRACT_EXCLUDE =
  '.glass-opaque,[data-jelly-refract="off"],input,textarea,select,img,video,canvas,iframe,[contenteditable="true"],[contenteditable=""]';
/** Subtrees that never refract: the full-screen app tier and the native-material routes carry their own material. */
export const REFRACT_SCOPE_EXCLUDE =
  '.app-theme,.app-route,.native-material,[data-jelly-scope="off"],[data-jelly-zone="playfield"]';
/** Smallest host worth a layer, CSS px. */
export const MIN_HOST = { w: 24, h: 16 } as const;

export interface HostMeasure {
  /** Padding-box size and radius (what the layer covers), CSS px. */
  w: number;
  h: number;
  radius: number;
  /** Padding-box origin in viewport coordinates. */
  left: number;
  top: number;
  /** Fixed, sticky, or inside such an ancestor: what is behind it moves while the page scrolls. */
  fixed: boolean;
  /** The host's background colour, for a host the picture does not hold (see `LayerView.tint`); else null. */
  tint: string | null;
}

export interface RefractionDeps {
  registry?: JellyRegistry | null;
  image?: SceneImage;
  feed?: Pick<SceneFeed, 'request' | 'release'>;
  tier?: () => JellyTier;
  /** True where nothing may refract right now (print, the app tier, app high contrast). */
  off?: () => boolean;
  measure?: (el: Element) => HostMeasure | null;
  createLayer?: (el: Element) => RefractLayer;
  acquireFilter?: typeof acquireRefractFilter;
  scroll?: () => { x: number; y: number };
  /** Identity of what the picture shows: changes with the route and the theme, so a picture of another page or theme is never drawn. */
  stamp?: () => string;
  schedule?: (fn: () => void) => () => void;
}

const isRoleHost = (el: Element) => el.matches(REFRACT_HOSTS);

function defaultMeasure(win: Window & typeof globalThis) {
  const fixedCache = new WeakMap<Element, boolean>();
  const fixedLike = (el: Element): boolean => {
    let n: Element | null = el;
    while (n && n !== win.document.documentElement) {
      const pos = win.getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
      n = n.parentElement;
    }
    return false;
  };
  return (el: Element): HostMeasure | null => {
    const h = el as HTMLElement;
    const cs = win.getComputedStyle(h);
    if (cs.display === 'none' || cs.display === 'contents' || cs.display === 'inline') return null;
    if (cs.position === 'static') return null;
    const rect = h.getBoundingClientRect();
    const bw = h.clientLeft;
    const w = h.clientWidth;
    const hh = h.clientHeight;
    if (w < MIN_HOST.w || hh < MIN_HOST.h) return null;
    let fixed = fixedCache.get(el);
    if (fixed === undefined) {
      fixed = fixedLike(el);
      fixedCache.set(el, fixed);
    }
    return {
      w,
      h: hh,
      radius: innerRadius(cs.borderTopLeftRadius, bw, w, hh),
      left: rect.left + bw,
      top: rect.top + h.clientTop,
      fixed,
      // The picture HIDES chrome and overlay glass (and keeps cards, panes and fields), so only those lose their own tint
      // to the opaque band and must paint it again over the picture.
      tint: el.matches(SCENE_HIDE.join(',')) ? cs.backgroundColor : null,
    };
  };
}

interface Held {
  layer: RefractLayer;
  filter: RefractFilter | null;
  classKey: string | null;
  fixed: boolean;
  view: LayerView | null;
  /** The host's box when it was first placed against the current picture (page coordinates; viewport for a fixed host). */
  base: { left: number; top: number; w: number; h: number; version: number } | null;
}

/** A host that moved or resized by more than this since the picture was taken no longer matches it. */
const LAYOUT_SLACK_PX = 1.5;
/** Quiet time after the last layout change before a fresh picture is asked for (typing in a textarea never asks). */
const LAYOUT_SETTLE_MS = 1200;

export function installRefraction(doc: Document = document, deps: RefractionDeps = {}): () => void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win) return () => {};

  const releaseRegistry = deps.registry === undefined ? installJellyRegistry(doc) : null;
  const registry = deps.registry === undefined ? jellyRegistry(doc) : deps.registry;
  if (!registry) {
    releaseRegistry?.();
    return () => {};
  }
  const image = deps.image ?? sceneImage(doc);
  // The scene feed is taken only while something may refract (not on the app tier, not in print, not on a budget of 0):
  // taking it starts the first picture, which a page that will never use one should not pay for.
  let feedHandle: Pick<SceneFeed, 'request' | 'release'> | null = deps.feed ?? null;
  const takeFeed = () => (feedHandle ??= acquireSceneFeed(doc));
  const dropFeed = () => {
    if (deps.feed) return;
    feedHandle?.release();
    feedHandle = null;
  };
  const tier = deps.tier ?? (() => jellyTier({ doc }));
  const off =
    deps.off ??
    (() =>
      win.matchMedia('print').matches ||
      doc.documentElement.classList.contains('app-route') ||
      !!doc.querySelector(APP_HIGH_CONTRAST_SELECTOR));
  const measure = deps.measure ?? defaultMeasure(win);
  const makeLayer = deps.createLayer ?? ((el: Element) => createLayer(el, doc));
  const acquire = deps.acquireFilter ?? acquireRefractFilter;
  const scrollNow = deps.scroll ?? (() => ({ x: win.scrollX, y: win.scrollY }));
  const stampNow =
    deps.stamp ??
    (() => {
      const root = doc.documentElement;
      return `${win.location.pathname}|${root.className}|${root.getAttribute('data-theme') ?? ''}|${root.getAttribute('style') ?? ''}`;
    });
  const schedule =
    deps.schedule ??
    ((fn: () => void) => {
      const w = win as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
        cancelIdleCallback?: (h: number) => void;
      };
      if (typeof w.requestIdleCallback === 'function') {
        const h = w.requestIdleCallback(fn, { timeout: 500 });
        return () => w.cancelIdleCallback?.(h);
      }
      const h = win.setTimeout(fn, 60);
      return () => win.clearTimeout(h);
    });

  const held = new Map<Element, Held>();
  let disposed = false;
  let cancelRun: (() => void) | null = null;
  /** What the CURRENT picture shows: the route and the theme at the moment it landed. */
  let pictureStamp: string | null = null;
  let pictureVersion = -1;
  /** A scroll gesture is in flight (set by its first event, cleared by the registry's scroll end). */
  let scrolling = false;
  /** A scroll just rested: the next pass may ask for a fresh picture. */
  let rested = false;
  let layoutTimer: number | null = null;
  let settleTimer: number | null = null;

  const destroyHeld = (el: Element, h: Held) => {
    h.layer.destroy();
    h.filter?.release();
    held.delete(el);
  };
  const detachAll = () => {
    for (const [el, h] of [...held]) destroyHeld(el, h);
  };
  /** Layers keep their place and fade to the lit rim: no picture, or one of another theme or route. */
  const fadeAll = () => {
    for (const h of held.values()) if (h.view) h.layer.apply({ ...h.view, cover: 0 });
  };
  /** Is the picture still of what is on the page (same route, same theme, and a page of the height it was taken at)? */
  const fresh = (): boolean => {
    if (!image.url || pictureStamp !== stampNow()) return false;
    const h = image.docHeight;
    return h === undefined || Math.abs(doc.documentElement.scrollHeight - h) <= LAYOUT_SLACK_PX;
  };

  /** Ask for a fresh picture once the layout has been still for a moment (typing in a textarea keeps resetting it). */
  const requestWhenQuiet = () => {
    if (layoutTimer !== null) win.clearTimeout(layoutTimer);
    layoutTimer = win.setTimeout(() => {
      layoutTimer = null;
      if (!disposed && feedHandle) feedHandle.request('resize');
    }, LAYOUT_SETTLE_MS);
  };

  const run = () => {
    cancelRun = null;
    if (disposed) return;
    const budget = off() ? 0 : JELLY_BUDGETS[tier()].refractHosts;
    if (budget <= 0) {
      detachAll();
      dropFeed();
      return;
    }
    const feed = takeFeed();
    if (registry.scrolling || scrolling) return;
    const askPicture = rested;
    rested = false;
    if (!fresh()) {
      fadeAll();
      // A page that has grown or shrunk since the picture (webfonts, images, a longer feed) asks for a new one once quiet.
      if (image.url && pictureStamp === stampNow()) requestWhenQuiet();
      // Nothing new until there is a picture of this page; hosts that left the page still go.
      for (const [el, h] of [...held]) if (!el.isConnected) destroyHeld(el, h);
      return;
    }

    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const entries = registry
      .visible()
      .filter((e) => e.el.isConnected && isRoleHost(e.el) && !e.el.matches(REFRACT_EXCLUDE))
      .filter((e) => !e.el.closest(REFRACT_SCOPE_EXCLUDE));
    const dist = (e: (typeof entries)[number]) =>
      Math.hypot(e.rect.left + e.rect.width / 2 - vw / 2, e.rect.top + e.rect.height / 2 - vh / 2);
    entries.sort((a, b) => dist(a) - dist(b));
    const wanted = new Set<Element>();
    for (const e of entries) {
      if (wanted.size >= budget) break;
      wanted.add(e.el);
    }
    for (const [el, h] of [...held]) if (!wanted.has(el)) destroyHeld(el, h);

    // One read pass, then the writes.
    const scroll = scrollNow();
    const measured = new Map<Element, HostMeasure>();
    for (const el of wanted) {
      const m = measure(el);
      if (m) measured.set(el, m);
      else if (held.has(el)) destroyHeld(el, held.get(el)!);
    }
    let needsPicture = false;
    let layoutShifted = false;
    for (const [el, m] of measured) {
      let h = held.get(el);
      if (!h) {
        h = {
          layer: makeLayer(el),
          filter: null,
          classKey: null,
          fixed: m.fixed,
          view: null,
          base: null,
        };
        held.set(el, h);
      } else if (!h.layer.attached()) h.layer.reattach();
      h.fixed = m.fixed;
      // A host the picture holds samples inward (never its own edge); one it hides samples outward (see `SizeClass.inward`).
      const c = sizeClass(m.w, m.h, m.radius, m.tint === null);
      if (c.key !== h.classKey) {
        const next = acquire(doc, c);
        h.filter?.release();
        h.filter = next;
        h.classKey = next ? c.key : null;
      }
      // The picture is of the page as it was: a host that has moved or resized since no longer sits where its picture says,
      // so it fades to the lit rim (and a fresh picture is asked for once things are quiet).
      const box = {
        left: m.fixed ? m.left : m.left + scroll.x,
        top: m.fixed ? m.top : m.top + scroll.y,
        w: m.w,
        h: m.h,
      };
      if (!h.base || h.base.version !== image.version) h.base = { ...box, version: image.version };
      const drifted =
        Math.abs(box.left - h.base.left) > LAYOUT_SLACK_PX ||
        Math.abs(box.top - h.base.top) > LAYOUT_SLACK_PX ||
        Math.abs(box.w - h.base.w) > LAYOUT_SLACK_PX ||
        Math.abs(box.h - h.base.h) > LAYOUT_SLACK_PX;
      if (drifted) layoutShifted = true;
      const place = placement(
        {
          width: image.width,
          height: image.height,
          // The picture draws the page from the body's origin: add back what that origin is live (`SceneShot.origin`).
          scrollX: image.scrollX + image.originX,
          scrollY: image.scrollY + image.originY,
        },
        {
          left: m.fixed ? m.left : m.left + scroll.x,
          top: m.fixed ? m.top : m.top + scroll.y,
          width: m.w,
          height: m.h,
          fixed: m.fixed,
        },
        scroll,
        REFRACT.bandPx,
      );
      h.view = {
        filterId: h.filter?.id ?? null,
        url: image.url,
        sceneWidth: image.width,
        sceneHeight: image.height,
        offsetX: place.offsetX,
        offsetY: place.offsetY,
        radius: m.radius,
        tint: m.tint,
        cover: drifted ? 0 : place.cover,
      };
      h.layer.apply(h.view);
      h.layer.setMoving(false);
      if (m.fixed && (image.scrollX !== scroll.x || image.scrollY !== scroll.y))
        needsPicture = true;
    }
    // A fixed, sticky or overlay host over moved content needs a picture of where the content is now.
    if (askPicture && needsPicture) feed.request('scroll-rest');
    if (layoutShifted) requestWhenQuiet();
  };

  const queue = () => {
    if (disposed || cancelRun) return;
    cancelRun = schedule(run);
  };

  // Scroll: one passive listener that only acts on the first event of a gesture. Fixed and sticky layers fade (their
  // picture is of where the content WAS); the registry's scroll end then reaches `run`, which re-places and brings them back.
  const onScroll = () => {
    if (scrolling) return;
    scrolling = true;
    for (const h of held.values()) if (h.fixed) h.layer.setMoving(true);
  };
  const offRegistry = registry.onChange(() => {
    if (scrolling && !registry.scrolling) {
      scrolling = false;
      rested = true;
    }
    queue();
  });
  const offImage = image.onChange(() => {
    if (image.url && image.version !== pictureVersion) {
      pictureVersion = image.version;
      pictureStamp = stampNow();
    }
    // A cleared picture drops every layer at once; a new one is placed on the next pass.
    if (!image.url) fadeAll();
    queue();
  });
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });

  // The theme changes under live layers: their picture is the wrong colour until the next one lands.
  const themeWatch = new win.MutationObserver(() => {
    if (pictureStamp !== null && pictureStamp !== stampNow()) fadeAll();
    queue();
  });
  themeWatch.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  const print = win.matchMedia('print');
  const onEnv = () => queue();
  print.addEventListener?.('change', onEnv);

  if (image.url) {
    pictureVersion = image.version;
    pictureStamp = stampNow();
  }
  queue();
  // The page's first picture is taken as it mounts, before webfonts and images have settled the layout; once they have, ask for
  // another (a scene feed picture is otherwise only taken on a route, a theme, a resize, scroll rest and tab-visible).
  const settled = () => {
    settleTimer = win.setTimeout(() => {
      settleTimer = null;
      if (!disposed && feedHandle) feedHandle.request('activate');
    }, 600);
  };
  const fonts = (
    doc as Document & {
      fonts?: {
        ready: Promise<unknown>;
        addEventListener?: (t: string, fn: () => void) => void;
        removeEventListener?: (t: string, fn: () => void) => void;
      };
    }
  ).fonts;
  if (fonts?.ready) void fonts.ready.then(settled, settled);
  else settled();
  // A webfont arriving later reflows text (card heights change): the page is no longer what the picture shows.
  const onFont = () => {
    queue();
  };
  fonts?.addEventListener?.('loadingdone', onFont);

  return () => {
    if (disposed) return;
    disposed = true;
    if (layoutTimer !== null) win.clearTimeout(layoutTimer);
    if (settleTimer !== null) win.clearTimeout(settleTimer);
    fonts?.removeEventListener?.('loadingdone', onFont);
    cancelRun?.();
    cancelRun = null;
    offRegistry();
    offImage();
    themeWatch.disconnect();
    print.removeEventListener?.('change', onEnv);
    doc.removeEventListener('scroll', onScroll, { capture: true });
    detachAll();
    if (!deps.image) image.dispose();
    dropFeed();
    releaseRegistry?.();
  };
}
