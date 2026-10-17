/**
 * DOM-to-image capture of the viewport (spec §6). OWNER: T17. Client-only.
 *
 * Wraps `modern-screenshot` (already a dependency — `lib/library/epub-raster.ts`),
 * **dynamically imported** so it is in no static closure (spec §8.1). One
 * context is created per navigation and reused for the BEFORE and AFTER
 * captures, because font embedding and resource fetching are the expensive part
 * and a reused context pays them once; its fetch worker is on.
 *
 * ## What a capture is
 *
 * Exactly `innerWidth × innerHeight` CSS px at the current scroll, with
 * fixed/sticky elements in their on-screen positions, at
 * `min(devicePixelRatio, scaleCap)` and no bigger than `CAPTURE_MAX_DIMENSION`
 * on either side. `CAPTURE_EXCLUDE_SELECTORS` are absent. The result is an
 * `ImageBitmap` whose ownership passes to the caller (`CaptureResult.bitmap`:
 * the caller transfers it to the render side and keeps no reference; this module
 * keeps none either, and closes any bitmap it produced for a capture that had
 * already been abandoned).
 *
 * ## The viewport crop (spec §14 item 2 — the mechanism)
 *
 * The library renders a node into an SVG `<foreignObject>` that becomes an
 * image, and it forces the ROOT clone's `width`/`height` to `context.width/height`.
 * So the root is `<html>` with the context sized to the viewport, and the
 * document is scrolled by moving the cloned `<body>` — `position: relative;
 * top: -scrollY; left: -scrollX` — and by nothing else. That choice is what
 * makes the three kinds of layer come out right without a special case each:
 *
 * - **fixed** elements are positioned against the image's viewport, which is
 *   the crop window, exactly as they are positioned against the live viewport.
 *   A `transform` on any ancestor (the obvious way to scroll a clone) would turn
 *   that ancestor into their containing block and drag every one of them off by
 *   the scroll offset; `relative` + `top` is not a containing block for fixed.
 * - **sticky** elements keep their stick behaviour: their scrollport in the clone
 *   is the (non-scrolling) `<html>` clone, their natural position is the live
 *   one shifted by the same offset, so the clamp resolves to the live result —
 *   the shell's rails stay pinned where the visitor sees them.
 * - the `<html>` clone keeps `html`'s own background, so the strip the shift
 *   uncovers at the bottom is painted by the ground, not left transparent.
 *
 * `document.body` as the root would lose the `html` background and any rule
 * keyed on `:root`; `scrollY` is read once, synchronously, before the library is
 * called, so a scroll during the (async) clone cannot tear the picture.
 *
 * ## Fidelity (spec §6.4) — the clone, not the page, is adjusted
 *
 * The library copies *computed* styles onto the clone as inline declarations, so
 * a class added to the clone root cannot re-resolve any selector — there is no
 * "put `reduce-transparency` on the clone". The adjustments are therefore made on
 * each cloned node as it is produced (`onCloneEachNode`):
 *
 * - `backdrop-filter` cannot be rasterised. This is the one place the spec's
 *   "clone root carries the opaque-glass class" had to change shape (spec §14
 *   item 3). The class the Glass clarity "Opaque" stop applies is
 *   `html.reduce-transparency` (`app/globals.css`, `stores/themeStore.ts`:
 *   stop 0 → that class), whose rules turn `.glass-{fill,pane,chrome,
 *   chrome--aside,overlay,inset}` into `--site-surface-opaque` with the
 *   `--site-border` edge and zero blur, and hide the `::before`/`::after` glint
 *   layers. (`.glass-opaque` is a different thing: the full-screen takeover
 *   fill.) {@link FLOATING_GLASS_SELECTOR} + {@link OPAQUE_PSEUDO_CSS} reproduce those
 *   declarations on the floating surfaces; any other node that has a
 *   `backdrop-filter` just loses it (keeping its stacking context).
 * - The clone root is `opacity: 1`, and so are the shell parts the cover class
 *   hides (`.radial-backdrop`, `.radial-frame`; opacity is not inherited, so the
 *   descendants are already 1) — the live page is hidden under
 *   `html.eversion-cover` while the AFTER capture is taken (spec §6.6).
 * - While the hub is open the shell parts carry `filter: blur(...)` and the feed
 *   FAB is `visibility: hidden`. Neither is "the page" (BEFORE is the page as it
 *   was before the menu opened, Q5), so the clone drops the blur and shows the FAB.
 * - Animations are frozen at their *current* computed values (`animation: none`
 *   after the values were copied): an SVG image has no animation clock, and a
 *   replayed entrance would capture its first, invisible frame.
 * - Same-origin and CORS images inline; one that cannot be fetched (non-CORS)
 *   becomes a `--site-surface` fill and never blocks; videos show their poster,
 *   else the same fill (their `currentSrc`/`poster` are shadowed on the element
 *   for the duration of the clone so the library takes its poster path instead
 *   of loading and seeking the video); 2D canvases copy; WebGL canvases without
 *   `preserveDrawingBuffer` capture blank (accepted).
 *
 * ## Cost — where the budget goes and what was done about it
 *
 * A capture is: clone the tree with inline computed styles, serialise it (with the
 * page's fonts, base64) into an SVG data URL, have the browser lay out and paint
 * that SVG as an image, copy it to a bitmap. The levers, in order of effect:
 * {@link STYLE_PROPERTIES} (a curated list instead of ~900 properties a node);
 * {@link makeFilter}'s stubbing of blocks the picture cannot show (a feed is mostly
 * those); the default-style cache filled in `createSession` ({@link
 * warmDefaultStyles}) so the first capture does not pay it, which is why a caller
 * should open the session ahead of the capture; and slicing the clone walk
 * ({@link YIELD_SLICE_MS}) so it never holds the main thread for a frame, which is
 * also what lets the timeout fire. The layout/paint of the SVG image and font
 * decode are the browser's and are not reducible from here.
 *
 * Budget: p95 ≤ 120 ms main-thread on the desktop reference, hard timeout
 * `CAPTURE_TIMEOUT_MS`. A timeout rejects with a `CaptureError` within
 * `timeout + 20 ms` (the deadline is checked per cloned node, not only by the
 * timer). Whatever ends a capture early — timeout, abort, `dispose` —
 * also tears the context down (its worker is terminated, its sandbox iframe
 * removed) and turns the library's still-running clone into a no-op, so nothing
 * of an abandoned capture stays alive; the next capture builds a fresh session.
 * Each capture is recorded as `EVERSION_MEASURES.captureBefore/After`.
 */

