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
 * Phase 5 adds the Forecast tab (interview, acceptance, an empty PhD one, the signed-in one under the chart), the Activity
 * wave tick, the live feed's "Part of a wave" row and the tracker's invite chance (an estimate and a thin line). A page may
 * declare `expect.text` (regexes the page must show) and `expect.forecast` (its charts must draw no fill-opacity, gradient
 * or filter: Steel R1). Seed with seed-visual.ts first: it writes the wave, 24 sharing members at Duke and runs the forecast.
 *
 * Phase 6 adds the Ask page and the school page's Ask panel: signed out (the sign-in prompt), idle, answered with citations,
 * partial (the removed-statement notice), declined, a "my chance" answer with the member's own estimate, the cap reached
 * (an idle page with no questions left, and the 429 refusal), and the wait. The answered states need a model, so
 * `--fake-ai` starts the fake DeepSeek of `testing/integration/lib/fake-deepseek.ts` in this process (`--fake-port`, default
 * 7798) and the APP must be started with the matching `DEEPSEEK_API_KEY=integration-fake DEEPSEEK_BASE_URL=http://127.0.0.1:7798/v1`
 * (and `RATE_LIMIT_MULTIPLIER=50`: one pass asks a few dozen questions inside a minute). `DATABASE_URL` must name the scratch
 * database too: the script clears the member's `ai_usage` rows between pages and plants the cap's rows. Without `--fake-ai`
 * the pages that need a model are skipped; the signed-out and idle ones still run.
 *
 * Secondaries (owner 2026-11-23): the Secondaries tab (regular and MD-PhD prompts with every mark, the MD-PhD program filter,
 * a not-yet school, a first-year school, an empty school, the turnaround figure) and the essay overlap opened on the lists and
 * tracker pages. Every one asserts no text field (drafts are not stored) and, through `isolates`, that a cycle range keeps its
 * years in order (each cycle a left-to-right isolate, so it holds in `ar`). seed-visual.ts writes the fixture prompts.
 *
 * Options: --fake-ai, --fake-port 7798, --size 390x844 (one size), --mode day|night, --page <substring>, --lang ar (only the `ar` pass; `ar` always
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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const FAKE_AI = args.includes('--fake-ai');
const FAKE_PORT = Number(opt('fake-port', '7798'));

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
const SCHOOL = '/med/harvard';
const PAGES = [
  ['index', '/med', false, async () => {}],
  ['live', '/med/live', false, async () => {}, { text: [/Part of a wave/] }],
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
  [
    'harvard-activity-waves',
    SCHOOL,
    false,
    async (p) => {
      // Interview is on in the visual member's chart preferences, so the wave day carries its tick; the plot is the shot.
      const plot = p.locator('[role="group"][tabindex="0"]:visible').first();
      await plot.scrollIntoViewIfNeeded().catch(() => {});
    },
    { text: [/wave/i] },
  ],
  [
    'harvard-forecast-interview',
    `${SCHOOL}?tab=forecast`,
    false,
    async () => {},
    { forecast: true, text: [/forecast/i] },
  ],
  ['harvard-forecast-acceptance', `${SCHOOL}?tab=forecast&type=ACCEPTANCE`, false, async () => {}, { forecast: true }],
  [
    'harvard-forecast-phd-empty',
    `${SCHOOL}?tab=forecast&program=PHD&type=ACCEPTANCE`,
    false,
    async () => {},
    { forecast: true, text: [/No reported events yet|do not have enough/] },
  ],
  [
    'duke-forecast-signed-in',
    '/med/duke?tab=forecast',
    true,
    async () => {},
    { forecast: true, text: [/Your estimate/, /chance of an interview invite/] },
  ],
  ['harvard-history', `${SCHOOL}?tab=history`, false, async () => {}],
  ['harvard-interviews-overview', `${SCHOOL}?tab=interviews`, false, async () => {}],
  ['harvard-interviews-questions', `${SCHOOL}?tab=interviews&itab=questions`, false, async () => {}],
  ['harvard-interviews-format', `${SCHOOL}?tab=interviews&itab=format`, false, async () => {}],
  [
    'do-school-programs',
    '/med/philadelphia-com',
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
  [
    'tracker',
    '/med/tracker',
    true,
    async () => {},
    { text: [/chance of an interview invite/, /Not enough data yet for an estimate/] },
  ],
  ['lists', '/med/lists', true, async () => {}],
];

/* ------------------------------ Secondaries and the essay overlap ------------------------------ */

const NO_FIELD = { flat: true, absent: ['textarea', 'input[type=text]', '[contenteditable=true]'] };
// The lists page has note fields and the tracker a switch of its own: the rule is that the overlap disclosure has none.
const OVERLAP_NO_FIELD = ['details textarea', 'details input', 'details [contenteditable=true]'];
/** Open every "Essay overlap" disclosure and wait for the grouped prompts (or the empty line) to arrive. */
const openOverlap = async (p) => {
  const all = p.locator('summary', { hasText: 'Essay overlap' });
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    await all
      .nth(i)
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await all.nth(i).click();
  }
  await p.waitForTimeout(1500);
};
const SECONDARIES_PAGES = [
  [
    'harvard-secondaries',
    `${SCHOOL}?tab=secondaries`,
    false,
    async () => {},
    {
      ...NO_FIELD,
      isolates: true,
      text: [
        /Regular prompts/,
        /MD-PhD prompts/,
        /Reworded/,
        /Not seen this cycle/,
        /Same as last cycle/,
        /Optional/,
        /1,500 characters/,
        /Seen in/,
        /Rolling admissions/,
        /Decisions on set dates/,
        /Source: .* admissions page, checked/,
        /Source: Admit\.org, checked/,
        /website, checked/,
      ],
    },
  ],
  [
    'harvard-secondaries-phd',
    `${SCHOOL}?tab=secondaries&program=PHD`,
    false,
    async () => {},
    { ...NO_FIELD, isolates: true, text: [/MD-PhD prompts/, /in addition to or instead of/] },
  ],
  [
    'michigan-secondaries-not-yet',
    '/med/michigan?tab=secondaries',
    false,
    async () => {},
    { ...NO_FIELD, text: [/prompts are not out yet/] },
  ],
  [
    'stanford-secondaries-first-year',
    '/med/stanford?tab=secondaries',
    false,
    async () => {},
    {
      ...NO_FIELD,
      text: [/Regular prompts/],
      textAbsent: [/Same as last cycle/, /Not seen this cycle/, /Compared with/],
    },
  ],
  [
    'hopkins-secondaries-empty',
    '/med/johns-hopkins?tab=secondaries',
    false,
    async () => {},
    { ...NO_FIELD, text: [/No secondary prompts on file/, /nothing found/] },
  ],
  [
    'duke-secondaries-turnaround',
    '/med/duke?tab=secondaries',
    false,
    async () => {},
    { ...NO_FIELD, isolates: true, text: [/Turnaround/, /median of \d+ days/, /24 members who shared/] },
  ],
  [
    'do-secondaries',
    '/med/philadelphia-com?tab=secondaries',
    false,
    async () => {},
    { ...NO_FIELD, text: [/DO-PhD prompts/], textAbsent: [/MD-PhD prompts/] },
  ],
  [
    'lists-overlap',
    '/med/lists',
    true,
    openOverlap,
    { absent: OVERLAP_NO_FIELD, text: [/Essay overlap/, /Shortest limit/, /schools?\b/, /No prompts found yet/] },
  ],
  [
    'tracker-overlap',
    '/med/tracker',
    true,
    openOverlap,
    { absent: OVERLAP_NO_FIELD, text: [/Essay overlap/, /Secondary received/] },
  ],
];
PAGES.push(...SECONDARIES_PAGES);

/* ------------------------------ the Ask pages (phase 6) ------------------------------ */

const ASK_PAGE = '/med/ask';
const DUKE = '/med/duke';
/** What the page must NOT draw: the signed-out Ask page has no field, and no page here draws a stray form control twice. */
const FLAT = { flat: true };

/** The fake provider and the scratch database, set up by `main()` when `--fake-ai` is given. */
const ai = { fake: null, userJson: null, pool: null, userId: null };
const factsOf = (call) => ai.userJson(call.user)?.facts ?? [];
const route = (intent, school = 'Duke') => ({
  intent,
  schools: [school],
  cycle: null,
  filters: { state: null, format: null },
});
/** Segments a grounded model would write: the retrieved sentences themselves (every number in one is in its fact). */
const grounded = (call, n = 3) =>
  factsOf(call)
    .filter((f) => !f.untrusted && /\d/.test(f.text))
    .sort((a, b) => Number(b.label === 'Reported events') - Number(a.label === 'Reported events'))
    .slice(0, n)
    .map((f) => ({ text: f.text.slice(0, 380), cites: [f.ref] }));
const SCRIPTS = {
  answered: (call) => (call.kind === 'route' ? route('facts') : { segments: grounded(call, 3), thin: false }),
  partial: (call) =>
    call.kind === 'route'
      ? route('facts')
      : {
          segments: [
            ...grounded(call, 2),
            { text: 'Duke has 987654 reported interview events.', cites: [factsOf(call)[0]?.ref ?? 'f1'] },
          ],
          thin: false,
        },
  declined: (call) =>
    call.kind === 'route' ? { intent: 'other', schools: [], cycle: null, filters: {} } : { segments: [] },
  mine: (call) => (call.kind === 'route' ? route('my-chance') : { segments: grounded(call, 1), thin: false }),
  slow: async (call) => {
    if (call.kind === 'route') await new Promise((r) => setTimeout(r, 6000));
    return SCRIPTS.answered(call);
  },
};
const clearLedger = () =>
  ai.pool?.query(`delete from ai_usage where task = 'medschools-qa' and ("userId" = $1 or "userId" is null)`, [
    ai.userId,
  ]);
/** The daily cap counts `medschools-qa-ask` reservation rows (not the provider's `-route` rows), so that is what to plant. */
const plantRows = (n) =>
  ai.pool?.query(
    `insert into ai_usage ("userId", task, provider, model, "promptId", "promptVer", "inTokens", "outTokens", "costMicros", ok)
     select $1, 'medschools-qa', 'deepseek', 'fake', 'medschools-qa-ask', 1, 1, 1, 0, true from generate_series(1, $2)`,
    [ai.userId, n],
  );
/** Fill the field, press Ask and (unless `wait` is false) wait for the answer. */
const asking =
  (script, question, { wait = true, before, clear = true } = {}) =>
  async (p) => {
    ai.fake.setScript(script);
    if (clear) await clearLedger();
    await before?.(p);
    await p.getByLabel('Your question').fill(question);
    const button = p.getByRole('button', { name: 'Ask', exact: true });
    // The docked globe floats over the bottom of a phone viewport: bring the button to the middle before pressing it.
    await button.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await button.click();
    if (wait) {
      await p.waitForSelector('[data-testid=ask-answer], [role=alert]', { timeout: 20_000 });
      await p
        .locator('[data-testid=ask-answer], [role=alert]')
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
    }
  };

/** Pages that need `--fake-ai` carry `ai: true` in their expectations. */
const ASK_PAGES = [
  [
    'ask-signed-out',
    ASK_PAGE,
    false,
    async () => {},
    { ...FLAT, text: [/Sign in to ask a question/], absent: ['textarea'] },
  ],
  [
    'ask-idle',
    ASK_PAGE,
    true,
    async () => {},
    {
      ...FLAT,
      text: [/Your question/, /questions left today/, /RMH does not keep it/, /Try one/],
      present: ['textarea'],
    },
  ],
  [
    'ask-answered',
    ASK_PAGE,
    true,
    asking(SCRIPTS.answered, 'How many interviews has Duke reported this cycle?'),
    {
      ...FLAT,
      ai: true,
      text: [/Sources/, /reported interview events/, /Open on RMH/, /source refreshed|update time unknown/],
    },
  ],
  [
    'ask-partial',
    ASK_PAGE,
    true,
    asking(SCRIPTS.partial, 'How many interviews has Duke reported this cycle?'),
    { ...FLAT, ai: true, text: [/Some statements were removed because their figures could not be matched/] },
  ],
  [
    'ask-declined',
    ASK_PAGE,
    true,
    asking(SCRIPTS.declined, 'What are my chances of getting into Duke?'),
    { ...FLAT, ai: true, text: [/cannot estimate your chance of admission/] },
  ],
  [
    'ask-my-chance',
    ASK_PAGE,
    true,
    asking(SCRIPTS.mine, 'When will I hear from Duke?'),
    { ...FLAT, ai: true, text: [/Your estimate/, /chance of an interview invite|Not enough data yet|Add the date/] },
  ],
  [
    'ask-pending',
    ASK_PAGE,
    true,
    asking(SCRIPTS.slow, 'How many interviews has Duke reported this cycle?', { wait: false }),
    { ...FLAT, ai: true, text: [/Checking the data/, /Cancel/] },
  ],
  [
    'ask-cap-reached',
    ASK_PAGE,
    true,
    async (p) => {
      await p
        .getByLabel('Your question')
        .fill('How many interviews has Duke reported this cycle?')
        .catch(() => {});
    },
    {
      ...FLAT,
      ai: true,
      before: async () => {
        await clearLedger();
        await plantRows(25);
      },
      text: [/0 of 25 questions left today/],
    },
  ],
  [
    'ask-cap-refused',
    ASK_PAGE,
    true,
    async (p) => {
      // One question left on the page's own count, none by the time the request lands: the server's 429 is what shows.
      await plantRows(1);
      await asking(SCRIPTS.answered, 'How many interviews has Duke reported this cycle?', { clear: false })(p);
    },
    {
      ...FLAT,
      ai: true,
      before: async () => {
        await clearLedger();
        await plantRows(24);
      },
      text: [/used today's questions/, /00:00 UTC/],
    },
  ],
  [
    'school-ask-idle',
    DUKE,
    true,
    async (p) => {
      await p
        .getByLabel('Your question')
        .scrollIntoViewIfNeeded()
        .catch(() => {});
    },
    { ...FLAT, text: [/Ask about /, /questions left today/], present: ['textarea'] },
  ],
  [
    'school-ask-answered',
    DUKE,
    true,
    asking(SCRIPTS.answered, 'What are the MCAT and GPA medians?'),
    { ...FLAT, ai: true, text: [/Ask about /, /Sources/] },
  ],
];
PAGES.push(...ASK_PAGES);

/* ------------------------------ the tracker import view ------------------------------ */

/**
 * The import against the seeded tracker (needs `--fake-ai`): Duke already holds a submitted date (the same one is "already
 * there") and a complete date (a different one is a conflict), Harvard holds none, and one school is not in the directory.
 * The fake reads the pasted text back the way a grounded model would: every date is quoted from the text.
 */
const agoDay = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const monthDay = (n) =>
  new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const IMPORT_DATES = {
  sameDuke: agoDay(55),
  conflictDuke: agoDay(45),
  newDuke: agoDay(10),
  harvard: agoDay(50),
  noYear: monthDay(18),
};
const nameOf = async (slug) =>
  (await ai.pool.query('select name from med_school where slug = $1', [slug])).rows[0]?.name;
const importText = async () => {
  const [duke, harvard] = [await nameOf('duke'), await nameOf('harvard')];
  return {
    duke,
    harvard,
    text: [
      `${duke} | submitted | ${IMPORT_DATES.sameDuke} | complete | ${IMPORT_DATES.conflictDuke} | interview | ${IMPORT_DATES.newDuke}`,
      `${harvard} | submitted | ${IMPORT_DATES.harvard} | complete | ${IMPORT_DATES.noYear}`,
      `Nowhere Medical Academy | submitted | ${IMPORT_DATES.harvard}`,
    ].join('\n'),
  };
};
const importScript = (names) => (call) => {
  if (call.kind !== 'other') return { rows: [] };
  const m = (type, date) => ({ type, date, raw: date });
  return {
    rows: [
      {
        schoolName: names.duke,
        milestones: [
          m('SUBMITTED', IMPORT_DATES.sameDuke),
          m('COMPLETE', IMPORT_DATES.conflictDuke),
          m('INTERVIEW', IMPORT_DATES.newDuke),
        ],
      },
      {
        schoolName: names.harvard,
        milestones: [
          m('SUBMITTED', IMPORT_DATES.harvard),
          // The year is not written: the cycle rules choose it and the view flags it.
          { type: 'COMPLETE', date: `${new Date().getUTCFullYear()}-${agoDay(18).slice(5)}`, raw: IMPORT_DATES.noYear },
        ],
      },
      { schoolName: 'Nowhere Medical Academy', milestones: [m('SUBMITTED', IMPORT_DATES.harvard)] },
    ],
    cycleHint: null,
  };
};
/** Harvard has no dates in the seed: anything an earlier pass saved there is removed through the API, so every pass starts the same. */
const importMember = { cookies: null };
const resetImport = async () => {
  const headers = { origin: BASE, cookie: cookieHeader(importMember.cookies ?? []) };
  const tracker = await (await fetch(`${BASE}/api/medschools/me/tracker`, { headers })).json();
  const app = tracker.cycle?.applications?.find((a) => a.school.slug === 'harvard');
  for (const m of app?.milestones ?? [])
    await fetch(`${BASE}/api/medschools/me/tracker/applications/${app.id}/milestones/${m.type}`, {
      method: 'DELETE',
      headers,
    });
};
/** The day's count is the `medschools-qa-ask` rows; an import reserves one like a question does. */
const plantAsk = (n) =>
  ai.pool?.query(
    `insert into ai_usage ("userId", task, provider, model, "promptId", "promptVer", "inTokens", "outTokens", "costMicros", ok)
     select $1, 'medschools-qa', 'deepseek', 'fake', 'medschools-qa-ask', 1, 1, 1, 0, true from generate_series(1, $2)`,
    [ai.userId, n],
  );
const openImport = async (p) => {
  const open = p.getByRole('button', { name: 'Import from a file', exact: true });
  await open.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await open.click();
  await p.getByRole('button', { name: 'Read my dates' }).waitFor({ timeout: 15_000 });
};
const readImport = async (p) => {
  const names = await importText();
  ai.fake.setScript(importScript(names));
  await openImport(p);
  await p.getByLabel('Or paste the text').fill(names.text);
  const read = p.getByRole('button', { name: 'Read my dates' });
  await read.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await read.click();
  await p.getByRole('button', { name: 'Add to my tracker' }).waitFor({ timeout: 25_000 });
  return names;
};
const IMPORT_PAGES = [
  [
    'import-open',
    '/med/tracker',
    true,
    openImport,
    {
      ...FLAT,
      ai: true,
      before: async () => {
        await clearLedger();
        await resetImport();
      },
      text: [
        /Import from a file/,
        /sent to our AI provider/,
        /does not keep the file/,
        /Choose a file/,
        /Read my dates/,
      ],
      present: ['textarea'],
    },
  ],
  [
    'import-preview',
    '/med/tracker',
    true,
    readImport,
    {
      ...FLAT,
      ai: true,
      before: resetImport,
      text: [
        /Add to my tracker/,
        /Could not match this school/,
        /Already on your tracker with this date/,
        /Your tracker has .* Tick to replace it/,
        /The file had no year/,
        /dates for \d+ schools will be added/,
      ],
    },
  ],
  [
    'import-saved',
    '/med/tracker',
    true,
    async (p) => {
      const names = await readImport(p);
      // Leave Duke alone: only Harvard's dates are written, so the seeded tracker is what the next pass starts from.
      await p.getByLabel(`Include ${names.duke}`).uncheck();
      const add = p.getByRole('button', { name: 'Add to my tracker' });
      await add.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await add.click();
      await p.getByRole('button', { name: 'Back to my tracker' }).waitFor({ timeout: 15_000 });
    },
    { ...FLAT, ai: true, before: resetImport, text: [/Added \d+ dates and replaced 0/] },
  ],
  [
    'import-cap-refused',
    '/med/tracker',
    true,
    async (p) => {
      const names = await importText();
      ai.fake.setScript(importScript(names));
      await openImport(p);
      await p.getByLabel('Or paste the text').fill(names.text);
      // The day is spent by the time the request lands: the server's 429 is what shows.
      await plantAsk(25);
      const read = p.getByRole('button', { name: 'Read my dates' });
      await read.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await read.click();
      await p.waitForSelector('[role=alert]', { timeout: 20_000 });
    },
    { ...FLAT, ai: true, before: resetImport, text: [/used today's questions/] },
  ],
  [
    'import-unsupported',
    '/med/tracker',
    true,
    async (p) => {
      await openImport(p);
      await p
        .locator('input[type=file]')
        .setInputFiles({ name: 'tool.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
      await p.waitForSelector('[role=alert]', { timeout: 10_000 });
    },
    { ...FLAT, ai: true, before: resetImport, text: [/could not be read/] },
  ],
];
PAGES.push(...IMPORT_PAGES);

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
  // The essay overlap's list: schools with prompts (two cycles, not yet, none) so every state of the view shows.
  const overlap = await call('POST', '/api/medschools/me/list-items', {
    schoolSlug: 'harvard',
    newListName: 'Essay plan',
  });
  for (const slug of ['duke', 'michigan', 'johns-hopkins', 'stanford'])
    await call('POST', '/api/medschools/me/list-items', { schoolSlug: slug, listId: overlap.id });
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
  // A waiting application at Duke, where seed-visual.ts put 24 sharing members: the chance shows its estimate state. The
  // PhD one above sits at a school with no curve, so it shows the thin line.
  const waiting = await call('POST', '/api/medschools/me/tracker/applications', {
    cycleYear: cycle,
    schoolSlug: 'duke',
    program: 'REG',
  });
  if (waiting.id) {
    const ago = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    for (const [type, date] of [
      ['SUBMITTED', ago(55)],
      ['COMPLETE', ago(40)],
    ])
      await call('PUT', `/api/medschools/me/tracker/applications/${waiting.id}/milestones/${type}`, { date });
  }
  // Two more applications at schools with prompts, so the tracker's essay overlap has something to group.
  for (const slug of ['harvard', 'stanford'])
    await call('POST', '/api/medschools/me/tracker/applications', {
      cycleYear: cycle,
      schoolSlug: slug,
      program: 'REG',
    });
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
function measure({ touch, narrow, forecast, flat, absent, present }) {
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
          'main button:not([role=switch]), main select, main input, main [role=radio], main summary, aside button, aside input',
        ),
      ]
        .filter(visible)
        // A checkbox's target is the label that wraps it (the drawn box is 20px and the whole row presses it).
        .map((e) => [e, e.type === 'checkbox' ? (e.closest('label') ?? e) : e])
        .filter(([e, box]) => box.getBoundingClientRect().height < 44 && e.type !== 'hidden')
        .map(
          ([e, box]) =>
            `${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 28)}:${Math.round(box.getBoundingClientRect().height)}`,
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
  // The forecast chart draws no fill-opacity, gradient or filter (Steel R1): the range is two dotted boundaries.
  const translucent = forecast
    ? [...document.querySelectorAll('main svg *')].filter((e) => {
        const cs = getComputedStyle(e);
        return (
          /gradient/i.test(e.tagName) ||
          e.hasAttribute('fill-opacity') ||
          e.hasAttribute('filter') ||
          (cs.fillOpacity !== '1' && cs.fill !== 'none') ||
          (cs.filter && cs.filter !== 'none')
        );
      }).length
    : 0;
  // Steel R1: nothing in the page's content draws a shadow, gradient, filter or backdrop filter.
  const unflat = flat
    ? [...document.querySelectorAll('main *')]
        .filter((e) => {
          const cs = getComputedStyle(e);
          return (
            (cs.boxShadow && cs.boxShadow !== 'none') ||
            /gradient/i.test(cs.backgroundImage) ||
            (cs.filter && cs.filter !== 'none') ||
            (cs.backdropFilter && cs.backdropFilter !== 'none')
          );
        })
        .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}`)
    : [];
  const selectorsFound = (list) => (list ?? []).filter((sel) => document.querySelector(sel));
  const selectorsMissing = (list) => (list ?? []).filter((sel) => !document.querySelector(sel));
  const text = document.body.innerText;
  return {
    unflat,
    unexpected: selectorsFound(absent),
    missing: selectorsMissing(present),
    translucent,
    text,
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
  importMember.cookies = user.cookies;
  if (FAKE_AI) {
    const fakeUrl = pathToFileURL(join(ROOT, 'testing/integration/lib/fake-deepseek.ts')).href;
    const { startFakeDeepseek, userJson } = await import(fakeUrl);
    ai.userJson = userJson;
    ai.fake = await startFakeDeepseek(FAKE_PORT, SCRIPTS.answered);
    const url = process.env.DATABASE_URL;
    if (!(url && /scratch/.test(url) && /127\.0\.0\.1|localhost/.test(url)))
      throw new Error('--fake-ai needs DATABASE_URL on a local scratch database');
    const { default: pg } = await import('pg');
    ai.pool = new pg.Pool({ connectionString: url, max: 2 });
    ai.userId = (await ai.pool.query('select id from "user" where email = $1', [user.email])).rows[0]?.id;
    if (!ai.userId) throw new Error(`no user row for ${user.email}`);
    await clearLedger();
  }
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
    for (const [name, path, signedIn, act, expect = {}] of PAGES) {
      if (ONLY_PAGE && !name.includes(ONLY_PAGE)) continue;
      if (expect.ai && !FAKE_AI) continue;
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
            // Since the app redesign (phase A) the pages' light/dark is the app's own device key, not the edition.
            localStorage.setItem('rmh-medschool-mode', JSON.stringify({ dark: style === 'graphite' }));
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
        (e) => !/Realtime URL is not configured/.test(String(e)) && errors.push(String(e).slice(0, 700)),
      );
      try {
        // Every page starts with the member's day at zero, so the page's own count is what a member sees on a fresh day.
        await clearLedger();
        await expect.before?.();
        await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
        await act(page);
        await page.waitForTimeout(700);
        const r = await page.evaluate(measure, {
          touch,
          narrow: w < 1024,
          forecast: !!expect.forecast,
          flat: !!expect.flat,
          absent: expect.absent,
          present: expect.present,
        });
        const found = [];
        if (r.scrollWidth > r.clientWidth) found.push(`sideways scroll ${r.scrollWidth}>${r.clientWidth}`);
        // The mode that was asked for must be the one painted: Day is light and Night dark, now via `rmh-medschool-mode`
        // (`--app-bg` paper or ink-navy); `html` carries `data-app-dark` instead of a site edition class.
        if (mode === 'night' && !(r.bodyLum !== null && r.bodyLum < 0.1))
          found.push(`Night painted light (body luminance ${r.bodyLum}, html "${r.htmlClass}")`);
        if (mode === 'day' && !(r.bodyLum !== null && r.bodyLum > 0.8))
          found.push(`Day painted dark (body luminance ${r.bodyLum}, html "${r.htmlClass}")`);
        if (lang === 'ar' && r.dir !== 'rtl') found.push(`ar is not right to left (dir "${r.dir}")`);
        if (r.unflat.length) found.push(`not flat (R1): ${r.unflat.slice(0, 3).join(', ')}`);
        if (r.unexpected.length) found.push(`unexpected ${r.unexpected.join(', ')}`);
        if (r.missing.length) found.push(`missing ${r.missing.join(', ')}`);
        if (r.translucent) found.push(`${r.translucent} translucent or filtered chart element(s)`);
        // Copy is English; in `ar` only the structure is asserted.
        if (lang === 'en') {
          const plain = r.text.replace(/[\u2066-\u2069]/g, '');
          for (const re of expect.text ?? []) if (!re.test(plain)) found.push(`page lacks ${re}`);
          for (const re of expect.textAbsent ?? []) if (re.test(plain)) found.push(`page shows ${re}`);
        }
        // A cycle range keeps its years in order in every language: each cycle is a left-to-right isolate.
        if (expect.isolates && !/\u2066\d{4}\u2013\d{4}\u2069/.test(r.text))
          found.push('no isolated cycle label (years could reverse in a right-to-left page)');
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
        console.log(`FAIL ${label}  ${String(e).slice(0, 700)}`);
        problems.push(`${label}: ${String(e).slice(0, 700)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  if (ai.pool) {
    await clearLedger();
    await ai.pool.end();
  }
  await ai.fake?.close();
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nno problems');
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
