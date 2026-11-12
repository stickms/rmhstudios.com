import { useEffect, useRef, type RefObject } from 'react';
import type { GlobeView, GlobeViewOptions } from '@/lib/globe/view';

/**
 * Give a chrome ball its body: the liquid globe's physics and rotation (lib/globe), loaded at idle through a dynamic
 * import so none of it is on the critical path. Until it arrives, and with scripting off, the ball is the static
 * chrome it always was and the menu's pins sit in their fixed places.
 *
 * `options` is read when the module lands (and again when `key` changes); it returns null while its elements are not mounted. `onLive` runs
 * when the view exists (the caller flips whatever CSS depends on it).
 */
export function useGlobeView(
  options: () => GlobeViewOptions | null,
  onLive?: (view: GlobeView) => void,
  /** The view is rebuilt when this changes (the number of destinations, which signing in or out changes). */
  key: unknown = 0,
): RefObject<GlobeView | null> {
  const view = useRef<GlobeView | null>(null);
  const read = useRef(options);
  read.current = options;
  const live = useRef(onLive);
  live.current = onLive;

  useEffect(() => {
    let gone = false;
    const load = () => {
      void import('@/lib/globe/view').then(({ GlobeView: View }) => {
        if (gone || view.current) return;
        const o = read.current();
        if (!o) return;
        view.current = new View(o);
        live.current?.(view.current);
      });
    };
    const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
    const id = idle ? idle.call(window, load, { timeout: 2500 }) : window.setTimeout(load, 300);
    return () => {
      gone = true;
      if (idle) window.cancelIdleCallback?.(id);
      else window.clearTimeout(id);
      view.current?.dispose();
      view.current = null;
    };
  }, [key]);

  return view;
}
