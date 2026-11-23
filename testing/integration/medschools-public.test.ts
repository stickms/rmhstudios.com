/**
 * RMH Med Schools public pages, black box (phase 3, plan Task 12 Step 3).
 *
 * Runs against a RUNNING app and writes its own data: `lib/medschools-fixture.ts` inserts one FIXTURE school (an RMH
 * count row with 2 contributors, an in-state stats row with 2 contributors, null-program events, several events sharing
 * one `occurredAt`) under a test-only slug in `beforeAll` and deletes it in `afterAll`. It needs no seed script, so it
 * passes against an empty migrated database and against one that already holds `scripts/medschools/seed-visual.ts`
 * data. Everything here is anonymous: no session, no cookie needed.
 *
 *   INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=… pnpm test:integration -- testing/integration/medschools-public.test.ts
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import {
  MEDSCHOOL_FIXTURE_SLUG,
  SECONDARIES_NOTYET_SLUG,
  SECONDARIES_TEXT,
  removeMedSchoolsFixture,
  removeSecondariesFixture,
  seedMedSchoolsFixture,
  seedSecondariesFixture,
} from './lib/medschools-fixture';

const anon = new Client();
const SLUG = MEDSCHOOL_FIXTURE_SLUG;
const INACTIVE_SLUG = 'it-medschools-fixture-inactive';

beforeAll(async () => {
  await seedMedSchoolsFixture();
  await seedSecondariesFixture();
  await db().query(
    `insert into med_school (id, slug, name, "shortName", degree, city, state, active, "updatedAt")
     values ($1, $1, 'Inactive Fixture', 'Inactive', 'MD', 'Durham', 'NC', false, now())`,
    [INACTIVE_SLUG],
  );
});
afterAll(async () => {
  await db().query('delete from med_school where id = $1', [INACTIVE_SLUG]);
  await removeSecondariesFixture();
  await removeMedSchoolsFixture();
  await closeDb();
});

/** The pinned public key sets: a new key on any of these is a privacy review, not a drive-by. */
const LIVE_EVENT_KEYS = ['eventType', 'id', 'occurredAt', 'program', 'school', 'source', 'wave'];
const LIVE_SCHOOL_KEYS = ['city', 'degree', 'name', 'shortName', 'slug', 'state'];
/** Fields that identify a post or a person, or are internal. None may appear in any page or response. */
const FORBIDDEN = ['dedupeHash', 'cursorPostHash', 'ingestedAt', 'fixture-q-', 'fixture-event-', '"contributors"'];

