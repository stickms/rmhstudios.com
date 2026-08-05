/*
 * Web Share Target — the service-worker half of the POST/multipart handoff (F14).
 *
 * `manifest.webmanifest` declares `/share` as a POST + multipart/form-data share
 * target so the OS share sheet can hand RMH a photo or a video. A POST cannot be
 * answered by a navigation to a static route, so the service worker has to
 * intercept it, keep the payload, and turn it into a GET the app can render.
 *
 * This file is a STANDALONE module rather than code inside `sw.js` because the
 * two are owned separately; `sw.js` pulls it in with one `importScripts()` and
 * calls into `self.RMHShareTarget` from its existing `fetch` listener. Required
 * wiring, in `public/sw.js`:
 *
 *   // near the top, beside the other module-scope constants
 *   importScripts('/sw-share-target.js');
 *
 *   // inside the existing self.addEventListener('fetch', …), BEFORE the
 *   // `if (request.method === 'POST')` outbox branch:
 *   if (self.RMHShareTarget && self.RMHShareTarget.isShareTargetPost(request)) {
 *     event.respondWith(self.RMHShareTarget.handle(request));
 *     return;
 *   }
 *
 * It must come before the outbox branch: the outbox only queues requests that
 * carry an `Idempotency-Key`, so a share POST would fall through it to the
 * `request.method !== 'GET'` gate and reach the network as an unhandled POST —
 * a 405 and a lost photo.
 *
 * Storage: one manifest entry + one entry per file in the `share-target-v1`
 * Cache Storage bucket. That name deliberately does NOT start with `rmh-`,
 * because `sw.js`'s `activate` handler deletes every `rmh-`-prefixed cache not
 * in its `keep` set — an `rmh-share-…` name would be wiped by the next deploy,
 * mid-share. If the name is ever changed, add it to that `keep` set in the same
 * commit. The page-side reader is `lib/share/share-target.ts`; the constants
 * below are its mirror and `lib/__tests__/share-target.test.ts` asserts the two
 * copies agree.
 */

(function initShareTarget(scope) {
  'use strict';

  var CACHE = 'share-target-v1';
  var KEY_PREFIX = '/__share-target/';
  var TARGET_PATH = '/share';
  var PENDING_PARAM = 'pending';
  var MAX_FILES = 4;
  /** Per-file ceiling. A share bigger than this is dropped rather than stored:
   *  Cache Storage is subject to the origin quota, and a rejected 200 MB video
   *  is a better outcome than a QuotaExceededError that loses the whole share. */
  var MAX_FILE_BYTES = 64 * 1024 * 1024;

  function manifestKey(id) {
    return KEY_PREFIX + encodeURIComponent(id);
  }
  function fileKey(id, index) {
    return KEY_PREFIX + encodeURIComponent(id) + '/f/' + index;
  }

  function isAccepted(type) {
    return typeof type === 'string' && (type.indexOf('image/') === 0 || type.indexOf('video/') === 0);
  }

  function newId() {
    // `crypto.randomUUID` is available in every browser that ships a POST share
    // target, but the fallback keeps this module usable in older test shims.
    if (scope.crypto && typeof scope.crypto.randomUUID === 'function') return scope.crypto.randomUUID();
    return 'sh_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  /** True for exactly the share-target POST — same origin, `/share`, POST. */
  function isShareTargetPost(request) {
    if (!request || request.method !== 'POST') return false;
    try {
      var url = new URL(request.url);
      return url.origin === scope.location.origin && url.pathname === TARGET_PATH;
    } catch (_) {
      return false;
    }
  }

  /**
   * Stage the multipart body and redirect to the GET the app renders.
   *
   * Always resolves to a Response. A failure here is a share the user made and
   * cannot re-make from the same sheet, so every error path still lands them on
   * `/share` with whatever text survived rather than on a browser error page.
   */
  async function handle(request) {
    var title = '';
    var text = '';
    var url = '';
    var staged = [];
    var id = newId();

    try {
      var form = await request.formData();
      title = String(form.get('title') || '');
      text = String(form.get('text') || '');
      url = String(form.get('url') || '');

      // `media` is the param name declared in manifest.webmanifest. Some
      // platforms send every file under that one name; read them all.
      var entries = typeof form.getAll === 'function' ? form.getAll('media') : [];
      for (var i = 0; i < entries.length && staged.length < MAX_FILES; i++) {
        var file = entries[i];
        if (!file || typeof file === 'string' || typeof file.size !== 'number') continue;
        if (!isAccepted(file.type) || file.size === 0 || file.size > MAX_FILE_BYTES) continue;
        staged.push(file);
      }
    } catch (_) {
      // Unreadable body — fall through and redirect with whatever we have.
    }

    try {
      if (staged.length > 0 || title || text || url) {
        var cache = await scope.caches.open(CACHE);
        for (var j = 0; j < staged.length; j++) {
          await cache.put(
            fileKey(id, j),
            new Response(staged[j], { headers: { 'Content-Type': staged[j].type } }),
          );
        }
        var manifest = {
          id: id,
          title: title,
          text: text,
          url: url,
          stagedAt: Date.now(),
          files: staged.map(function (f) {
            return { name: f.name || '', type: f.type, size: f.size };
          }),
        };
        await cache.put(
          manifestKey(id),
          new Response(JSON.stringify(manifest), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
    } catch (_) {
      // Quota/private mode. The redirect below still happens, and the page will
      // simply find nothing staged and open an empty composer.
      id = '';
    }

    var target = id ? TARGET_PATH + '?' + PENDING_PARAM + '=' + encodeURIComponent(id) : TARGET_PATH;
    // 303 so the browser follows with GET. A 302 would be allowed to repeat the
    // POST, which would stage the same share twice.
    return Response.redirect(target, 303);
  }

  scope.RMHShareTarget = {
    CACHE: CACHE,
    KEY_PREFIX: KEY_PREFIX,
    TARGET_PATH: TARGET_PATH,
    PENDING_PARAM: PENDING_PARAM,
    MAX_FILES: MAX_FILES,
    isShareTargetPost: isShareTargetPost,
    handle: handle,
  };
})(self);
