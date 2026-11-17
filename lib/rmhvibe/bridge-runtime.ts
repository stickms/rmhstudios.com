/**
 * The in-frame half of the host bridge: `window.RMHVibe`, as a plain ES5 IIFE
 * string injected into every vibe document (no imports, no build step).
 *
 * It posts to `window.parent` with target origin '*' because the sandboxed
 * frame's origin is opaque and the parent cannot be addressed by origin from
 * inside. The HOST enforces trust (`e.source === frame.contentWindow`); this
 * side only accepts messages whose source is its own parent.
 *
 * Protocol: see `./bridge.ts`. `tweaks` data is a flat key -> value object that
 * replaces the current values; each is mirrored to `--tweak-<key>` on <html>.
 * `pick:start` / `pick:stop` are accepted and tracked here; the picker itself
 * arrives with the picking task.
 */

export const BRIDGE_MARKER = 'data-rmhvibe-bridge';

export const BRIDGE_RUNTIME_JS = `(function () {
  if (window.RMHVibe) return;
  var TAG = '__rmhvibe';
  var host = 'none';
  var pending = {};
  var nextId = 1;
  var roomFns = [];
  var memberFns = [];
  var tweakFns = [];
  var tweakValues = {};
  var picking = false;
  var errorCount = 0;
  var seenErrors = {};
  var resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });
  setTimeout(function () { resolveReady(); }, 1500);

  function send(msg) {
    msg[TAG] = 1;
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* no parent */ }
  }

  function request(op, args) {
    return new Promise(function (resolve, reject) {
      if (host === 'none') { reject(new Error('RMHVibe host unavailable')); return; }
      var id = nextId++;
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error('RMHVibe request timed out'));
      }, 10000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      send({ id: id, op: op, args: args });
    });
  }

  function subscribe(list, fn) {
    if (typeof fn !== 'function') return function () {};
    list.push(fn);
    return function () {
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  function emit(list, data) {
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) {
      try { copy[i](data); } catch (e) { /* a listener must not break the bridge */ }
    }
  }

  function applyTweaks(data) {
    if (!data || typeof data !== 'object') return;
    tweakValues = {};
    for (var k in data) {
      if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
      if (!/^[A-Za-z0-9_-]+$/.test(k)) continue;
      tweakValues[k] = data[k];
      try {
        document.documentElement.style.setProperty('--tweak-' + k, String(data[k]));
      } catch (e) { /* ignore */ }
    }
    emit(tweakFns, tweakValues);
  }

  function onHostEvent(name, data) {
    if (name === 'hello') {
      host = (data && data.host) || 'none';
      resolveReady();
    } else if (name === 'tweaks') {
      applyTweaks(data);
    } else if (name === 'room:message') {
      emit(roomFns, data);
    } else if (name === 'room:members') {
      emit(memberFns, data);
    } else if (name === 'pick:start') {
      picking = true;
    } else if (name === 'pick:stop') {
      picking = false;
    }
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || typeof m !== 'object' || m[TAG] !== 1) return;
    if (typeof m.event === 'string') { onHostEvent(m.event, m.data); return; }
    var p = pending[m.id];
    if (!p) return;
    delete pending[m.id];
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(typeof m.error === 'string' ? m.error : 'RMHVibe request failed'));
  });

  function reportError(message, source) {
    message = String(message || 'Error').slice(0, 500);
    if (errorCount >= 5 || seenErrors[message]) return;
    seenErrors[message] = true;
    errorCount++;
    var data = { message: message };
    if (source) data.source = String(source).slice(0, 200);
    send({ event: 'error', data: data });
  }

  window.addEventListener('error', function (e) {
    reportError(e && e.message, e && e.filename);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    reportError(r && r.message ? r.message : r);
  });
  window.addEventListener('load', function () { send({ event: 'ready' }); });

  window.RMHVibe = {
    get host() { return host; },
    get picking() { return picking; },
    ready: ready,
    store: {
      get: function (key, scope) { return request('store.get', { key: key, scope: scope || 'page' }); },
      set: function (key, value, scope) { return request('store.set', { key: key, scope: scope || 'page', value: value }); },
      incr: function (key, by, opts) {
        var a = { key: key, scope: (opts && opts.scope) || 'page', by: by === undefined ? 1 : by };
        if (opts && opts.oncePerUser) a.oncePerUser = true;
        return request('store.incr', a);
      },
      list: function (prefix, opts) {
        return request('store.list', {
          prefix: prefix || '',
          scope: (opts && opts.scope) || 'page',
          order: (opts && opts.order) || 'key',
          limit: (opts && opts.limit) || 50
        });
      }
    },
    room: {
      send: function (data) { return request('room.send', { data: data }); },
      on: function (fn) { return subscribe(roomFns, fn); },
      members: function () { return request('room.members', {}); },
      onMembers: function (fn) { return subscribe(memberFns, fn); }
    },
    tweaks: {
      get: function (key) { return tweakValues[key]; },
      all: function () {
        var out = {};
        for (var k in tweakValues) out[k] = tweakValues[k];
        return out;
      },
      on: function (fn) { return subscribe(tweakFns, fn); }
    }
  };
})();`;

const MARKUP = `<script ${BRIDGE_MARKER}>${BRIDGE_RUNTIME_JS}</script>`;
const MODULE_SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']?module["']?/i;

/**
 * Insert the runtime once (idempotent on the marker): before the first module
 * script so it is defined first, else before `</head>`, else at the very start.
 */
export function ensureBridgeRuntime(html: string): string {
  if (html.includes(BRIDGE_MARKER)) return html;
  const at = html.search(MODULE_SCRIPT_RE);
  if (at >= 0) return html.slice(0, at) + MARKUP + html.slice(at);
  const head = html.search(/<\/head>/i);
  if (head >= 0) return html.slice(0, head) + MARKUP + html.slice(head);
  return MARKUP + html;
}
