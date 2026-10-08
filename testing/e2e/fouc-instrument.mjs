// ─────────────────────────────────────────────────────────────────────────────
// The in-page half of the FOUC audit: one script, injected before any of the
// document's own scripts run, that records what the page LOOKED LIKE over time.
//
// It is a string rather than a module because it is handed to Playwright's
// `addInitScript`, which evaluates it in the page's world at document-start —
// earlier than `platformScript`, `PERF_TIER_SCRIPT`, `themeScript` and
// `localeScript` in `app/routes/__root.tsx`, which is the whole point: the
// pre-paint scripts are the thing under test, so the instrument has to be in
// place before they run.
//
// Everything it collects lands on `window.__fouc`. The runner reads that object
// once the page has settled; nothing here talks to the runner directly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long the per-frame sampler keeps running after document-start, by default.
 *
 * It was 4000ms, chosen to cover hydration, the i18n backfill, a late route
 * chunk and the store rehydrations that follow them. That was the wrong boundary,
 * and the audit reported a whole class of flash as clean because of it: work
 * gated on `hooks/useIdleReady` — a `requestIdleCallback` with a 2s timeout,
 * registered from a mount effect that itself runs after hydration — happens LATER
 * than all of that. Measured at 4x throttle on a signed-in page whose account and
 * device themes disagreed: correct pre-paint at 530ms, then the account sync
 * cleared `style-graphite` at 7930ms and the document went black to white at
 * 8621ms. A 4s window saw a clean page.
 *
 * 10s covers that with margin: a throttled hydration (~3s) + the idle timeout
 * (2s) + one fetch + the repaint. The runner can override it with `--window`,
 * and sets `window.__foucWindowMs` before this script runs so the two agree.
 */
export const SAMPLE_WINDOW_MS = 10000;

