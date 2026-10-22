/**
 * The latest page snapshot, shared with anything on the page that refracts it but cannot share the glass engine's GL
 * context (WebGL textures do not cross contexts). Today that is the liquid globe's coat shader.
 *
 * The engine uploads each snapshot into its own context and then closes the bitmap. This keeps an independent clone of
 * the latest one for readers, and tells them when it changes. One bitmap, replaced (and the old one closed) on every
 * new snapshot, so the cost is a single viewport-sized picture, not a history.
 */

export interface SharedScene {
  bitmap: ImageBitmap;
  /** CSS px the picture covers. */
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  /** Increments on every new picture, so a reader can tell whether it already has it. */
  version: number;
}

let scene: SharedScene | null = null;
let version = 0;
const listeners = new Set<() => void>();

export interface SceneMeta {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

/** Keep a clone of `source` as the shared scene. The caller still owns (and closes) `source`. */
export async function publishScene(source: ImageBitmap, meta: SceneMeta): Promise<void> {
  let clone: ImageBitmap;
  try {
    clone = await createImageBitmap(source);
  } catch {
    return;
  }
  const previous = scene;
  scene = { bitmap: clone, ...meta, version: ++version };
  previous?.bitmap.close();
  for (const fn of listeners) fn();
}

export function currentScene(): SharedScene | null {
  return scene;
}

/** Subscribe to new pictures. Returns the unsubscribe. */
export function onSceneChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Drop the picture (route change, teardown, reduced effects). Readers are told. */
export function clearScene(): void {
  const previous = scene;
  scene = null;
  previous?.bitmap.close();
  for (const fn of listeners) fn();
}
