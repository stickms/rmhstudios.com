#!/usr/bin/env node
/**
 * Record a running old build of the site into a WARC that ReplayWeb.page can play back.
 *
 *   node scripts/site-archive/record.mjs --port 7110 --entry / --out out.warc.gz [--links 12] [--init init.js]
 *                                        [--session <token> --secret <auth secret>] [--paths /a,/b]
 *                                        [--clicks 'text=Play;button:has-text("Start")']
 *
 * The old build listens on 127.0.0.1:<port>. Chromium resolves rmhstudios.com to it, and every page is browsed
 * as http://rmhstudios.com/…, so the archive holds the site under its own name and every version replays at the
 * same URLs. Every request the page makes goes through page.route(): the response is fetched, written to the WARC
 * (a gzipped response record, plus a request record for anything with a body) and handed back to the page.
 *
 * What is browsed: the entry page at a desktop and a phone width (the pictures and chunks differ), scrolled to the
 * bottom so lazy content loads; then up to --links internal links found on it, the same way. Optional --clicks
 * (selectors, `;`-separated) are clicked on the entry page in order, for games whose assets load only once
 * started. Anything the recording never fetched is missing on replay, so the browse is deliberately generous.
 *
 * --session signs the demo account's session token the way Better Auth does (better-call's signCookieValue:
 * `token.base64(HMAC-SHA256(secret, token))`, URL-encoded) so games that sat behind sign-in are recorded signed in.
 * One response over 80 MB, or anything past 400 MB in total, is left out (logged): a recording is for looking
 * around, and the 3D games' asset packs would otherwise make one version larger than the rest together.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { createWriteStream, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const PORT = Number(args.port);
const ENTRY = args.entry ?? '/';
const OUT = args.out;
const LINKS = Number(args.links ?? 12);
const HOST = 'rmhstudios.com';
const ORIGIN = `http://${HOST}`;
if (!PORT || !OUT) {
  console.error('usage: record.mjs --port <n> --out <file.warc.gz> [--entry /path]');
  process.exit(2);
}

const out = createWriteStream(OUT);
const MAX_BODY = 80 * 1024 * 1024;
const MAX_TOTAL = 400 * 1024 * 1024;
const seen = new Set();
let records = 0;
let bytes = 0;

function warcRecord(type, uri, block, extra = {}) {
  const id = `<urn:uuid:${randomUUID()}>`;
  const head = [
    'WARC/1.0',
    `WARC-Type: ${type}`,
    `WARC-Record-ID: ${id}`,
    `WARC-Date: ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`,
    `WARC-Target-URI: ${uri}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    `Content-Type: application/http; msgtype=${type}`,
    `Content-Length: ${block.length}`,
    '',
    '',
  ].join('\r\n');
  out.write(gzipSync(Buffer.concat([Buffer.from(head), block, Buffer.from('\r\n\r\n')])));
  records++;
  return id;
}

const DROP = new Set(['content-encoding', 'transfer-encoding', 'content-length', 'connection', 'set-cookie']);

const INIT = args.init ? readFileSync(args.init, 'utf8') : '';

/**
 * What the archive keeps of an HTML page from the recorded build: the page itself, with two changes for playback
 * (the browser during recording gets the untouched page).
 *
 * 1. A module bootstrap written as an inline dynamic import (`<script type="module">import("/assets/main.js")</script>`,
 *    TanStack Start's first builds) becomes `<script type="module" src="/assets/main.js">`. Playback rewrites a
 *    script's src into the archive, but not a URL inside inline code, so the import left the archive, 404'd, and the
 *    page never started.
 * 2. The returning-visitor script (--init: the first-run keys of that commit) is put first in <head>. Playback gives
 *    every page its own empty storage, so without it each old page opened under its language chooser, cookie notice
 *    or what's-new dialog.
 */