export const INSTRUMENT_SOURCE = `(() => {
  if (window.__fouc) return;

  var S = {
    t0: performance.now(),
    // Per-animation-frame snapshots of every root-level visual input. This is
    // the timeline the ground/churn detectors run over.
    samples: [],
    // Paint + navigation milestones, all in performance.now() ms.
    fcp: null,
    lcp: null,
    domInteractive: null,
    loadEnd: null,
    // Stylesheets, with the timing that decides whether they were render
    // blocking (arrived before FCP) or a flash waiting to happen (after).
    sheets: [],
    // layout-shift entries, each tagged with whether it landed after FCP.
    shifts: [],
    cls: 0,
    // Font files from resource timing — evidence for the report, not the signal.
    fontFiles: [],
    // The signal: for each @font-face the document knows about, the first moment
    // it reported 'loaded'. Taken from the CSS Font Loading API rather than from
    // the file URLs, because a URL does not reliably name its family — the
    // self-hosted file is 'inter-latin-wght-normal.woff2' and its family is
    // "Inter Variable", and no amount of string-munging turns one into the other.
    // 'document.fonts' knows both, and knows exactly when the face became usable.
    fontLoadedAt: {},
    // Families with at least one loaded face whose font-display can SWAP. A face
    // declared 'optional' cannot: it gets ~100ms, and if it misses that window
    // the fallback stays for the rest of the page view — so it finishing after
    // first paint is not a flash, and the late-font detector must not call it one.
    fontSwaps: {},
    // React's hydration diagnostics, captured from console + error events.
    hydrationErrors: [],
    // Attribute mutations on <html>/<body> with their timestamps, from a
    // MutationObserver. The sampler sees the same changes, but the observer
    // records WHICH attribute moved, which is what a failure report needs.
    rootMutations: [],
    sampling: true,
    stoppedAt: null,
  };
  window.__fouc = S;

  var now = function () { return performance.now(); };

  // ── Paint / shift / resource observers ────────────────────────────────────
  try {
    new PerformanceObserver(function (list) {
      for (var i = 0; i < list.getEntries().length; i++) {
        var e = list.getEntries()[i];
        if (e.name === 'first-contentful-paint' && S.fcp === null) S.fcp = e.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      S.lcp = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (e.hadRecentInput) continue;
        S.cls += e.value;
        var sources = [];
        if (e.sources) {
          for (var j = 0; j < e.sources.length && j < 4; j++) {
            var n = e.sources[j].node;
            sources.push(
              n && n.nodeType === 1
                ? n.tagName.toLowerCase() +
                    (n.id ? '#' + n.id : '') +
                    (n.className && typeof n.className === 'string'
                      ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.')
                      : '')
                : '(detached)',
            );
          }
        }
        S.shifts.push({ t: e.startTime, value: e.value, sources: sources });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var isCss =
          e.initiatorType === 'css' ||
          e.initiatorType === 'link' ||
          /\\.css(\\?|$)/.test(e.name);
        if (isCss && /\\.css(\\?|$)/.test(e.name)) {
          S.sheets.push({ name: e.name, start: e.startTime, end: e.responseEnd });
        }
        // Font FILES, with the family they belong to and when they landed. The
        // family is recovered from the URL because the sheet that declares it is
        // cross-origin and its @font-face rules cannot be read: a Google Fonts
        // file lives at /s/<family-slug>/<version>/<hash>.woff2, and a self-hosted
        // one is named after its family. Only the timing matters here — a family
        // whose file finished after first paint is one the reader watched swap in.
        if (/\\.(?:woff2?|ttf|otf)(\\?|$)/.test(e.name)) {
          var slug = '';
          var g = e.name.match(/\\/s\\/([^/]+)\\//);
          if (g) slug = g[1];
          else {
            var tail = e.name.split('/').pop() || '';
            slug = tail.replace(/[-_.].*$/, '');
          }
          S.fontFiles.push({ name: e.name, slug: slug.toLowerCase(), end: e.responseEnd });
        }
      }
    }).observe({ type: 'resource', buffered: true });
  } catch (e) {}

  // ── Hydration diagnostics ─────────────────────────────────────────────────
  // A hydration mismatch IS a flash — the server markup paints, React throws it
  // away and re-renders the subtree — so it is collected here rather than left to
  // the generic console listener.
  //
  // React reports it through TWO channels and the audit has to hear both. A
  // development build calls console.error with a readable diff. A PRODUCTION
  // build — the only thing this audit runs against — does not touch the console
  // at all: \`onRecoverableError\` defaults to \`reportError\`, which dispatches an
  // \`error\` event on window carrying "Minified React error #418". This detector
  // used to patch console.error only, so against a production build it could not
  // fire, and it never did: /slice-it/player/$handle threw #418 on every load,
  // React re-rendered the whole document, and every attribute the pre-paint
  // scripts had put on <html> — class, data-app-dark, color-scheme — was wiped
  // (docs/fouc-audit-2026-10-06.md §7–8).
  var HYDRATION = /hydrat|did not match|server (?:html|rendered)|text content does not match|Minified React error #(?:418|421|423|425|428)/i;
  try {
    window.addEventListener('error', function (e) {
      try {
        var msg = String((e && e.error && e.error.message) || (e && e.message) || '');
        if (HYDRATION.test(msg)) S.hydrationErrors.push({ t: now(), message: msg.slice(0, 600) });
      } catch (err) {}
    });
  } catch (e) {}
  var origError = console.error;
  console.error = function () {
    try {
      var msg = Array.prototype.map
        .call(arguments, function (a) {
          return a && a.message ? a.message : String(a);
        })
        .join(' ');
      if (HYDRATION.test(msg)) S.hydrationErrors.push({ t: now(), message: msg.slice(0, 600) });
    } catch (e) {}
    return origError.apply(console, arguments);
  };

  // ── Root attribute churn ──────────────────────────────────────────────────
  // Every visual decision the pre-paint scripts make lands on <html> (a theme
  // class, an inline custom property, data-density, data-color-vision, dir) or
  // on <body> (the ground). If any of them MOVES after first paint, the visitor
  // watched it move.
  var ROOT_ATTRS = ['class', 'style', 'dir', 'lang', 'data-density', 'data-color-vision', 'data-app-dark'];
  var attachChurn = function () {
    var root = document.documentElement;
    if (!root) return false;
    try {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          var target = r.target === document.body ? 'body' : 'html';
          S.rootMutations.push({
            t: now(),
            target: target,
            attribute: r.attributeName,
            from: r.oldValue === null ? '' : String(r.oldValue).slice(0, 300),
            to: String(
              (r.target.getAttribute && r.target.getAttribute(r.attributeName)) || '',
            ).slice(0, 300),
          });
        }
      }).observe(root, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ROOT_ATTRS,
        subtree: false,
      });
    } catch (e) {}
    return true;
  };

  // ── The per-frame sampler ─────────────────────────────────────────────────
  // getComputedStyle on two elements per frame. This is the exact, pixel-free
  // answer to "what ground was the document painting at time t" — the frame
  // screencast in the runner is the corroborating evidence, not the source.
  var effectiveGround = function (htmlBg, bodyBg) {
    var transparent = function (c) {
      return !c || c === 'transparent' || /rgba\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\)/.test(c);
    };
    if (!transparent(htmlBg)) return htmlBg;
    if (!transparent(bodyBg)) return bodyBg;
    return 'rgb(255, 255, 255)';
  };

  // document.styleSheets includes constructed and inline sheets with no href;
  // only the linked ones can arrive late, so only those are tracked.
  var sheetHrefs = function () {
    var out = [];
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        var href = sheets[i].href;
        if (href) out.push(href);
      }
    } catch (e) {}
    return out;
  };

  // ── Did a late stylesheet restyle content that was already on screen? ─────
  //
  // This has to be asked AT THE FRAME THE SHEET ARRIVES, which is why it lives
  // in the instrument rather than in the runner. Asking it after the page has
  // settled gives the wrong answer in the common and CORRECT case: Vite's
  // '__vitePreload' awaits a dynamically-imported chunk's CSS before executing
  // the chunk, so a game's stylesheet lands several hundred milliseconds BEFORE
  // the game's markup exists. Measured on /isleworks: sheet applied at 553ms,
  // first '.isw' element at 1020ms. Its selectors all match once the game has
  // mounted, and none of them matched anything when the sheet arrived — nothing
  // ever painted unstyled, and a detector that asked at the end would have called
  // that a flash.
  //
  // Universal selectors (':root', 'html', 'body', '*') are excluded: they match by
  // definition, so they say nothing about whether live content was restyled. What
  // a ':root' block in a late sheet actually changes — a token some element reads
  // through 'var()' — shows up in the root-restyle, layout-shift and compositor
  // frame detectors instead, which measure the consequence rather than guess at it.
  var UNIVERSAL = /^(?::root|html|body|\\*|:where\\((?:html|:root|body)\\))$/;
  var sheetImpact = {};
  var noteSheet = function (href, t) {
    if (sheetImpact[href]) return;
    var record = { t: t, readable: false, reason: '', liveMatches: [], selectorCount: 0, rootOnly: 0 };
    sheetImpact[href] = record;
    var sheet = null;
    try {
      var all = document.styleSheets;
      for (var i = 0; i < all.length; i++) {
        if (all[i].href === href) { sheet = all[i]; break; }
      }
    } catch (e) {}
    if (!sheet) { record.reason = 'sheet not found'; return; }
    var rules;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      // Cross-origin (the deferred Google Fonts sheet). Its rules cannot be read;
      // its impact is measured by the font detector in the runner.
      record.reason = 'cross-origin';
      return;
    }
    record.readable = true;
    var selectors = {};
    var walk = function (list) {
      for (var i = 0; i < list.length; i++) {
        var rule = list[i];
        if (rule.selectorText) {
          var parts = rule.selectorText.split(',');
          for (var j = 0; j < parts.length; j++) selectors[parts[j].trim()] = true;
        } else if (rule.cssRules) {
          walk(rule.cssRules);
        }
      }
    };
    try { walk(rules); } catch (e) {}

    for (var sel in selectors) {
      record.selectorCount++;
      // Strip pseudo-elements and state pseudo-classes the document cannot be
      // asked about; what is left still identifies the element the rule targets.
      var probe = sel
        .replace(/::?(?:before|after|backdrop|placeholder|selection|marker|first-line|first-letter)\\b/g, '')
        .replace(/::?(?:part|slotted)\\([^)]*\\)/g, '')
        .replace(/:(?:hover|focus|focus-visible|focus-within|active|visited|target|disabled|checked|indeterminate|placeholder-shown|user-invalid|open)\\b/g, '')
        .trim();
      if (!probe || probe.charAt(0) === '@') continue;
      if (UNIVERSAL.test(probe)) { record.rootOnly++; continue; }
      if (record.liveMatches.length >= 6) continue;
      try {
        if (document.querySelector(probe)) record.liveMatches.push(sel);
      } catch (e) {
        // Not a selector the document can be queried with; skip it.
      }
    }
  };
  S.sheetImpact = sheetImpact;

  // Flipped to a timestamp the first frame each family reports 'loaded'. A family
  // whose first 'loaded' frame is after FCP is one the reader watched swap in.
  var noteFonts = function (t) {
    try {
      document.fonts.forEach(function (face) {
        if (face.status !== 'loaded') return;
        var name = String(face.family).replace(/^["']|["']$/g, '');
        if (S.fontLoadedAt[name] === undefined) S.fontLoadedAt[name] = t;
        if (face.display !== 'optional') S.fontSwaps[name] = true;
      });
    } catch (e) {}
  };

  var lastKey = null;
  var sample = function () {
    var root = document.documentElement;
    if (!root) return;
    var cs = getComputedStyle(root);
    var bodyCs = document.body ? getComputedStyle(document.body) : null;
    var htmlBg = cs.backgroundColor;
    var bodyBg = bodyCs ? bodyCs.backgroundColor : '';
    var snap = {
      t: now(),
      ground: effectiveGround(htmlBg, bodyBg),
      htmlBg: htmlBg,
      bodyBg: bodyBg,
      colorScheme: cs.colorScheme,
      color: cs.color,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      cls: root.className || '',
      dir: root.getAttribute('dir') || '',
      accent: cs.getPropertyValue('--site-accent').trim(),
      surface: cs.getPropertyValue('--site-surface').trim(),
      appDark: root.getAttribute('data-app-dark') || '',
      density: root.getAttribute('data-density') || '',
      bodyCount: document.body ? document.body.childElementCount : 0,
      // The stylesheets ACTUALLY APPLIED to the document, which is a different
      // set from "every .css the page fetched". A route chunk preloaded on hover
      // (speculation rules, the router's intent preload, Vite's modulepreload)
      // downloads a stylesheet that styles nothing here, and counting those as
      // late CSS buries the real finding under one per prefetched link. A sheet
      // that enters THIS list after first paint restyled this page.
      sheets: sheetHrefs(),
    };
    // Collapse runs: only the frames where something actually changed are kept,
    // so a 4-second sample of a settled page is a handful of rows and not 240.
    var key =
      snap.ground + '|' + snap.colorScheme + '|' + snap.color + '|' + snap.fontFamily + '|' +
      snap.fontSize + '|' + snap.cls + '|' + snap.dir + '|' + snap.accent + '|' +
      snap.surface + '|' + snap.appDark + '|' + snap.density + '|' + snap.sheets.join(',');
    if (key !== lastKey) {
      snap.changed = lastKey === null ? 'initial' : 'changed';
      S.samples.push(snap);
      lastKey = key;
    }
    // Probe each sheet the instant it joins the cascade — see noteSheet.
    for (var si = 0; si < snap.sheets.length; si++) {
      if (!sheetImpact[snap.sheets[si]]) noteSheet(snap.sheets[si], snap.t);
    }
    noteFonts(snap.t);
  };

  // ── Keeping the compositor awake ──────────────────────────────────────────
  //
  // Chromium's Page.startScreencast emits a frame only when the captured surface
  // is updated, and a settled page never updates it. Measured on the home page: a
  // screencast delivers ~26 frames spanning ~700ms and then goes silent, so a
  // flash at 1.1s was invisible to the pixel detector while being plainly visible
  // to a human. Acking every frame synchronously does not help — the stream is not
  // stalled, there is simply nothing to send.
  //
  // So the instrument gives the surface a reason to update on every frame. Three
  // variants were measured over a 4s window (frames / span):
  //
  //   off-screen 1px transform    26 / 2063ms   — dirties the layer tree but not
  //                                               the captured surface, so most
  //                                               frames are never emitted.
  //   in-viewport 1px transform   25 / 1623ms   — same problem.
  //   in-viewport 1px opacity    105 / 3521ms   — continuous.
  //
  // The winner is a single pixel in the bottom-right corner whose opacity
  // alternates between 0.002 and 0.004. It is inside the viewport, so the surface
  // updates; it is one pixel at 0.3% opacity, so no human and no threshold in this
  // audit can see it (the capture is downscaled to 24x48, where it is a
  // thousandth of one cell). It is 'position: fixed', so it cannot affect layout
  // or create a scrollbar.
  //
  // This is the one way the audit perturbs the page it measures, and it is the
  // minimum that makes the measurement possible at all.
  var beat = null;
  var beatPhase = 0;
  var heartbeat = function () {
    if (!document.body) return;
    if (!beat) {
      beat = document.createElement('div');
      beat.setAttribute('aria-hidden', 'true');
      beat.setAttribute('data-fouc-heartbeat', '');
      beat.style.cssText =
        'position:fixed;right:0;bottom:0;width:1px;height:1px;background:#808080;' +
        'pointer-events:none;will-change:opacity;opacity:0.002';
      document.body.appendChild(beat);
    }
    beatPhase = beatPhase ? 0 : 1;
    beat.style.opacity = beatPhase ? '0.004' : '0.002';
  };

  var frame = function () {
    if (!S.sampling) return;
    sample();
    // Only when the runner is actually capturing frames. The heartbeat forces
    // 60fps compositing for the whole sample window, which on a page that already
    // runs its own rAF loop (every game) is pure contention — and with no
    // screencast to feed, pure waste. The runner sets the flag in an init script
    // injected before this one.
    if (window.__foucCaptureFrames) heartbeat();
    if (now() - S.t0 > (window.__foucWindowMs || ${SAMPLE_WINDOW_MS})) {
      S.sampling = false;
      S.stoppedAt = now();
      if (beat) beat.remove();
      return;
    }
    requestAnimationFrame(frame);
  };

  // documentElement may not exist yet at document-start; latch onto it the
  // moment it does rather than guessing a delay.
  if (!attachChurn()) {
    var boot = new MutationObserver(function () {
      if (attachChurn()) {
        boot.disconnect();
        sample();
      }
    });
    boot.observe(document, { childList: true, subtree: true });
  } else {
    sample();
  }
  requestAnimationFrame(frame);

  document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive') S.domInteractive = now();
  });
  window.addEventListener('load', function () {
    S.loadEnd = now();
  });
})()`;
