/**
 * The RMH Med Schools visual pass (owner O6): shoots the public and private pages in Day and Night at the O6 sizes, and
 * asserts what a screenshot can hide: no sideways scroll, the edition that was asked for is the one painted, chart text
 * readable below 1024 px, touch targets on coarse viewports, and a right-to-left page in `ar`.
 *
 *   # a SCRATCH database seeded with seed-visual.ts, migrated, and the built app on 7005 (see features/medschools/CLAUDE.md)
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scratch \
 *   PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs \
 *     node scripts/medschools/visual-check.mjs --base http://localhost:7005 --out /tmp/medschools-shots
 *
 * Options: --size 390x844 (one size), --mode day|night, --page <substring>, --lang ar (only the `ar` pass; `ar` always
 * runs at 390 and 1280 unless --size is given), --skip-setup (reuse the user in <out>/user.json).
 *
 * It signs up ONE member (the sign-up limit is 10 a minute), backdates the account when DATABASE_URL names a scratch
 * database so sharing may be switched on, and fills a tracker, two lists and preferences through the real endpoints. The
 * shots are for looking at (PNGs are not committed). Exit 1 when an assertion fails.
 *
 * How Night is selected: the pre-paint script reads `localStorage['rmh-style']` (`graphite` is Night, `default` is Day;
 * `lib/prepaint/theme.ts`), exactly as `scripts/audit-pages.mjs` sets it. A signed-in visitor's saved account appearance
 * overrides that key on the first paint (`lib/prepaint/account-seed.ts`), so the member this script creates must have none;
 * the assertion on the painted background proves it, per shot, rather than trusting the setting. (This is why an earlier
 * pass painted Night shots light: the account's saved edition, written by the idle sync after a Day pass, won over the
 * device's. The script now sets the account's edition through PUT /api/preferences/appearance before each signed-in shot.)
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
/* global localStorage -- used inside the pages' init script, which runs in the browser. */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const BASE = opt('base', 'http://localhost:7005').replace(/\/$/, '');
const OUT = opt('out', join(ROOT, '.cache', 'medschools-shots'));
mkdirSync(OUT, { recursive: true });
const ONLY_SIZE = opt('size');
const ONLY_MODE = opt('mode');
const ONLY_PAGE = opt('page');
const ONLY_LANG = opt('lang');

const SIZES = [
  [320, 568],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1024, 600],
  [1280, 800],
  [1920, 1080],
  [2560, 1080],
];
const AR_SIZES = [
  [390, 844],
  [1280, 800],
];
const SCHOOL = '/rmh-medschool/harvard';
const PAGES = [
  ['index', '/rmh-medschool', false, async () => {}],
  ['live', '/rmh-medschool/live', false, async () => {}],
  [
    'harvard-activity-tooltip',
    SCHOOL,
    false,
    async (p) => {
      const plot = p.locator('[role="group"][tabindex="0"]:visible').first();
      await plot.scrollIntoViewIfNeeded().catch(() => {});
      const box = await plot.boundingBox();
      if (box) await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await p.waitForTimeout(500);
    },
  ],
  ['harvard-history', `${SCHOOL}?tab=history`, false, async () => {}],
  ['harvard-interviews-overview', `${SCHOOL}?tab=interviews`, false, async () => {}],
  ['harvard-interviews-questions', `${SCHOOL}?tab=interviews&itab=questions`, false, async () => {}],
  ['harvard-interviews-format', `${SCHOOL}?tab=interviews&itab=format`, false, async () => {}],
  [
    'do-school-programs',
    '/rmh-medschool/philadelphia-com',
    false,
    async (p) => {
      // The DO school offers DO and DO-PhD: switch one off to show the toggled state and the redrawn chart.
      await p
        .getByRole('button', { name: 'DO-PhD', exact: true })
        .first()
        .click()
        .catch(() => {});
      await p.waitForTimeout(500);
    },
  ],
  ['tracker', '/rmh-medschool/tracker', true, async () => {}],
  ['lists', '/rmh-medschool/lists', true, async () => {}],
];