describe('RMH Med Schools, public and anonymous', () => {
  it('serves a school without a session', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body.school.slug).toBe(SLUG);
    expect(anon.hasSession).toBe(false);
    expect(res.headers.get('cache-control')).toMatch(/public/);
  });

  it('keeps the below-floor figures out of the school response', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}`);
    const text = JSON.stringify(res.body);
    // The seeded IN_STATE stats row rests on 2 contributors.
    expect(res.body.stats.every((s: { residence: string }) => s.residence === 'GLOBAL')).toBe(true);
    for (const f of FORBIDDEN) expect(text).not.toContain(f);
    // The seeded interview split is 5 and 2: one side is under 3, so it is not shown.
    for (const p of res.body.profiles) expect(p.split).toBeNull();
  });

  it('names no RMH series and carries no contributors key in the activity response', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}/activity`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('RMH');
    expect(text).not.toContain('contributors');
    expect(res.body.types).toHaveLength(5);
    // The seeded RMH row (99 interview invites, 2 contributors) must not reach any total.
    expect(text).not.toContain('"count":99');
  });

  it('serves a live feed with the pinned keys and no mislabelled null program', async () => {
    const res = await anon.get('/api/medschools/live?limit=100');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['asOf', 'events', 'nextCursor']);
    expect(res.body.events.length).toBeGreaterThan(0);
    let nullPrograms = 0;
    for (const e of res.body.events) {
      expect(Object.keys(e).sort()).toEqual(LIVE_EVENT_KEYS);
      expect(Object.keys(e.school).sort()).toEqual(LIVE_SCHOOL_KEYS);
      expect(['ADMIT', 'SDN']).toContain(e.source);
      expect([null, 'REG', 'PHD']).toContain(e.program);
      expect(e.occurredAt).toMatch(/T\d\d:\d\d:00\.000Z$/);
      if (e.program === null) nullPrograms += 1;
    }
    expect(nullPrograms).toBeGreaterThan(0);
    // Filtering to REG never returns a null-program row, and NONE returns only those.
    const reg = await anon.get('/api/medschools/live?program=REG&limit=100');
    expect(reg.body.events.every((e: { program: string | null }) => e.program === 'REG')).toBe(true);
    const none = await anon.get('/api/medschools/live?program=NONE&limit=100');
    expect(none.body.events.length).toBeGreaterThan(0);
    expect(none.body.events.every((e: { program: string | null }) => e.program === null)).toBe(true);
    for (const f of FORBIDDEN) expect(JSON.stringify(res.body)).not.toContain(f);
  });

  it('filters the live feed and the index by the program set (programs=md,do-phd)', async () => {
    const live = async (programs: string) =>
      (await anon.get(`/api/medschools/live?school=${SLUG}&programs=${programs}&limit=100`)).body.events as Array<{
        program: string | null;
      }>;
    // The fixture is an MD school: MD is REG, MD-PhD is PHD, and a DO-only set matches none of its events.
    const md = await live('md');
    expect(md.length).toBeGreaterThan(0);
    expect(md.every((e) => e.program === 'REG')).toBe(true);
    const phd = await live('md-phd');
    expect(phd.length).toBeGreaterThan(0);
    expect(phd.every((e) => e.program === 'PHD')).toBe(true);
    expect(await live('do')).toEqual([]);
    // All four on is no filter at all, and the only set that includes events with no program reported.
    const all = await live('md,md-phd,do,do-phd');
    expect(all.some((e) => e.program === null)).toBe(true);

    const only = async (programs: string) =>
      (await anon.get(`/api/medschools/schools?programs=${programs}`)).body.schools as Array<{ degree: string }>;
    expect((await only('do')).every((s) => s.degree === 'DO')).toBe(true);
    expect((await only('md,md-phd')).every((s) => s.degree === 'MD')).toBe(true);
    for (const bad of ['programs=md,xx', 'programs=md,md,md,md,md', 'programs=']) {
      const res = await anon.get(`/api/medschools/schools?${bad}`);
      expect(res.status, bad).toBeLessThan(500);
    }
  });

  it('answers hostile input with a 4xx or an empty list, never a 500', async () => {
    for (const path of [
      '/api/medschools/schools/NOPE%00',
      '/api/medschools/schools/does-not-exist',
      '/api/medschools/live?limit=-1',
      '/api/medschools/live?degree=PhD',
      `/api/medschools/schools?state=ZZ`,
      `/api/medschools/schools?q=${encodeURIComponent('(.*+?[')}`,
    ]) {
      const res = await anon.get(path);
      expect(res.status, path).toBeLessThan(500);
    }
  });

  it('server-renders the school page with charts, the unit and the source, and nothing identifying', async () => {
    const res = await anon.get(`/rmh-medschool/${SLUG}`);
    expect(res.status).toBe(200);
    const html = String(res.body);
    expect(html).toContain('<svg');
    expect(html).toContain('Reported events');
    expect(html).toContain('Source:');
    for (const f of FORBIDDEN) expect(html, f).not.toContain(f);
    expect(html).not.toContain('"count":99');
  });

  it('serves the index and the live page as HTML', async () => {
    for (const path of ['/rmh-medschool', '/rmh-medschool/live']) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(200);
      expect(String(res.body)).toContain('<html');
      // The "interview invites reported today" block was removed; the live page and the rail carry that now.
      expect(String(res.body), path).not.toMatch(/invites reported today/i);
    }
  });

  it('answers an unknown school with a 404 page', async () => {
    for (const slug of ['does-not-exist', 'Harvard', 'a'.repeat(300)]) {
      const res = await anon.get(`/rmh-medschool/${slug}`);
      expect(res.status, slug).toBe(404);
    }
  });

  it('lists the school pages in the sitemap', async () => {
    const index = await anon.get('/sitemap.xml');
    expect(index.status).toBe(200);
    expect(String(index.body)).toContain('/sitemaps/medschools.xml');
    const chunk = await anon.get('/sitemaps/medschools.xml');
    expect(chunk.status).toBe(200);
    const xml = String(chunk.body);
    expect(xml).toContain(`/rmh-medschool/${SLUG}`);
  });
});

/* ---------------------------- phase 5: waves and the forecast ---------------------------- */

const FORECAST_KEYS = [
  'asOf',
  'band',
  'basis',
  'cycleYear',
  'dayZeroEstimated',
  'dayZeroOn',
  'endOn',
  'eventType',
  'observed',
  'program',
  'source',
  'status',
  'summary',
];
const forecastUrl = (slug = SLUG, query = '') => `/api/medschools/schools/${slug}/forecast${query}`;