function archivedBody(req, headers, body) {
  const type = String(headers['content-type'] ?? '').toLowerCase();
  if (!type.includes('text/html') || new URL(req.url()).hostname !== HOST) return body;
  let html = body.toString('utf8');
  html = html.replace(
    /<script([^>]*)>\s*import\(\s*(["'])(\/[^"']+)\2\s*\)\s*;?\s*<\/script>/g,
    (_m, attrs, _q, src) => `<script${attrs} src="${src}"></script>`,
  );
  if (INIT && !INIT.includes('</script')) html = html.replace(/<head[^>]*>/i, (m) => `${m}<script>${INIT}</script>`);
  return Buffer.from(html, 'utf8');
}

function record(req, status, statusText, headers, rawBody) {
  const body = archivedBody(req, headers, rawBody);
  const method = req.method();
  const post = req.postDataBuffer();
  const uri = req.url();
  const key = `${method} ${uri} ${post ? post.length : ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (body.length > MAX_BODY || bytes + body.length > MAX_TOTAL) {
    console.warn(`  - left out ${uri} (${(body.length / 1048576).toFixed(1)} MB)`);
    return;
  }
  const lines = [`HTTP/1.1 ${status} ${statusText || 'OK'}`];
  for (const [k, v] of Object.entries(headers)) if (!DROP.has(k.toLowerCase())) lines.push(`${k}: ${v}`);
  lines.push(`Content-Length: ${body.length}`, '', '');
  const id = warcRecord('response', uri, Buffer.concat([Buffer.from(lines.join('\r\n')), body]));
  if (method !== 'GET' || post) {
    const u = new URL(uri);
    const reqHead = [`${method} ${u.pathname}${u.search} HTTP/1.1`, `Host: ${u.host}`];
    for (const [k, v] of Object.entries(req.headers())) if (k !== 'cookie') reqHead.push(`${k}: ${v}`);
    reqHead.push('', '');
    warcRecord('request', uri, Buffer.concat([Buffer.from(reqHead.join('\r\n')), post ?? Buffer.alloc(0)]), {
      'WARC-Concurrent-To': id,
    });
  }
  bytes += body.length;
}

const browser = await chromium.launch({
  // CI installs the repo's Playwright browser; elsewhere a preinstalled Chromium can be named instead.
  ...(process.env.ARCHIVE_CHROMIUM ? { executablePath: process.env.ARCHIVE_CHROMIUM } : {}),
  args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1:${PORT}`],
});

async function newContext(mobile) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 800 } },
  );
  if (args.init) await ctx.addInitScript(readFileSync(args.init, 'utf8'));
  if (args.session && args.secret) {
    const sig = createHmac('sha256', args.secret).update(args.session).digest('base64');
    const value = encodeURIComponent(`${args.session}.${sig}`);
    await ctx.addCookies([{ name: 'better-auth.session_token', value, url: ORIGIN }]);
  }
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    if (req.url().startsWith('data:') || req.url().startsWith('blob:')) return route.continue();
    try {
      // route.fetch() runs in Node, not in Chromium, so the host mapping above does not apply to it: send the
      // archived host's requests to the local build explicitly (keeping Host), and let every other origin through.
      const u = new URL(req.url());
      const local = u.hostname === HOST;
      const resp = await route.fetch({
        maxRedirects: 0,
        timeout: 60_000,
        ...(local
          ? { url: `http://127.0.0.1:${PORT}${u.pathname}${u.search}`, headers: { ...req.headers(), host: HOST } }
          : {}),
      });
      const body = await resp.body();
      record(req, resp.status(), resp.statusText(), resp.headers(), body);
      await route.fulfill({ response: resp, body });
    } catch (e) {
      await route.abort().catch(() => {});
    }
  });
  return ctx;
}

async function browse(page, path) {
  try {
    await page.goto(ORIGIN + path, { waitUntil: 'load', timeout: 90_000 });
  } catch (e) {
    console.warn(`  ! ${path}: ${e.message.split('\n')[0]}`);
    return;
  }
  await page.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape').catch(() => {});
  // Scroll to the bottom in steps so lazy pictures and appended rows load, then back up.
  await page
    .evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight && y < 30_000; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

const extraPaths = (args.paths ?? '').split(',').filter(Boolean);
let links = [];
for (const mobile of [false, true]) {
  const ctx = await newContext(mobile);
  const page = await ctx.newPage();
  await browse(page, ENTRY);
  if (!mobile) {
    links = await page
      .$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
      .catch(() => []);
    links = [...new Set(links.filter((h) => h && h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/api/')))]
      .map((h) => h.split('#')[0])
      .filter((h) => h && h !== ENTRY && !/logout|sign-?out|delete/i.test(h))
      .slice(0, LINKS);
    for (const sel of (args.clicks ?? '').split(';').filter(Boolean)) {
      await page
        .locator(sel)
        .first()
        .click({ timeout: 5000 })
        .then(() => page.waitForTimeout(4000))
        .catch(() => console.warn(`  ! click ${sel} did not happen`));
    }
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }
  for (const p of mobile ? [] : [...extraPaths, ...links]) await browse(page, p);
  await ctx.close();
}
await browser.close();
await new Promise((r) => out.end(r));
console.log(
  JSON.stringify({ origin: ORIGIN, entry: ENTRY, pages: [ENTRY, ...extraPaths, ...links], records, bytes }),
);
