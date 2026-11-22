import { useEffect } from 'react';

import { chromeContentChanged } from '@/lib/chrome/signal';

/**
 * Tell the chrome renderer that an overlay appeared or went away (Steel V8), so the globe and the thumbs reflect the
 * page as it now looks (V5): the dialog and its scrim while it is open, the page again once it has closed.
 *
 * Signals when `present` turns true and again when it turns false or the caller unmounts. The overlay primitives in
 * this folder use it; an overlay built on one of them needs nothing more. Lives here, not in lib/chrome, because
 * components never import the renderer (V4): this only dispatches a DOM event, which the renderer listens for.
 */
export function useOverlaySignal(present: boolean): void {
  useEffect(() => {
    if (!present) return;
    chromeContentChanged();
    return chromeContentChanged;
  }, [present]);
}

/**
 * The same, for overlay content that Radix mounts and unmounts (Dialog, Sheet): rendered as a child of the
 * content, it mounts when the overlay opens and unmounts once its exit fade has ended and Presence removes the node.
 */
export function OverlaySignal(): null {
  useOverlaySignal(true);
  return null;
}
