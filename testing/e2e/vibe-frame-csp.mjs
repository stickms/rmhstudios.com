// ─────────────────────────────────────────────────────────────────────────────
// The vibe frame loader under an ENFORCED nonce policy on the host page (docs/csp.md,
// "Frames that run user code"). No app and no database: a tiny node server stands in for
// the site, serving the real loader (lib/rmhvibe/frame-response.server.ts) and the real
// host helper (lib/rmhvibe/frame-loader.ts, bundled with esbuild).
//
//   pnpm exec tsx testing/e2e/vibe-frame-csp.mjs
//   CHROMIUM_PATH=/path/to/chrome …           # optional: a specific browser
//
// The parent page carries  script-src 'nonce-…' 'strict-dynamic'  with NO 'unsafe-inline',
// the policy the site moves to on day 14 of the rollout. Then:
//   1. srcdoc (the old way): the vibe's inline scripts are blocked        (proves the test bites)
//   2. loader: import map, inline module importing a same-origin module, inline classic
//      script and a same-origin fetch all run; fetch to another origin is blocked; the
//      frame has an opaque origin; the host helper reports `loaded` once, for the
//      written document
//   3. /vibe-frame opened top-level (window.parent === window) does nothing and still
//      has an opaque origin (the CSP `sandbox` directive)
//   4. the response carries its own header and none of the site's
// Exits 1 on the first failure.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { frameLoaderHeaders } from '../../lib/rmhvibe/frame-response.server.ts';
import { FRAME_LOADER_HTML } from '../../lib/rmhvibe/frame-protocol.ts';

const NONCE = 'dGVzdC1ub25jZS0xMjM0NQ==';
const SITE_POLICY = `default-src 'self'; script-src 'nonce-${NONCE}' 'strict-dynamic'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'`;
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-pointer-lock';

const helper = await build({
  stdin: {
    contents: `import { attachFrameDocument } from './lib/rmhvibe/frame-loader.ts'; window.attachFrameDocument = attachFrameDocument;`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  alias: { '@': process.cwd() },
  external: ['react'],
  banner: { js: 'var require = function () { return {}; };' },
});
const HELPER_JS = helper.outputFiles[0].text;

let origin = '';
const vibe = () => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; script-src 'unsafe-inline' blob: https://esm.sh ${origin}; worker-src blob:; style-src 'unsafe-inline' https://esm.sh ${origin}; img-src data: blob:; font-src data: https://esm.sh; media-src data: blob:; connect-src https://esm.sh ${origin}">
<script type="importmap">{"imports":{"lib":"${origin}/mod.js"}}</script></head><body>
<script>parent.postMessage({ t: 'classic', origin: String(self.origin) }, '*');</script>
<script type="module">
import { answer } from 'lib';
parent.postMessage({ t: 'module', answer }, '*');
const same = await fetch('${origin}/ping').then((r) => r.text(), (e) => 'ERR ' + e.name);
parent.postMessage({ t: 'fetch-same', same }, '*');
const other = await fetch('https://example.com/').then(() => 'reached', () => 'blocked');
parent.postMessage({ t: 'fetch-other', other }, '*');
</script></body></html>`;

const parentPage = (mode) => `<!doctype html><html><body>
<script nonce="${NONCE}">${HELPER_JS}</script>
<script nonce="${NONCE}">
window.__events = [];
let loaded = 0;
window.addEventListener('message', (e) => { if (e.data && e.data.t) window.__events.push(e.data); });
const f = document.createElement('iframe');
f.setAttribute('sandbox', ${JSON.stringify(SANDBOX)});
if (${JSON.stringify(mode)} === 'srcdoc') { f.srcdoc = window.__VIBE; document.body.append(f); }
else {
  f.src = '/vibe-frame';
  document.body.append(f);
  window.attachFrameDocument(f, () => window.__VIBE, () => { loaded++; window.__events.push({ t: 'host-loaded', n: loaded }); });
}
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/parent') {
    const mode = url.searchParams.get('mode');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': SITE_POLICY });
    // The vibe is set from a nonce'd script so the parent page itself needs no inline data.
    res.end(parentPage(mode).replace('<script nonce="' + NONCE + '">\nwindow.__events', `<script nonce="${NONCE}">window.__VIBE = ${JSON.stringify(vibe()).replace(/</g, '\\u003c')};</script><script nonce="${NONCE}">\nwindow.__events`));
  } else if (url.pathname === '/vibe-frame') {
    res.writeHead(200, frameLoaderHeaders());
    res.end(FRAME_LOADER_HTML);
  } else if (url.pathname === '/mod.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' });
    res.end('export const answer = 42;');
  } else if (url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('pong');
  } else {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ok = (name) => console.log(`ok  ${name}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  // 1. srcdoc under the same enforced parent policy: nothing inline runs.
  {
    const page = await browser.newPage();
    const violations = [];
    page.on('console', (m) => m.text().includes('Content Security Policy') && violations.push(m.text()));
    await page.goto(`${origin}/parent?mode=srcdoc`);
    await wait(1500);
    assert.ok(violations.length > 0, 'srcdoc: expected CSP violations from the inherited policy');
    const events = await page.evaluate(() => window.__events);
    assert.deepEqual(events, [], 'srcdoc: inline scripts must be blocked by the inherited nonce policy');
    ok('srcdoc under the nonce policy: no inline script ran (the test is meaningful)');
    await page.close();
  }

  // 2. the loader.
  {
    const page = await browser.newPage();
    page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`));
    const frameResponse = page.waitForResponse((r) => r.url().endsWith('/vibe-frame'));
    await page.goto(`${origin}/parent?mode=loader`);
    const r = await frameResponse;
    const h = r.headers();
    assert.match(h['content-security-policy'], /^sandbox allow-scripts /);
    assert.ok(!('content-security-policy-report-only' in h));
    ok('loader response carries its own policy and no report-only policy');
    await page.waitForFunction(() => window.__events.some((e) => e.t === 'fetch-other'), null, { timeout: 15000 });
    await wait(500);
    const events = await page.evaluate(() => window.__events);
    const by = Object.fromEntries(events.map((e) => [e.t, e]));
    assert.equal(by.classic?.origin, 'null', 'opaque origin');
    ok('inline classic script ran, frame origin is opaque (null)');
    assert.equal(by.module?.answer, 42);
    ok('import map + inline module importing a same-origin module ran');
    assert.equal(by['fetch-same']?.same, 'pong');
    ok(`fetch to the site origin works ('self' matches ${origin} from the opaque-origin document)`);
    assert.equal(by['fetch-other']?.other, 'blocked');
    ok('fetch to another origin is blocked');
    assert.equal(events.filter((e) => e.t === 'host-loaded').length, 1, 'host helper reports `loaded` exactly once');
    ok('host helper reported loaded once, for the written document');
    await page.close();
  }

  // 3. top level: refuses, and is still sandboxed by the header.
  {
    const page = await browser.newPage();
    await page.goto(`${origin}/vibe-frame`);
    await wait(500);
    const state = await page.evaluate(() => ({
      body: document.body.innerHTML,
      origin: String(self.origin),
      top: window.parent === window,
    }));
    assert.deepEqual(state, { body: '', origin: 'null', top: true });
    ok('top-level /vibe-frame does nothing and has an opaque origin (CSP sandbox)');
    await page.close();
  }
  console.log('all passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