/* ------------------------------ the member ------------------------------ */

const jsonHeaders = (cookie) => ({ 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) });
const toCookies = (res) =>
  res.headers.getSetCookie().map((c) => {
    const [nv] = c.split(';');
    const i = nv.indexOf('=');
    return { name: nv.slice(0, i), value: nv.slice(i + 1) };
  });
const cookieHeader = (cs) => cs.map((c) => `${c.name}=${c.value}`).join('; ');

async function setup() {
  const file = join(OUT, 'user.json');
  if (args.includes('--skip-setup') && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const email = `visual-${Date.now().toString(36)}@example.test`;
  const password = 'Visual-pass-12345';
  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, name: 'Visual Member' }),
  });
  const body = await signUp.json();
  if (!body?.user?.id) throw new Error(`sign-up failed: HTTP ${signUp.status} ${JSON.stringify(body)}`);
  let cookies = toCookies(signUp);
  const url = process.env.DATABASE_URL;
  if (url && /scratch/.test(url) && /127\.0\.0\.1|localhost/.test(url)) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    await pool.query(`update "user" set "createdAt" = now() - interval '30 days' where id = $1`, [body.user.id]);
    await pool.end();
    // The session cookie cache holds the user as it was at sign-up: sign in again so the account reads as old.
    const again = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password }),
    });
    cookies = toCookies(again);
  }
  const call = async (method, path, json) => {
    const r = await fetch(BASE + path, {
      method,
      headers: jsonHeaders(cookieHeader(cookies)),
      body: json ? JSON.stringify(json) : undefined,
    });
    const text = await r.text();
    if (!r.ok) console.log(`setup: ${method} ${path} -> ${r.status} ${text.slice(0, 120)}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  const now = new Date();
  const cycle = now.getUTCMonth() < 5 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
  const schools = (await (await fetch(`${BASE}/api/medschools/schools`)).json()).schools;
  const md = schools.filter((s) => s.degree === 'MD').slice(0, 4);
  const dos = schools.filter((s) => s.degree === 'DO').slice(0, 2);
  // Lists: two, with a note and a program-specific item.
  const reach = await call('POST', '/api/medschools/me/list-items', {
    schoolSlug: md[0].slug,
    newListName: 'Reach schools',
  });
  for (const s of md.slice(1, 3))
    await call('POST', '/api/medschools/me/list-items', { schoolSlug: s.slug, listId: reach.id, program: 'PHD' });
  await call('POST', '/api/medschools/me/list-items', { schoolSlug: dos[0].slug, newListName: 'Maybe DO' });
  const lists = (await call('GET', '/api/medschools/me/lists')).lists;
  await call('PATCH', `/api/medschools/me/lists/${lists[0].id}/items/${lists[0].items[0].id}`, {
    note: 'Visited in October. Ask about the research track at the interview.',
  });
  await call('PUT', '/api/medschools/me/prefs', {
    homeState: 'NC',
    chartCategories: ['INTERVIEW', 'ACCEPTANCE', 'REJECTION'],
  });
  // Tracker: a populated cycle with sharing on when the account is old enough.
  await call('PUT', '/api/medschools/me/tracker/cycle', { cycleYear: cycle, homeState: 'NC', shareAnonymously: false });
  const picks = [...md.slice(0, 3), dos[0]];
  const y0 = cycle - 1;
  const milestones = [
    ['SUBMITTED', `${y0}-06-20`],
    ['COMPLETE', `${y0}-07-30`],
    ['SECONDARY', `${y0}-08-12`],
    ['INTERVIEW', `${y0}-10-05`],
    ['REJECTION', `${y0}-10-18`],
  ];
  for (const [i, s] of picks.entries()) {
    const app = await call('POST', '/api/medschools/me/tracker/applications', {
      cycleYear: cycle,
      schoolSlug: s.slug,
      program: i === 1 ? 'PHD' : 'REG',
    });
    if (!app.id) continue;
    for (const [type, date] of milestones.slice(0, [5, 3, 1, 0][i])) {
      await call('PUT', `/api/medschools/me/tracker/applications/${app.id}/milestones/${type}`, { date });
    }
    if (i === 0)
      await call('PATCH', `/api/medschools/me/tracker/applications/${app.id}`, {
        notes: 'Visited in October. Ask about the research track.',
      });
  }
  const sharing = await call('PUT', '/api/medschools/me/tracker/cycle', { cycleYear: cycle, shareAnonymously: true });
  if (sharing?.cycle?.shareAnonymously !== true)
    console.log('setup: sharing stayed off (secret unset or the account is too new)');
  const user = { email, cookies };
  writeFileSync(file, JSON.stringify(user, null, 2));
  return user;
}

/* ------------------------------ the shots ------------------------------ */

const REL = /CURRENT_RELEASE: Release = \{\s*id: '([^']+)'/.exec(
  readFileSync(join(ROOT, 'lib/whats-new.ts'), 'utf8'),
)?.[1];

/** Everything measured in the page, as plain data. */
function measure({ touch, narrow }) {
  const de = document.documentElement;
  const lum = (rgb) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
    if (!m) return null;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const small = touch
    ? // Controls only: a text link in a row or a sentence is not a control (the row's padding is its target), and the Switch
      // draws a 16px track with a 44px hit area of its own (Steel K6, its `::after`).
      [
        ...document.querySelectorAll(
          'main button:not([role=switch]), main select, main input, main [role=radio], aside button, aside input',
        ),
      ]
        .filter(visible)
        .filter((e) => e.getBoundingClientRect().height < 44 && e.type !== 'hidden')
        .map(
          (e) =>
            `${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 28)}:${Math.round(e.getBoundingClientRect().height)}`,
        )
    : [];
  // SVG text is drawn in viewBox units: its size on the glass is the font size times the CTM scale.
  const chartText = narrow
    ? [...document.querySelectorAll('svg text')]
        .filter((t) => visible(t.ownerSVGElement ?? t))
        .map((t) => ({
          text: (t.textContent || '').trim().slice(0, 16),
          px: parseFloat(getComputedStyle(t).fontSize) * (t.getScreenCTM()?.a ?? 1),
        }))
        .filter((t) => t.px < 10.95 && t.text)
    : [];
  // A modal's scrim left over the page (a first-run dialog nobody dismissed) dims everything behind it in the shot.
  const scrims = [...document.querySelectorAll('.glass-scrim, [data-slot=dialog-overlay]')].filter(visible).length;
  return {
    scrims,
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    bodyLum: lum(getComputedStyle(document.body).backgroundColor),
    htmlClass: de.className,
    dir: de.dir,
    small,
    chartText,
  };
}

async function main() {
  const user = await setup();
  const browser = await chromium.launch();
  const problems = [];
  const passes = [];
  for (const [w, h] of SIZES) for (const mode of ['day', 'night']) passes.push({ w, h, mode, lang: 'en' });
  for (const [w, h] of AR_SIZES) passes.push({ w, h, mode: 'day', lang: 'ar' });
  for (const { w, h, mode, lang } of passes) {
    if (ONLY_SIZE && ONLY_SIZE !== `${w}x${h}`) continue;
    if (ONLY_MODE && ONLY_MODE !== mode) continue;
    if (ONLY_LANG && ONLY_LANG !== lang) continue;
    const touch = w < 800;
    for (const [name, path, signedIn, act] of PAGES) {
      if (ONLY_PAGE && !name.includes(ONLY_PAGE)) continue;
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
        colorScheme: mode === 'night' ? 'dark' : 'light',
        hasTouch: touch,
        isMobile: touch,
      });
      if (signedIn) {
        await ctx.addCookies(user.cookies.map((c) => ({ ...c, url: BASE })));
        // A signed-in visit paints the ACCOUNT's saved edition over the device's (lib/prepaint/account-seed.ts), and the
        // idle sync saves whatever the last visit used. Set the account to the edition under test, or a Night pass that
        // follows a Day pass paints Day.
        await fetch(`${BASE}/api/preferences/appearance`, {
          method: 'PUT',
          headers: jsonHeaders(cookieHeader(user.cookies)),
          body: JSON.stringify({ style: mode === 'night' ? 'graphite' : 'default' }),
        });
      }
      if (lang !== 'en') await ctx.addCookies([{ name: 'rmh-lang', value: lang, url: BASE }]);
      await ctx.addInitScript(
        ([style, rel]) => {
          try {
            localStorage.setItem('rmh-style', style);
            localStorage.setItem('rmh-cookie-consent', 'essential');
            localStorage.setItem('rmh-lang-picked-v1', '1');
            localStorage.setItem('rmh-welcome-seen-v1', '1');
            if (rel) localStorage.setItem(`rmh-whatsnew-seen-${rel}-v1`, '1');
          } catch {
            /* private mode */
          }
        },
        [mode === 'night' ? 'graphite' : 'default', REL],
      );
      const page = await ctx.newPage();
      const label = `${name} ${w}x${h} ${mode}${lang === 'en' ? '' : ` ${lang}`}`;
      const errors = [];
      // "Realtime URL is not configured" is the calls hub, absent from a local run; every signed-in page logs it.
      page.on(
        'pageerror',
        (e) => !/Realtime URL is not configured/.test(String(e)) && errors.push(String(e).slice(0, 160)),
      );
      try {
        await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
        await act(page);
        await page.waitForTimeout(700);
        const r = await page.evaluate(measure, { touch, narrow: w < 1024 });
        const found = [];
        if (r.scrollWidth > r.clientWidth) found.push(`sideways scroll ${r.scrollWidth}>${r.clientWidth}`);
        // The edition that was asked for must be the one painted (Day is light, Night is dark).
        if (mode === 'night' && !(r.bodyLum !== null && r.bodyLum < 0.1))
          found.push(`Night painted light (body luminance ${r.bodyLum}, html "${r.htmlClass}")`);
        if (mode === 'day' && !(r.bodyLum !== null && r.bodyLum > 0.8))
          found.push(`Day painted dark (body luminance ${r.bodyLum}, html "${r.htmlClass}")`);
        if (lang === 'ar' && r.dir !== 'rtl') found.push(`ar is not right to left (dir "${r.dir}")`);
        if (r.scrims) found.push(`${r.scrims} modal scrim(s) over the page`);
        if (r.chartText.length)
          found.push(
            `chart text under 11px: ${r.chartText
              .slice(0, 4)
              .map((t) => `${t.text}=${t.px.toFixed(1)}`)
              .join(', ')}`,
          );
        if (r.small.length) found.push(`touch targets under 44px: ${r.small.slice(0, 5).join(', ')}`);
        if (errors.length) found.push(`page errors: ${errors.join(' | ')}`);
        const stem = join(OUT, `${name}-${w}x${h}-${mode}${lang === 'en' ? '' : `-${lang}`}`);
        // The first screen, at the viewport asked for.
        await page.screenshot({ path: `${stem}-vp.png` });
        // The whole page: grow the viewport to the page's height and wait, then shoot it as it stands. A fullPage capture
        // resizes the viewport itself and shoots at once, and content that arrives on that resize (the rail's rows fade in
        // over 160 ms, M9) is caught half-faded, which looks like a dimmed column that no visitor ever sees.
        const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 2600);
        await page.setViewportSize({ width: w, height: Math.max(h, height) });
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${stem}.png` });
        console.log(`${found.length ? 'FAIL' : 'ok  '} ${label}${found.length ? `  ${found.join('; ')}` : ''}`);
        for (const f of found) problems.push(`${label}: ${f}`);
      } catch (e) {
        console.log(`FAIL ${label}  ${String(e).slice(0, 160)}`);
        problems.push(`${label}: ${String(e).slice(0, 160)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nno problems');
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
