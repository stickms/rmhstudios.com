/**
 * Host side of the frame loader (docs/csp.md, "Frames that run user code").
 *
 * The iframe loads `FRAME_URL` (its own CSP, not the host's) and is handed its HTML by
 * postMessage once the loader says it is listening. One document per iframe: never
 * re-post into a frame that was already written, the old page's timers survive
 * `document.open`; mount a new iframe instead (VibeFrame's layers, a `key`).
 *
 * The iframe's own `load` event fires for the loader and for the written document, in
 * an order that is not fixed (a message can beat the loader's `load`, which then never
 * fires). So nothing keys on it: the loader reports `loaded` from the written
 * document's `load`, and `onLoaded` fires from that.
 *
 * Trust: a message counts only when `e.source` is the registered iframe's
 * `contentWindow`. The frame's origin is opaque, so the host posts with target '*'.
 */
import { useCallback, useRef } from 'react';
import { FRAME_TAG, type HostToFrame } from '@/lib/rmhvibe/frame-protocol';

export { FRAME_URL } from '@/lib/rmhvibe/frame-protocol';

type Entry = {
  getHtml: () => string;
  onLoaded?: () => void;
  sent: boolean;
};

const entries = new Map<Window, Entry>();

function onMessage(e: MessageEvent) {
  const source = e.source as Window | null;
  const entry = source && entries.get(source);
  if (!entry) return;
  const kind = (
    e.data as {
      [FRAME_TAG]?: unknown;
    } | null
  )?.[FRAME_TAG];
  if (kind === 'ready' && !entry.sent) {
    entry.sent = true;
    const msg: HostToFrame = {
      [FRAME_TAG]: 'html',
      html: entry.getHtml(),
    };
    try {
      source.postMessage(msg, '*');
    } catch {
      /* the frame went away */
    }
  } else if (kind === 'loaded' && entry.sent) {
    entry.onLoaded?.();
  }
}

/**
 * Register `frame` to receive `getHtml()` when its loader is ready. Call it in the
 * commit that inserts the iframe (a ref callback), before the loader can answer.
 * Returns the unregister function.
 */
export function attachFrameDocument(
  frame: HTMLIFrameElement,
  getHtml: () => string,
  onLoaded?: () => void,
): () => void {
  const win = frame.contentWindow;
  if (!win) return () => {};
  if (entries.size === 0) window.addEventListener('message', onMessage);
  entries.set(win, {
    getHtml,
    onLoaded,
    sent: false,
  });
  return () => {
    entries.delete(win);
    if (entries.size === 0) window.removeEventListener('message', onMessage);
  };
}

/**
 * A stable ref callback for an `<iframe src={FRAME_URL}>` that should run `html`. The
 * document is read once, when the loader is ready: key the iframe by its document.
 */
export function useFrameDocument(
  html: string,
  onLoaded?: () => void,
  onElement?: (el: HTMLIFrameElement | null) => void,
) {
  const htmlRef = useRef(html);
  htmlRef.current = html;
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  const elementRef = useRef(onElement);
  elementRef.current = onElement;
  const detach = useRef<(() => void) | undefined>(undefined);
  return useCallback((el: HTMLIFrameElement | null) => {
    detach.current?.();
    detach.current = undefined;
    elementRef.current?.(el);
    if (el)
      detach.current = attachFrameDocument(
        el,
        () => htmlRef.current,
        () => loadedRef.current?.(),
      );
  }, []);
}