import {
  CAPTURE_DPR_CAP,
  CAPTURE_EXCLUDE_SELECTORS,
  CAPTURE_MAX_DIMENSION,
  CAPTURE_TIMEOUT_MS,
  COVER_CLASS,
} from './constants';
import { registerDebug } from './debug';
import { EVERSION_MEASURES } from './marks';
import { CaptureError } from './types';
import type { CaptureApi, CaptureOptions, CaptureResult } from './types';

type Lib = typeof import('modern-screenshot');
type Ctx = Awaited<ReturnType<Lib['createContext']>>;

/**
 * The blurred surfaces that float over content that is not a plain ground — the
 * sticky chrome and anything overlaid (`.glass-chrome`, `.glass-overlay`). Live,
 * their blur is what keeps the text scrolling under them from reading through; in
 * the image there is no blur, so they take `html.reduce-transparency`'s opaque
 * fill (`app/globals.css`, the `:is(.glass-fill, …)` rule). The panes and fields
 * (`.glass-pane`, `.glass-inset`) sit on the page ground, where their translucent
 * fill over the captured ground is what the visitor sees minus an invisible blur,
 * so they keep it. (Measured on the pricing and settings pages, flattening panes
 * too cost ~0.03 SSIM for nothing the eye wants.)
 */
const FLOATING_GLASS_SELECTOR = '.glass-chrome, .glass-chrome--aside, .glass-overlay';

/** The glint/lens/liquid layers `html.reduce-transparency` switches off, plus the animation freeze for pseudos. */
const OPAQUE_PSEUDO_CSS = `
.glass-chrome--aside::before, .glass-refract::before, .glass-liquid::after { display: none !important; }
*::before, *::after { animation: none !important; transition: none !important; }
`;

