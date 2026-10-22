/**
 * The page snapshot the glass rims refract.
 *
 * A glass surface bends what is behind it, and a browser will not hand a shader the pixels behind an element. So the
 * engine keeps a picture of the viewport and samples that: the same trick liquidGL and ybouane/liquidglass use, built
 * on the site's own capture (`lib/eversion/capture`, `modern-screenshot` under it) rather than a second rasteriser.
 * That capture is already engineered for this page: a curated style list, subtrees outside the viewport stubbed,
 * the clone walk time-sliced so it never holds the main thread for a frame, and a Firefox/Safari/Chromium track record.
 *
 * What a picture costs is the whole design constraint. A capture is ~100–300 ms of mostly-sliced work, so this is NOT a
 * per-frame texture: it is requested when the page SETTLES (load, route change, scroll rest, resize, theme change,
 * content changing under a surface) and never more often than `MIN_INTERVAL_MS`. Between requests the engine reuses the
 * last picture, shifted by the scroll since it was taken, and fades the refracted rim out when it can no longer cover a
 * surface. Only the bevel band uses the picture — the interior is the live DOM — so a picture that is a second or two
 * old is invisible: it only has to be right where the glass is curved.
 *
 * The picture HIDES the floating glass (chrome, overlays) and EXCLUDES the engine's own canvases. Floating glass is not
 * what is behind anything, and the canvases would feed the previous frame's rim back into the next one. Hidden means
 * "keeps its box", never "removed": removing a sticky header reflows the whole page up by its height.
 */
import { CAPTURE_EXCLUDE_SELECTORS } from '@/lib/eversion/constants';

/** Removed from the picture outright: the engine's own canvases (a leaf, so layout cannot change). */
export const SCENE_EXCLUDE: readonly string[] = [
  ...CAPTURE_EXCLUDE_SELECTORS,
  'canvas[data-liquid-glass]',
];
/**
 * Floating glass keeps its BOX but not its paint. It must not be removed: a sticky header taken out of layout makes
 * the whole page move up by its height, and every rim would then refract a picture of a different page.
 */
export const SCENE_HIDE: readonly string[] = ['.glass-chrome', '.glass-overlay'];

export interface SceneShot {
  bitmap: ImageBitmap;
  /** CSS px the picture covers (the layout viewport at capture time). */
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  /** `performance.now()` when the capture finished. */
  at: number;
}

export interface SceneOptions {
  doc?: Document;
  /** Called with each new picture. The bitmap is the receiver's to upload and `close()`. */
  onShot: (shot: SceneShot) => void;
  /** Return false to refuse a capture right now (hidden, reduced effects, hub open…). */
  canCapture: () => boolean;
  /** Test seam: a capture function with the shape of `createCapture().captureViewport`. */
  capture?: (
    exclude: readonly string[],
    hide: readonly string[],
    scaleCap: number,
    timeoutMs: number,
  ) => Promise<CaptureOutcome>;
}

export interface CaptureOutcome {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  scale: number;
}

/** Never capture more often than this. */
export const MIN_INTERVAL_MS = 1500;
/** A request waits this long for more requests before it runs (a scroll or a burst of mutations settles first). */
export const SETTLE_MS = 260;
const CAPTURE_TIMEOUT_MS = 4000;
const SCALE_CAP = 1.25;
/** After this many failures in a row the provider stops trying until the page changes route. */
const MAX_FAILURES = 3;

export interface SceneProvider {
  /** Ask for a fresh picture once things settle. Cheap; coalesces. */
  request(reason?: string): void;
  /** Forget failures (a route change gives a failed page a fresh start). */
  reset(): void;
  dispose(): void;
  readonly failures: number;
}

export function createSceneProvider(options: SceneOptions): SceneProvider {
  const doc = options.doc ?? document;
  const win = doc.defaultView!;
  let timer = 0;
  let inFlight = false;
  let pending = false;
  let lastAt = -Infinity;
  let failures = 0;
  let disposed = false;
  let session: { captureViewport: (o: unknown) => Promise<unknown>; dispose: () => void } | null =
    null;

  const defaultCapture: NonNullable<SceneOptions['capture']> = async (
    exclude,
    hide,
    scaleCap,
    timeoutMs,
  ) => {
    if (!session) {
      const mod = await import('@/lib/eversion/capture');
      if (disposed) throw new Error('disposed');
      const s = mod.createCapture();
      await s.createSession();
      session = s as unknown as typeof session;
    }
    return (await session!.captureViewport({
      phase: 'before',
      exclude,
      hide,
      scaleCap,
      timeoutMs,
    })) as CaptureOutcome;
  };
  const capture = options.capture ?? defaultCapture;

  const run = async () => {
    timer = 0;
    if (disposed) return;
    if (inFlight) {
      pending = true;
      return;
    }
    if (failures >= MAX_FAILURES || !options.canCapture()) return;
    const wait = lastAt + MIN_INTERVAL_MS - win.performance.now();
    if (wait > 0) {
      timer = win.setTimeout(run, wait);
      return;
    }
    inFlight = true;
    const scrollX = win.scrollX;
    const scrollY = win.scrollY;
    try {
      const out = await capture(SCENE_EXCLUDE, SCENE_HIDE, SCALE_CAP, CAPTURE_TIMEOUT_MS);
      if (disposed) {
        out.bitmap.close();
        return;
      }
      failures = 0;
      lastAt = win.performance.now();
      options.onShot({
        bitmap: out.bitmap,
        width: out.width / out.scale,
        height: out.height / out.scale,
        scrollX,
        scrollY,
        at: lastAt,
      });
    } catch {
      failures++;
      lastAt = win.performance.now();
    } finally {
      inFlight = false;
      if (pending && !disposed) {
        pending = false;
        schedule(SETTLE_MS);
      }
    }
  };

  const schedule = (delay: number) => {
    if (disposed || timer) return;
    timer = win.setTimeout(() => {
      // Run when the browser is idle, so a capture never lands in the middle of an interaction.
      const idle = (
        win as Window & {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (idle) idle.call(win, () => void run(), { timeout: 1200 });
      else void run();
    }, delay);
  };

  return {
    request() {
      if (disposed) return;
      if (inFlight) pending = true;
      else schedule(SETTLE_MS);
    },
    reset() {
      failures = 0;
    },
    dispose() {
      disposed = true;
      win.clearTimeout(timer);
      timer = 0;
      session?.dispose();
      session = null;
    },
    get failures() {
      return failures;
    },
  };
}
