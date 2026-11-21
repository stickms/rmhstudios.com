/**
 * The loader protocol between a host page and `GET /vibe-frame` (docs/csp.md,
 * "Frames that run user code"). Client-safe and dependency-free: the server route
 * imports the loader document, the host helper imports the tag and URL.
 *
 *   frame -> host  { __rmhvibeFrame: 'ready' }    the listener is installed
 *   host  -> frame { __rmhvibeFrame: 'html', html }  the document to run (first one only)
 *   frame -> host  { __rmhvibeFrame: 'loaded' }   the written document fired `load`
 *
 * Relative on purpose: inside a Discord Activity it resolves to the proxy origin.
 */

export const FRAME_URL = '/vibe-frame';
export const FRAME_TAG = '__rmhvibeFrame';

export type FrameToHost =
  | {
      [FRAME_TAG]: 'ready';
    }
  | {
      [FRAME_TAG]: 'loaded';
    };
export type HostToFrame = {
  [FRAME_TAG]: 'html';
  html: string;
};

/**
 * The one inline script of the loader. Classic, not a module: a module script would
 * make the page's own import map illegal afterwards. `document.open()` keeps the
 * Document (and with it the policy container from the loader's response header) and
 * erases the window's listeners, so the first message is also the last. The `load`
 * listener is added after `open()` for that reason and before `write()` so it cannot
 * miss the event.
 */
export const FRAME_LOADER_SCRIPT = `(function () {
  var parent = window.parent;
  if (parent === window) return;
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.${FRAME_TAG} !== 'html' || typeof d.html !== 'string') return;
    document.open();
    window.addEventListener('load', function () {
      parent.postMessage({ ${FRAME_TAG}: 'loaded' }, '*');
    });
    document.write(d.html);
    document.close();
  });
  parent.postMessage({ ${FRAME_TAG}: 'ready' }, '*');
})();`;

export const FRAME_LOADER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title></title><script>${FRAME_LOADER_SCRIPT}</script></head><body></body></html>`;