/**
 * The computed-style properties copied onto each cloned node. The library's
 * default copies EVERY property that differs from an element's default — on this
 * site that is ~400 standard properties plus ~490 inherited `--site-*` custom
 * properties per node, each written inline into the SVG. Values are already
 * resolved in a computed style, so custom properties are dead weight in a
 * snapshot, and most of the standard ones (animation, transition, scroll-*,
 * view-transition-*, anchor-*, container-*, the logical aliases of physical
 * longhands) cannot change a still picture. The list is what paints or lays out
 * a box; `backdrop-filter` is deliberately absent (spec §6.4: it cannot be
 * rasterised, and not copying it is how it is dropped). Measured on the feed
 * (same loaded machine, same page): a capture fell from ~1.3 s to ~0.25 s.
 */
const STYLE_PROPERTIES: string[] = `
  align-content align-items align-self aspect-ratio backdrop-filter background-attachment
  background-blend-mode background-clip background-color background-image background-origin
  background-position background-repeat background-size border-bottom-color
  border-bottom-left-radius border-bottom-right-radius border-bottom-style border-bottom-width
  border-collapse border-image-outset border-image-repeat border-image-slice
  border-image-source border-image-width border-left-color border-left-style border-left-width
  border-right-color border-right-style border-right-width border-top-color
  border-top-left-radius border-top-right-radius border-top-style border-top-width bottom
  box-decoration-break box-shadow box-sizing caption-side clear clip-path color column-count
  column-gap column-rule-color column-rule-style column-rule-width column-span column-width cx
  cy direction display dominant-baseline empty-cells fill fill-opacity fill-rule filter
  flex-basis flex-direction flex-grow flex-shrink flex-wrap float flood-color flood-opacity
  font-family font-kerning font-optical-sizing font-size font-stretch font-style
  font-variant-caps font-variant-east-asian font-variant-emoji font-variant-ligatures
  font-variant-numeric font-variant-position font-weight grid-auto-columns grid-auto-flow
  grid-auto-rows grid-column-end grid-column-start grid-row-end grid-row-start
  grid-template-areas grid-template-columns grid-template-rows height hyphens image-rendering
  isolation justify-content justify-items justify-self left letter-spacing line-break
  line-height list-style-image list-style-position list-style-type margin-bottom margin-left
  margin-right margin-top marker-end marker-mid marker-start mask-clip mask-composite
  mask-image mask-mode mask-origin mask-position mask-repeat mask-size max-height max-width
  min-height min-width mix-blend-mode object-fit object-position opacity order outline-color
  outline-offset outline-style outline-width overflow-clip-margin overflow-wrap overflow-x overflow-y
  padding-bottom padding-left padding-right padding-top paint-order perspective
  perspective-origin position r right rotate row-gap rx ry scale scrollbar-color
  scrollbar-gutter scrollbar-width shape-rendering stop-color stop-opacity stroke
  stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit
  stroke-opacity stroke-width tab-size table-layout text-align text-align-last text-anchor
  text-decoration-color text-decoration-line text-decoration-skip-ink text-decoration-style
  text-indent text-overflow text-rendering text-shadow text-transform text-underline-position
  text-wrap-mode text-wrap-style top transform transform-origin transform-style translate
  unicode-bidi vertical-align visibility white-space-collapse width word-break word-spacing
  writing-mode z-index zoom -webkit-border-horizontal-spacing -webkit-border-vertical-spacing
  -webkit-box-align -webkit-box-direction -webkit-box-flex -webkit-box-ordinal-group
  -webkit-box-orient -webkit-box-pack -webkit-font-smoothing -webkit-line-clamp
  -webkit-text-fill-color -webkit-text-stroke-color -webkit-text-stroke-width
`
  .split(/\s+/)
  .filter(Boolean);

/** Shell parts `html.eversion-cover` sets to `opacity: 0` (spec §6.6; `radial.css`). */
const COVER_HIDDEN_SELECTOR = '.radial-backdrop, .radial-frame';
/** Shell parts blurred while the hub is open (`radial.css`, `[data-phase='open']`). */
const HUB_BLURRED_SELECTOR = '.radial-backdrop, .radial-topbar, .radial-frame';
/** Hidden while the hub is open; part of the page as it was before. */
const HUB_HIDDEN_SELECTOR = '.radial-feed__compose';
/** The library's `defaultComputedStyles` iframe (`__SANDBOX__…`); never part of the page. */
const SANDBOX_ID_PREFIX = '__SANDBOX__';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
/** How far outside the viewport (as a fraction of it) a block must be before its subtree is dropped. */
const STUB_MARGIN = 0.5;
/** Give up on the sandbox iframe loading (a navigation away, a CSP) after this long. */
const SANDBOX_LOAD_TIMEOUT_MS = 1000;