/** Run the daily forecast job's function directly (a manual run: no minimum interval), as the `jobs` worker would. */
async function runForecastJob() {
  const [{ prisma }, { runForecast }] = await Promise.all([
    import('../../lib/prisma.server'),
    import('../../features/medschools/scrape/run-forecast'),
  ]);
  const log = { info: () => {}, warn: () => {}, error: (m: string) => console.error(m) };
  const summary = await runForecast({ prisma: prisma as never, db: prisma, log }, { trigger: 'MANUAL' });
  expect(summary?.status).toBe('OK');
  return summary;
}

describe('waves on the Activity response and the live feed', () => {
  it('marks the spike days on the Activity response with the pinned keys', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}/activity`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toContain('waves');
    expect(res.body.waves.length).toBeGreaterThanOrEqual(2);
    for (const w of res.body.waves) {
      expect(Object.keys(w).sort()).toEqual(['baseline', 'count', 'date']);
      expect(w.count).toBeGreaterThan(3 * w.baseline);
      expect(w.count).toBeGreaterThanOrEqual(5);
    }
    expect(res.body.waves.map((w: { count: number }) => w.count)).toContain(30);
  });

  it('marks a live invite of a wave day and not one of a quiet day', async () => {
    const res = await anon.get(`/api/medschools/live?school=${SLUG}&limit=100`);
    expect(res.status).toBe(200);
    const invites = res.body.events.filter((e: { eventType: string }) => e.eventType === 'INTERVIEW');
    expect(invites.length).toBeGreaterThan(0);
    for (const e of res.body.events) expect(typeof e.wave).toBe('boolean');
    // Yesterday (a wave) carries one fixture invite; today's two are on a day that is not a wave.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const on = (d: string) => invites.filter((e: { occurredAt: string }) => e.occurredAt.slice(0, 10) === d);
    expect(on(yesterday).length).toBeGreaterThan(0);
    expect(on(yesterday).every((e: { wave: boolean }) => e.wave)).toBe(true);
    expect(on(today).every((e: { wave: boolean }) => !e.wave)).toBe(true);
    // Only an invite can be part of a wave.
    expect(
      res.body.events.filter((e: { eventType: string; wave: boolean }) => e.eventType !== 'INTERVIEW' && e.wave),
    ).toEqual([]);
  });
});

describe('the public forecast', () => {
  it('is pending, with the observed line only, before the job has run', async () => {
    const res = await anon.get(forecastUrl());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(FORECAST_KEYS);
    expect(res.body.status).toBe('pending');
    expect(res.body.band).toEqual([]);
    expect(res.body.summary).toBeNull();
    expect(res.body.observed.length).toBeGreaterThan(0);
  });

  it('is ready after the job, with the band starting at the last observed value', async () => {
    await runForecastJob();
    const res = await anon.get(forecastUrl(SLUG, `?cb=${Date.now()}`));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(FORECAST_KEYS);
    expect(res.body.status).toBe('ready');
    expect(res.body.program).toBe('REG');
    expect(res.body.eventType).toBe('INTERVIEW');
    expect(res.body.source).toBe('CYCLETRACK');
    const last = res.body.observed[res.body.observed.length - 1];
    const first = res.body.band[0];
    expect(first.p50).toBe(last.cumulative);
    expect(first.p10).toBeLessThanOrEqual(first.p50);
    expect(first.p90).toBeGreaterThanOrEqual(first.p50);
    // The band widens and never runs backwards.
    for (let i = 1; i < res.body.band.length; i += 1) {
      expect(res.body.band[i].p50).toBeGreaterThanOrEqual(res.body.band[i - 1].p50);
      expect(res.body.band[i].p10).toBeLessThanOrEqual(res.body.band[i].p50);
      expect(res.body.band[i].p90).toBeGreaterThanOrEqual(res.body.band[i].p50);
    }
    expect(Object.keys(res.body.summary).sort()).toEqual(['halfOn', 'total']);
    expect(res.headers.get('cache-control')).toMatch(/public/);
  });

  it('carries no person, no hash and no RMH figure while the RMH cells sit below the floor', async () => {
    const res = await anon.get(forecastUrl(SLUG, `?cb=${Date.now()}`));
    const text = JSON.stringify(res.body);
    for (const f of [...FORBIDDEN, 'contributors', 'publishedCount', 'userId', 'dedupeHash', 'RMH', '"count":99'])
      expect(text, f).not.toContain(f);
    expect(res.body.source).not.toBe('RMH');
  });

  it('is byte-identical with and without a session (it never depends on the viewer)', async () => {
    const member = new Client(inject('alice').cookies);
    const url = forecastUrl(SLUG, '?cb=viewer');
    const without = await anon.get(url);
    const withSession = await member.get(url);
    expect(withSession.status).toBe(200);
    expect(JSON.stringify(withSession.body)).toBe(JSON.stringify(without.body));
    expect(withSession.headers.get('cache-control')).toMatch(/public/);
  });

  it('reads PHD and a category with no reports as an empty answer, never an error', async () => {
    const phd = await anon.get(forecastUrl(SLUG, '?program=PHD&type=ACCEPTANCE'));
    expect(phd.status).toBe(200);
    expect(phd.body.program).toBe('PHD');
    expect(['no-data', 'no-history', 'pending']).toContain(phd.body.status);
    expect(phd.body.band).toEqual([]);
    // ALL is not a forecast of its own: the regular program answers.
    const all = await anon.get(forecastUrl(SLUG, '?program=ALL'));
    expect(all.body.program).toBe('REG');
  });

  it('answers an unknown and an inactive school with a 404 and a bad parameter with a 4xx', async () => {
    expect((await anon.get(forecastUrl('does-not-exist'))).status).toBe(404);
    expect((await anon.get(forecastUrl(INACTIVE_SLUG))).status).toBe(404);
    expect((await anon.get(forecastUrl(SLUG, '?type=NONSENSE'))).status).toBeLessThan(500);
  });

  it('server-renders the Forecast tab with the chart and its legend, no script needed', async () => {
    const res = await anon.get(`/rmh-medschool/${SLUG}?tab=forecast`);
    expect(res.status).toBe(200);
    const html = String(res.body);
    expect(html).toContain('<svg');
    expect(html).toContain('Median forecast');
    expect(html).toContain('10th to 90th percentile');
    for (const f of FORBIDDEN) expect(html, f).not.toContain(f);
  });
});

/* --------------------------- secondaries: the public tab and its endpoint --------------------------- */

const SECONDARIES_KEYS = ['admissions', 'cycleYear', 'groups', 'sources', 'turnaround'];
const GROUP_KEYS = ['comparedWith', 'program', 'prompts', 'shownCycle', 'state'];
const PROMPT_KEYS = [
  'cycles',
  'id',
  'lastCheckedAt',
  'limit',
  'optional',
  'previousText',
  'sources',
  'status',
  'text',
  'themes',
];
const secondariesUrl = (slug = SLUG, query = '') => `/api/medschools/schools/${slug}/secondaries${query}`;
const CURRENT = (() => {
  const now = new Date();
  return now.getUTCMonth() < 5 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
})();

describe('the public secondaries endpoint', () => {
  it('has the pinned key sets and a public cache', async () => {
    const res = await anon.get(secondariesUrl());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(SECONDARIES_KEYS);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
    for (const g of res.body.groups) {
      expect(Object.keys(g).sort()).toEqual(GROUP_KEYS);
      for (const p of g.prompts) expect(Object.keys(p).sort()).toEqual(PROMPT_KEYS);
    }
    const text = JSON.stringify(res.body);
    for (const f of ['themesVersion', 'userId', 'dedupeHash', '"key"', 'contributors', 'draft'])
      expect(text).not.toContain(f);
  });

  it('shows the same, reworded, new and not-seen marks and integer cycles, REG before PHD', async () => {
    const res = await anon.get(secondariesUrl());
    expect(res.body.cycleYear).toBe(CURRENT);
    expect(res.body.groups.map((g: { program: string }) => g.program)).toEqual(['REG', 'PHD']);
    const reg = res.body.groups[0];
    expect(reg).toMatchObject({ state: 'current', shownCycle: CURRENT, comparedWith: CURRENT - 1 });
    const mark = (text: string) => reg.prompts.find((p: { text: string }) => p.text === text);
    expect(mark(SECONDARIES_TEXT.same)).toMatchObject({ status: 'same', cycles: [CURRENT - 1, CURRENT] });
    expect(mark(SECONDARIES_TEXT.reworded)).toMatchObject({
      status: 'reworded',
      previousText: SECONDARIES_TEXT.previous,
    });
    expect(mark(SECONDARIES_TEXT.added)).toMatchObject({ status: 'new', cycles: [CURRENT] });
    expect(mark(SECONDARIES_TEXT.gone)).toMatchObject({ status: 'gone', cycles: [CURRENT - 2, CURRENT - 1] });
    expect(mark(SECONDARIES_TEXT.optional)).toMatchObject({ optional: true, limit: { kind: 'CHARS', value: 1500 } });
    // Two sources seeing one prompt in one cycle is one cycle, not two.
    expect(mark(SECONDARIES_TEXT.same).sources).toEqual(['ADMIT', 'SDN']);
    for (const g of res.body.groups)
      for (const p of g.prompts) for (const y of p.cycles) expect(Number.isInteger(y)).toBe(true);
    expect(res.body.groups[1].prompts[0]).toMatchObject({
      text: SECONDARIES_TEXT.phd,
      limit: { kind: 'WORDS', value: 500 },
    });
  });

  it("carries the school's own admissions statement and its source lines", async () => {
    const res = await anon.get(secondariesUrl());
    expect(res.body.admissions).toEqual([
      {
        program: 'REG',
        rolling: true,
        evidence: 'Decisions are made on a rolling basis.',
        url: 'https://med.fixture.example.edu/admissions',
        checkedOn: '2026-11-23',
      },
    ]);
    // SDN has an observation of one prompt (a forum sighting) but no recorded page read: it is named, with no link.
    expect(res.body.sources.map((s: { source: string }) => s.source)).toEqual(['SCHOOL', 'ADMIT', 'SDN']);
    expect(res.body.sources[2].url).toBeNull();
    expect(res.body.sources[0].url).toBe('https://med.fixture.example.edu/secondary');
  });

  it('before this cycle has prompts it shows last cycle as not-yet with every mark last-cycle', async () => {
    const res = await anon.get(secondariesUrl(SECONDARIES_NOTYET_SLUG));
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0]).toMatchObject({ state: 'not-yet', shownCycle: CURRENT - 1 });
    expect(res.body.groups[0].prompts.map((p: { status: string }) => p.status)).toEqual(['last-cycle']);
  });

  it('filters by program and answers a school with none as empty groups', async () => {
    const phd = await anon.get(secondariesUrl(SLUG, '?program=PHD'));
    expect(phd.body.groups.map((g: { program: string }) => g.program)).toEqual(['PHD']);
    expect((await anon.get(secondariesUrl(SLUG, '?program=BOGUS'))).status).toBe(400);
  });

  it('is byte-identical with and without a session', async () => {
    const member = new Client(inject('alice').cookies);
    const without = await anon.get(secondariesUrl(SLUG, '?cb=viewer'));
    const withSession = await member.get(secondariesUrl(SLUG, '?cb=viewer'));
    expect(JSON.stringify(withSession.body)).toBe(JSON.stringify(without.body));
    expect(withSession.headers.get('cache-control')).toMatch(/public/);
  });

  it('answers an unknown and an inactive school with a 404', async () => {
    expect((await anon.get(secondariesUrl('does-not-exist'))).status).toBe(404);
    expect((await anon.get(secondariesUrl(INACTIVE_SLUG))).status).toBe(404);
  });

  it('server-renders the tab with a prompt and its source line, no script needed, and no text field', async () => {
    const res = await anon.get(`/rmh-medschool/${SLUG}?tab=secondaries`);
    expect(res.status).toBe(200);
    const html = String(res.body);
    expect(html).toContain(SECONDARIES_TEXT.same);
    expect(html).toContain('Source: Admit.org');
    expect(html).toContain('Rolling admissions');
    expect(html).not.toMatch(/<(input|textarea)\b/);
  });

  it('is written by an admin only, and what an admin writes shows in the public response', async () => {
    const alice = new Client(inject('alice').cookies);
    const aliceId = inject('alice').id;
    const body = {
      schoolId: 'it-medschools-fixture-school',
      program: 'REG',
      cycleYear: CURRENT,
      sourceUrl: 'https://med.fixture.example.edu/corrected',
      prompts: [{ text: 'Describe a time you changed your mind.', limitKind: 'WORDS', limitValue: 400 }],
    };
    expect((await anon.request('POST', '/api/admin/medschools/secondaries', { json: body })).status).toBe(401);
    expect((await alice.request('POST', '/api/admin/medschools/secondaries', { json: body })).status).toBe(403);
    await db().query(`update "user" set "isAdmin" = true where id = $1`, [aliceId]);
    try {
      const ok = await alice.request('POST', '/api/admin/medschools/secondaries', { json: body });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body).toEqual({ prompts: 1, created: 1, rejected: 0 });
      const bad = await alice.request('POST', '/api/admin/medschools/secondaries', {
        json: { ...body, sourceUrl: 'javascript:alert(1)' },
      });
      expect(bad.status).toBe(400);
    } finally {
      await db().query(`update "user" set "isAdmin" = false where id = $1`, [aliceId]);
    }
    const res = await anon.get(secondariesUrl(SLUG, '?cb=admin'));
    const texts = res.body.groups.flatMap((g: { prompts: { text: string }[] }) => g.prompts.map((p) => p.text));
    expect(texts).toContain('Describe a time you changed your mind.');
  });
});
