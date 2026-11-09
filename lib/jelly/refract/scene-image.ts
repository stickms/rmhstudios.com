/**
 * The shared page snapshot as an image a CSS background can show.
 *
 * `lib/liquid/glass/scene-store.ts` keeps the latest picture as an `ImageBitmap` (what the globe's shader uploads). A
 * refracting layer is a CSS box, so it needs a URL: each new picture is encoded once to a PNG blob and handed out as one
 * blob URL that every layer shares (the browser decodes it once); the previous URL is revoked when the next lands. When
 * the scene is cleared (route change, theme change, teardown) the URL goes to `null` AT ONCE and listeners are told, so
 * layers can fade out before a picture of the wrong theme is ever drawn again.
 */
import { currentScene, onSceneChange, type SharedScene } from '@/lib/liquid/glass/scene-store';

export interface SceneImage {
  /** The picture's blob URL, or `null` before the first picture and after the scene is cleared. */
  readonly url: string | null;
  readonly version: number;
  /** CSS px the picture covers and the scroll it was taken at (see `./coverage.ts`). */
  readonly width: number;
  readonly height: number;
  readonly scrollX: number;
  readonly scrollY: number;
  /** The document's height when the picture was taken (`undefined` = unknown). */
  readonly docHeight: number | undefined;
  /** How far above its live place in-flow content sits in the picture (`SceneShot.origin`); 0 where unknown. */
  readonly originX: number;
  readonly originY: number;
  /** Called when `url` changes, including to `null`. Returns the unsubscribe. */
  onChange(fn: () => void): () => void;
  dispose(): void;
}

export interface SceneImageDeps {
  current?: () => SharedScene | null;
  subscribe?: (fn: () => void) => () => void;
  /** Encode a picture; `null` = could not. */
  encode?: (scene: SharedScene) => Promise<Blob | null>;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

/** PNG through `OffscreenCanvas.convertToBlob` (off the main thread where the browser allows), else a canvas element. */
export async function encodeScene(scene: SharedScene): Promise<Blob | null> {
  const { bitmap } = scene;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        return await canvas.convertToBlob({ type: 'image/png' });
      }
    }
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    // The bitmap was closed under us (a newer picture, a clear): the next one will be encoded.
    return null;
  }
}

export function sceneImage(_doc: Document, deps: SceneImageDeps = {}): SceneImage {
  const current = deps.current ?? currentScene;
  const subscribe = deps.subscribe ?? onSceneChange;
  const encode = deps.encode ?? encodeScene;
  const createUrl = deps.createUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = deps.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));

  const listeners = new Set<() => void>();
  let url: string | null = null;
  let meta: {
    version: number;
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    docHeight?: number;
    originX?: number;
    originY?: number;
  } = { version: 0, width: 0, height: 0, scrollX: 0, scrollY: 0 };
  let wanted = 0;
  let disposed = false;

  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  const drop = () => {
    if (url) revokeUrl(url);
    url = null;
  };

  const sync = () => {
    if (disposed) return;
    const scene = current();
    if (!scene) {
      wanted++;
      if (url === null && meta.version === 0) return;
      drop();
      meta = { version: 0, width: 0, height: 0, scrollX: 0, scrollY: 0 };
      notify();
      return;
    }
    if (scene.version === meta.version && url) return;
    const mine = ++wanted;
    void encode(scene).then((blob) => {
      if (disposed || mine !== wanted || !blob) return;
      const next = createUrl(blob);
      drop();
      url = next;
      meta = {
        version: scene.version,
        width: scene.width,
        height: scene.height,
        scrollX: scene.scrollX,
        scrollY: scene.scrollY,
        docHeight: scene.docHeight,
        originX: scene.origin?.x ?? 0,
        originY: scene.origin?.y ?? 0,
      };
      notify();
    });
  };

  const off = subscribe(sync);
  sync();

  return {
    get url() {
      return url;
    },
    get version() {
      return meta.version;
    },
    get width() {
      return meta.width;
    },
    get height() {
      return meta.height;
    },
    get scrollX() {
      return meta.scrollX;
    },
    get scrollY() {
      return meta.scrollY;
    },
    get docHeight() {
      return meta.docHeight;
    },
    get originX() {
      return meta.originX ?? 0;
    },
    get originY() {
      return meta.originY ?? 0;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      off();
      drop();
      listeners.clear();
    },
  };
}