/**
 * How long the clone walk may hold the main thread before it yields. Under a
 * frame (16 ms) so the hub's open motion and the timeout timer keep running,
 * and far under the 50 ms long-task line.
 */
const YIELD_SLICE_MS = 4;

/** Give the event loop a turn. A message task, not `setTimeout`: no 4 ms nesting clamp. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

/**
 * The hidden iframe the library reads default computed styles from, awaited until
 * its document exists. Same shape as the library's own (`id` prefix included, so
 * the clone filter leaves it out).
 */
function createSandbox(): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.id = `${SANDBOX_ID_PREFIX}eversion`;
    frame.width = '0';
    frame.height = '0';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.style.visibility = 'hidden';
    frame.style.position = 'fixed';
    const timer = setTimeout(() => {
      frame.remove();
      reject(new CaptureError('failed', 'eversion: capture sandbox did not load'));
    }, SANDBOX_LOAD_TIMEOUT_MS);
    frame.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        resolve(frame);
      },
      { once: true },
    );
    frame.srcdoc = '<!DOCTYPE html><meta charset="UTF-8"><title></title><body>';
    document.body.appendChild(frame);
  });
}

/**
 * Fill the library's default-style cache for every HTML tag on the page.
 *
 * To know which styles an element sets beyond its defaults, the library asks its
 * sandbox iframe for that tag's default computed style - once per tag per context,
 * all ~400 properties, the first time it meets the tag. On a page with ~60 tags
 * that is a few hundred ms inside the first capture. Doing it here moves it into
 * session creation (idle time, before the capture is wanted), and only the
 * {@link STYLE_PROPERTIES} the capture copies are read. The cache key and value
 * shape are the library's own (`defaultComputedStyles`: tag name -> Map of
 * property -> value, with `width`/`height`/`-webkit-text-fill-color` left out so
 * they are always copied); pinned to modern-screenshot 4.7.0. If a future version
 * keys differently these entries are simply never read and the library computes
 * lazily as before.
 */
function warmDefaultStyles(ctx: Ctx): void {
  const frame = ctx.sandbox;
  const doc = frame?.contentDocument;
  const win = frame?.contentWindow;
  if (!doc?.body || !win) return;
  const always = new Set(['width', 'height', '-webkit-text-fill-color']);
  const tags = new Set<string>();
  for (const el of document.querySelectorAll('*')) {
    if (el.namespaceURI === XHTML_NS) tags.add(el.localName);
  }
  for (const tag of tags) {
    if (ctx.defaultComputedStyles.has(tag)) continue;
    try {
      const probe = doc.createElement(tag);
      probe.textContent = ' ';
      doc.body.appendChild(probe);
      const computed = win.getComputedStyle(probe);
      const defaults = new Map<string, string>();
      for (const name of STYLE_PROPERTIES) {
        if (!always.has(name)) defaults.set(name, computed.getPropertyValue(name));
      }
      doc.body.removeChild(probe);
      ctx.defaultComputedStyles.set(tag, defaults);
    } catch {
      /* an element the sandbox cannot make: the library computes it lazily */
    }
  }
}

/** A solid fill as an image URL: the stand-in for an image that cannot be fetched and for a posterless video. */
const FILL_SVG = (colour: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="${colour}"/></svg>`,
  )}`;

/** Resolve a token off `<html>` (`''` when unset). */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A capture in flight: its abort handle and whether the page was asked to stop caring. */
interface Flight {
  ac: AbortController;
  /** `performance.now()` at which the capture is out of time. */
  deadline: number;
}

/**
 * Whether this capture should stop doing work. Besides an abort that has already
 * happened, it checks the deadline itself and, if it has passed, aborts on the
 * spot: `abort()` runs its listeners synchronously, so the caller's promise
 * rejects in the microtask turn that follows - without waiting for the timer
 * macrotask, which cannot run until the library's clone walk next gives the
 * event loop a turn. That is what keeps a timeout within its slack.
 */
function expired(flight: Flight): boolean {
  if (flight.ac.signal.aborted) return true;
  if (performance.now() < flight.deadline) return false;
  flight.ac.abort(new CaptureError('timeout'));
  return true;
}

/** Lazily import the library and the worker asset URL (a built asset under Vite). */
async function loadLibrary(): Promise<{ lib: Lib; workerUrl: string | null }> {
  const lib = await import('modern-screenshot');
  let workerUrl: string | null;
  try {
    // `?url` makes Vite emit the worker as a hashed asset and hand back its URL;
    // dev serves it from `node_modules`. A failure only costs the fetch worker.
    workerUrl = (await import('modern-screenshot/worker?url')).default;
  } catch {
    workerUrl = null;
  }
  return { lib, workerUrl };
}

/**
 * The clone filter: what a capture must leave out, and what it need not descend into.
 *
 * Left out entirely: the caller's selectors, the library's sandbox iframe, and
 * `<head>` (nothing in it is rendered; its `<link>`/`<meta>` clones are pure cost).
 *
 * **Stubbed** (kept, children dropped): a block that lies wholly outside the
 * viewport by more than {@link STUB_MARGIN} of it. A capture costs in proportion
 * to the nodes it clones, serialises and renders, and a feed is mostly nodes the
 * picture cannot show. The stub keeps its box because the library copies the
 * element's computed `width`/`height` (used px) onto the clone, so everything
 * after it in flow lands where it did. Guarded so that nothing visible can be in
 * what is dropped: the box must have area, be a block (not inline / `contents`),
 * have no scrollable overflow beyond it (a descendant poking out into view would
 * show up as overflow), and not be fixed or sticky itself.
 */
function makeFilter(
  exclude: readonly string[],
  flight: Flight,
  view: { width: number; height: number },
): (node: Node) => boolean {
  const selector = exclude.join(',');
  const marginX = view.width * STUB_MARGIN;
  const marginY = view.height * STUB_MARGIN;
  const stubs = new WeakSet<Node>();

  const isStub = (el: Element): boolean => {
    if (!el.firstChild) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const outside =
      r.bottom < -marginY ||
      r.top > view.height + marginY ||
      r.right < -marginX ||
      r.left > view.width + marginX;
    if (!outside) return false;
    if (el.clientWidth === 0 || el.clientHeight === 0) return false;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return false;
    const position = getComputedStyle(el).position;
    return position !== 'fixed' && position !== 'sticky';
  };

  return (node: Node): boolean => {
    // An abandoned capture stops descending, so the library's still-running
    // async clone finishes in microtasks instead of walking the whole page.
    if (expired(flight)) return false;
    const parent = node.parentNode;
    if (parent && stubs.has(parent)) return false;
    if (node.nodeType !== 1) return true;
    const el = node as Element;
    if (el.localName === 'head') return false;
    if (el.id.startsWith(SANDBOX_ID_PREFIX)) return false;
    if (selector) {
      try {
        if (el.matches(selector)) return false;
      } catch {
        /* a selector the browser rejects excludes nothing */
      }
    }
    if (isStub(el)) stubs.add(el);
    return true;
  };
}

/**
 * Make `<video>` elements take the library's poster path for one clone: with no
 * `currentSrc` and a `poster`, it emits an `<img src=poster>` carrying the video's
 * computed style (so layout and `object-fit` survive). A video without a poster
 * gets the `--site-surface` fill as its poster. Own properties shadow the
 * prototype getters and are deleted again by the returned function.
 */
function shadowVideos(fill: string): () => void {
  const videos = Array.from(document.querySelectorAll('video'));
  for (const v of videos) {
    try {
      Object.defineProperty(v, 'currentSrc', { value: '', configurable: true });
      if (!v.poster) Object.defineProperty(v, 'poster', { value: fill, configurable: true });
    } catch {
      /* a frozen element: the library's own path applies */
    }
  }
  return () => {
    for (const v of videos) {
      try {
        delete (v as unknown as Record<string, unknown>).currentSrc;
        delete (v as unknown as Record<string, unknown>).poster;
      } catch {
        /* nothing to restore */
      }
    }
  };
}

/** One capture session: the shared library context plus the in-flight bookkeeping. */
class CaptureSession implements CaptureApi {
  private ctx: Ctx | null = null;
  private lib: Lib | null = null;
  private creating: Promise<void> | null = null;
  private disposed = false;
  private tail: Promise<unknown> = Promise.resolve();
  private flights = new Set<Flight>();
  private lastInfo: { width: number; height: number; scale: number; durationMs: number } | null =
    null;
  private unregister: () => void;

  constructor() {
    this.unregister = registerDebug('capture', {
      captureNow: (options) =>
        this.captureViewport({ phase: 'before', scaleCap: CAPTURE_DPR_CAP.high, ...options }),
      last: () => this.lastInfo,
    });
  }

  createSession(): Promise<void> {
    if (this.disposed) return Promise.reject(new CaptureError('aborted'));
    if (this.ctx) return Promise.resolve();
    this.creating ??= this.build().finally(() => {
      this.creating = null;
    });
    return this.creating;
  }

  private async build(): Promise<void> {
    const { lib, workerUrl } = await loadLibrary();
    if (this.disposed) throw new CaptureError('aborted');
    // The context is created on a detached node: `createContext(node)` waits for
    // every `<img>`/`<video>` under `node` to load (30 s default), which for the
    // whole document includes lazy images that never will. Each capture points
    // `ctx.node` at `<html>` itself, which is all the library reads it for.
    const ctx = await lib.createContext(document.createElement('div'), {
      workerUrl: workerUrl ?? undefined,
      workerNumber: 1,
      autoDestruct: false,
      maximumCanvasSize: CAPTURE_MAX_DIMENSION,
      includeStyleProperties: STYLE_PROPERTIES,
      fetch: { requestInit: { cache: 'force-cache' } },
    });
    this.lib = lib; // `destroy` needs it from here on
    // The library makes its default-style sandbox lazily, mid-clone, and reads
    // its document straight away. Its `srcdoc` navigation then lands at the first
    // event-loop turn - which the clone now takes (see YIELD_SLICE_MS) - and a
    // document that is being replaced has no body. So the sandbox is built here,
    // loaded, and handed over; the library removes it with the context like one
    // of its own.
    try {
      ctx.sandbox = await createSandbox();
    } catch (error) {
      this.destroy(ctx);
      throw error;
    }
    if (this.disposed) {
      this.destroy(ctx);
      throw new CaptureError('aborted');
    }
    warmDefaultStyles(ctx);
    this.ctx = ctx;
  }

  /** Terminate the worker, remove the sandbox iframe, clear the caches. */
  private destroy(ctx: Ctx): void {
    for (const w of ctx.workers) {
      try {
        w.terminate();
      } catch {
        /* already gone */
      }
    }
    try {
      this.lib?.destroyContext(ctx);
    } catch {
      /* the library tolerates a half-built context */
    }
  }

  private teardown(): void {
    const ctx = this.ctx;
    this.ctx = null;
    // A starved capture may never settle (a media load with no timeout of its
    // own); the next one must not queue behind it.
    this.tail = Promise.resolve();
    if (ctx) this.destroy(ctx);
  }

  captureViewport(options: CaptureOptions): Promise<CaptureResult> {
    if (!options)
      return Promise.reject(new CaptureError('failed', 'eversion: capture needs options'));
    if (this.disposed) return Promise.reject(new CaptureError('aborted'));

    const timeoutMs = options.timeoutMs ?? CAPTURE_TIMEOUT_MS;
    const flight: Flight = { ac: new AbortController(), deadline: performance.now() + timeoutMs };
    this.flights.add(flight);

    const timer = setTimeout(() => flight.ac.abort(new CaptureError('timeout')), timeoutMs);
    const onExternal = () => flight.ac.abort(new CaptureError('aborted'));
    if (options.signal) {
      if (options.signal.aborted) onExternal();
      else options.signal.addEventListener('abort', onExternal, { once: true });
    }

    const stopped = new Promise<never>((_, reject) => {
      const fail = () => {
        const reason = flight.ac.signal.reason;
        reject(reason instanceof CaptureError ? reason : new CaptureError('aborted'));
      };
      if (flight.ac.signal.aborted) fail();
      else flight.ac.signal.addEventListener('abort', fail, { once: true });
    });
    stopped.catch(() => {});

    // Captures share one context, so they run one at a time. The timer above
    // already started: time spent queued counts, which is the honest budget.
    const work = this.tail.then(() => this.run(options, flight));
    this.tail = work.catch(() => {});

    const finished = Promise.race([work, stopped]);
    return finished.then(
      (result) => {
        this.release(flight, timer, options.signal, onExternal);
        return result;
      },
      (error: unknown) => {
        // Whatever ended the capture early, the context it was using must not
        // outlive it: the library cannot be interrupted, only starved.
        flight.ac.abort(error instanceof CaptureError ? error : new CaptureError('failed'));
        this.teardown();
        this.release(flight, timer, options.signal, onExternal);
        // A late bitmap from an abandoned capture is ours to free.
        work.then(
          (late) => late.bitmap.close(),
          () => {},
        );
        if (error instanceof CaptureError) throw error;
        const failed = new CaptureError(
          'failed',
          error instanceof Error ? error.message : undefined,
        );
        // Keep the library's own error reachable for diagnosis.
        (failed as Error & { cause?: unknown }).cause = error;
        throw failed;
      },
    );
  }

  private release(
    flight: Flight,
    timer: ReturnType<typeof setTimeout>,
    signal: AbortSignal | undefined,
    onExternal: () => void,
  ): void {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternal);
    this.flights.delete(flight);
  }

  private async run(options: CaptureOptions, flight: Flight): Promise<CaptureResult> {
    if (flight.ac.signal.aborted) throw flight.ac.signal.reason;
    await this.createSession();
    const ctx = this.ctx;
    const lib = this.lib;
    if (!ctx || !lib) throw new CaptureError('aborted');
    if (flight.ac.signal.aborted) throw flight.ac.signal.reason;

    const t0 = performance.now();

    // Geometry is read once, synchronously: a scroll during the clone must not
    // tear the picture.
    const width = Math.max(1, Math.round(window.innerWidth));
    const height = Math.max(1, Math.round(window.innerHeight));
    const sx = window.scrollX;
    const sy = window.scrollY;
    const scale = Math.min(
      window.devicePixelRatio || 1,
      options.scaleCap,
      CAPTURE_MAX_DIMENSION / width,
      CAPTURE_MAX_DIMENSION / height,
    );

    const exclude = options.exclude ?? CAPTURE_EXCLUDE_SELECTORS;
    const surface = token('--site-surface') || '#808080';
    const opaque = token('--site-surface-opaque') || surface;
    const border = token('--site-border');
    const fill = FILL_SVG(surface);
    const cover = document.documentElement.classList.contains(COVER_CLASS);
    const hubOpen = !!document.querySelector('.radial-hub:not([data-phase="closed"])');

    ctx.node = document.documentElement;
    ctx.width = width;
    ctx.height = height;
    ctx.scale = scale;
    ctx.dpi = scale === 1 ? null : 96 * scale;
    ctx.timeout = Math.max(50, options.timeoutMs ?? CAPTURE_TIMEOUT_MS);
    ctx.backgroundColor = null;
    ctx.style = { overflow: 'hidden', opacity: '1' };
    ctx.fetch.placeholderImage = fill;
    ctx.filter = makeFilter(exclude, flight, { width, height });

    // The library clones the tree with `await`s that are all already-resolved
    // promises, so the whole walk is ONE macrotask: no timer (the timeout), no
    // input, no frame can run until it ends. `onCloneEachNode` is awaited per
    // node, so it is the seam to give the event loop back every few ms.
    let sliceStart = performance.now();
    ctx.onCloneEachNode = (cloned: Node) => {
      if (expired(flight)) return;
      let slice: Promise<void> | undefined;
      if (performance.now() - sliceStart > YIELD_SLICE_MS) {
        slice = yieldToEventLoop().then(() => {
          sliceStart = performance.now();
        });
      }
      if (cloned.nodeType !== 1) return slice;
      const el = cloned as HTMLElement;
      const style = el.style;
      if (!style) return slice;
      style.setProperty('animation', 'none');
      style.setProperty('transition', 'none');
      // A surface that is blurred live cannot be blurred in the image: it gets its
      // designed opaque fallback. One that is not (`.glass-fill` has no blur by
      // design) already looks like what the visitor sees, and flattening it would
      // only make the capture less like the page. `backdrop-filter` also makes a
      // stacking context; dropping it must not change paint order (a badge tucked
      // under the next card's edge would end up behind the one above it), so the
      // context stays.
      const blur = style.getPropertyValue('backdrop-filter');
      if (blur && blur !== 'none') {
        style.setProperty('backdrop-filter', 'none');
        style.setProperty('isolation', 'isolate');
        if (el.matches(FLOATING_GLASS_SELECTOR)) {
          style.setProperty('background', opaque);
          style.setProperty('background-image', 'none');
          if (border) style.setProperty('border-color', border);
        }
      }
      if (cover && el.matches(COVER_HIDDEN_SELECTOR)) style.setProperty('opacity', '1');
      if (hubOpen && el.matches(HUB_BLURRED_SELECTOR)) style.setProperty('filter', 'none');
      return slice;
    };

    ctx.onCloneNode = (root: Node) => {
      if (flight.ac.signal.aborted) return;
      const html = root as HTMLElement;
      // The crop: scroll the document by moving the cloned body (see the docblock).
      const body = html.querySelector(':scope > body') as HTMLElement | null;
      if (body) {
        body.style.setProperty('position', 'relative');
        body.style.setProperty('top', `${-sy}px`);
        body.style.setProperty('left', `${-sx}px`);
      }
      if (hubOpen) {
        for (const el of html.querySelectorAll<HTMLElement>(HUB_HIDDEN_SELECTOR)) {
          el.style.setProperty('visibility', 'visible');
          for (const d of el.querySelectorAll<HTMLElement>('*'))
            d.style.setProperty('visibility', 'visible');
        }
      }
    };

    ctx.onEmbedNode = (root: Node) => {
      if (flight.ac.signal.aborted) return;
      // Failed fetches and posterless videos resolve to the 2×2 fill; stretch it
      // over the element's box whatever `object-fit` it asked for.
      for (const img of (root as Element).querySelectorAll<HTMLImageElement>('img')) {
        if (img.src === fill || img.getAttribute('src') === fill) {
          img.style.setProperty('object-fit', 'fill');
        }
      }
    };

    ctx.onCreateForeignObjectSvg = (svg: SVGSVGElement) => {
      if (flight.ac.signal.aborted) return;
      const style = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = OPAQUE_PSEUDO_CSS;
      svg.insertBefore(style, svg.firstChild);
    };

    const restoreVideos = shadowVideos(fill);
    let canvas: HTMLCanvasElement;
    try {
      canvas = await lib.domToCanvas(ctx);
    } finally {
      restoreVideos();
    }
    if (flight.ac.signal.aborted) {
      canvas.width = 0;
      throw flight.ac.signal.reason;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(canvas);
    } finally {
      // Release the backing store now rather than at the next GC.
      canvas.width = 0;
      canvas.height = 0;
    }

    const end = performance.now();
    const durationMs = end - t0;
    try {
      performance.measure(
        options.phase === 'before'
          ? EVERSION_MEASURES.captureBefore
          : EVERSION_MEASURES.captureAfter,
        { start: t0, end },
      );
    } catch {
      /* measure is best-effort */
    }

    this.lastInfo = { width: bitmap.width, height: bitmap.height, scale, durationMs };
    return { bitmap, width: bitmap.width, height: bitmap.height, scale, durationMs };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregister();
    for (const f of this.flights) f.ac.abort(new CaptureError('aborted'));
    this.flights.clear();
    this.teardown();
  }
}

/**
 * A capture API with no session yet. The controller makes one per navigation;
 * the hub's BEFORE scheduler (T30) shares it. Registers the `capture` debug slot.
 */
export function createCapture(): CaptureApi {
  return new CaptureSession();
}

/**
 * Convenience for callers that need one capture and no session management: opens
 * a session, captures, and disposes. Not for the controller's two-capture flow.
 */
export function captureOnce(options: CaptureOptions): Promise<CaptureResult> {
  if (!options) throw new TypeError('eversion: captureOnce needs options');
  const session = createCapture();
  return session.captureViewport(options).finally(() => session.dispose());
}
