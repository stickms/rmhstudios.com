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
import { BASE_URL, Client, closeDb, db, freshPath } from './lib/client';
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

/**
 * The AAMC MSAR facts and one Admit.org curriculum fact of the fixture school. Seeded before any request: the school
 * page's loader prefetches the facts URL, and the public response micro-cache would otherwise keep an empty list for
 * that URL for 30 s.
 */
async function seedSchoolFacts(): Promise<void> {
  const q = (sql: string, params: unknown[]) => db().query(sql, params);
  const school = await q('select id from med_school where slug = $1', [SLUG]);
  const schoolId = (school.rows[0] as { id: string }).id;
  await q(
    `insert into med_school_fact (id, "schoolId", program, "cycleYear", kind, "valueText", note, source, "sourceUrl", "sourceLabel", "reportId", page, "checkedOn")
     values ('it-fact-1', $1, 'REG', 2027, 'ACCEPTS_OUT_OF_STATE', 'YES', 'Fixture note.', 'AAMC_MSAR_REPORT',
             'https://students-residents.aamc.org/media/6996/download?attachment',
             'AAMC MSAR Report for Applicants and Advisors, 2027 entering class, Applications Accepted Information', 6996, 2, '2026-11-24')
     on conflict do nothing`,
    [schoolId],
  );
  await q(
    `insert into med_school_fact (id, "schoolId", program, "cycleYear", kind, "valueNum", "valueText", "valueJson", source, "sourceUrl", "sourceLabel", "reportId", page, "checkedOn")
     values ('it-fact-2', $1, 'REG', 2027, 'COA_IN_STATE', 69123, null, null, 'AAMC_MSAR_REPORT',
             'https://students-residents.aamc.org/media/7071/download?attachment',
             'AAMC MSAR Report for Applicants and Advisors, 2027 entering class, Tuition, Fees and Insurance Information', 7071, 2, '2026-11-24')
     on conflict do nothing`,
    [schoolId],
  );
  await q(
    `insert into med_school_fact (id, "schoolId", program, "cycleYear", kind, "valueText", "valueJson", source, "sourceUrl", "sourceLabel", "reportId", page, "checkedOn")
     values ('it-fact-3', $1, 'REG', 0, 'CURRICULUM_CLERKSHIP_GRADING', 'H_HP_P_F', '{"text":"H/HP/P/F"}'::jsonb, 'ADMIT',
             'https://admit.org', 'Admit.org', null, null, '2026-11-24')
     on conflict do nothing`,
    [schoolId],
  );
  // The MD-PhD rows (program PHD, cycle 0): the fixture school has a program, a verified 2-4-2 timeline and an MSTP
  // grant; the secondaries "not yet" school's page says it has no combined program.
  const phd = (
    id: string,
    school: string,
    kind: string,
    source: string,
    valueText: string,
    valueNum: number | null,
    valueJson: unknown,
    note: string | null,
    sourceUrl: string,
  ) =>
    q(
      `insert into med_school_fact (id, "schoolId", program, "cycleYear", kind, "valueText", "valueNum", "valueJson", note, source, "sourceUrl", "sourceLabel", "checkedOn")
       values ($1, $2, 'PHD', 0, $3, $4, $5, $6::jsonb, $7, $8, $9, 'fixture', '2026-11-24')
       on conflict do nothing`,
      [id, school, kind, valueText, valueNum, JSON.stringify(valueJson), note, source, sourceUrl],
    );
  await phd(
    'it-mdphd-1',
    schoolId,
    'MDPHD_PROGRAM',
    'SCHOOL_PAGE',
    'YES',
    null,
    { name: 'Fixture MSTP' },
    null,
    MDPHD_PAGE,
  );
  await phd(
    'it-mdphd-2',
    schoolId,
    'MDPHD_TIMELINE',
    'SCHOOL_PAGE',
    '2-4-2',
    8,
    {
      phases: [
        { phase: 'preclinical', years: 2, label: 'Years 1-2' },
        { phase: 'research', years: 4, label: 'Years 3-6' },
        { phase: 'clinical', years: 2, label: 'Years 7-8' },
      ],
    },
    MDPHD_EVIDENCE,
    MDPHD_PAGE,
  );
  await phd(
    'it-mdphd-3',
    schoolId,
    'MSTP_T32',
    'NIH_REPORTER',
    'LISTED',
    2026,
    { grant: 'T32GM000001', projectNum: '5T32GM000001-02', applId: 1, organization: 'FIXTURE' },
    null,
    'https://reporter.nih.gov/project-details/1',
  );
  const none = await q('select id from med_school where slug = $1', [SECONDARIES_NOTYET_SLUG]);
  const noneId = (none.rows[0] as { id: string }).id;
  await phd(
    'it-mdphd-4',
    noneId,
    'MDPHD_PROGRAM',
    'SCHOOL_PAGE',
    'NO',
    null,
    { name: null },
    null,
    'https://fixture.edu/md',
  );
  // A stray timeline on the "no program" school must never be served.
  await phd(
    'it-mdphd-5',
    noneId,
    'MDPHD_TIMELINE',
    'SCHOOL_PAGE',
    '2-4-2',
    8,
    { phases: [] },
    MDPHD_EVIDENCE,
    MDPHD_PAGE,
  );
  // The school's own class profile (source SCHOOL_PROFILE): two classes, a repeated OTHER, an MD-PhD-only figure.
  const profile = (
    id: string,
    program: string,
    cycleYear: number,
    kind: string,
    text: string,
    num: number | null,
    json: object,
  ) =>
    q(
      `insert into med_school_fact (id, "schoolId", program, "cycleYear", kind, "valueText", "valueNum", "valueJson", note, source, "sourceUrl", "sourceLabel", "checkedOn")
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'SCHOOL_PROFILE', $10, 'School class profile', '2026-11-24')
       on conflict do nothing`,
      [
        id,
        schoolId,
        program,
        cycleYear,
        kind,
        text,
        num,
        JSON.stringify({ text, qualifier: null, url: PROFILE_PAGE, unit: null, ...json }),
        (json as { evidence: string }).evidence,
        PROFILE_PAGE,
      ],
    );
  await profile('it-profile-1', 'REG', 2026, 'PROFILE_MCAT_MEDIAN', '517', 517, {
    label: 'Class of 2030',
    evidence: 'Median MCAT 517',
    order: 0,
  });
  await profile('it-profile-2', 'REG', 2026, 'PROFILE_APPLICANTS', '7,412', 7412, {
    label: 'Class of 2030',
    evidence: 'Applicants 7,412',
    order: 1,
  });
  await profile('it-profile-3', 'REG', 2026, 'PROFILE_OTHER', '22%', null, {
    label: 'Class of 2030',
    qualifier: 'first-generation college students',
    evidence: 'First generation 22%',
    order: 2,
  });
  await profile('it-profile-4', 'REG', 2026, 'PROFILE_OTHER#2', '31%', null, {
    label: 'Class of 2030',
    qualifier: 'rural',
    evidence: 'Rural 31%',
    order: 3,
  });
  await profile('it-profile-5', 'PHD', 2026, 'PROFILE_APPLICANTS', '562', 562, {
    label: 'Class of 2030',
    qualifier: 'MD-PhD (MSTP)',
    evidence: 'MSTP applicants 562',
    order: 4,
  });
  await profile('it-profile-6', 'REG', 2025, 'PROFILE_MCAT_MEDIAN', '516', 516, {
    label: 'Class of 2029',
    evidence: 'Median MCAT 516',
    order: 0,
  });
}
const PROFILE_PAGE = 'https://fixture.edu/class-profile';
const MDPHD_PAGE = 'https://fixture.edu/md-phd';
const MDPHD_EVIDENCE = 'Years 1-2: preclinical; Years 3-6: PhD training; Years 7-8: clinical clerkships.';

/**
 * An RMH event of the fixture school, later than every public one: the index's "newest status" must never show it (an
 * RMH event is never public one by one). Seeded before any request, so the response micro-cache cannot hold a list
 * read before it existed.
 */
async function seedRmhLatest(): Promise<void> {
  await db().query(
    `insert into med_cycle_event (id, "schoolId", "cycleYear", program, "eventType", "occurredAt", source, "dedupeHash")
     select 'it-medschools-rmh-latest', e."schoolId", e."cycleYear", 'REG', 'WAITLIST',
            date_trunc('day', now()) + interval '23 hours', 'RMH', 'fixture-event-it-rmh-latest'
     from med_cycle_event e join med_school s on s.id = e."schoolId"
     where s.slug = $1 and e.source = 'ADMIT'
     limit 1
     on conflict do nothing`,
    [SLUG],
  );
}

beforeAll(async () => {
  await seedMedSchoolsFixture();
  await seedSecondariesFixture();
  await seedSchoolFacts();
  await seedRmhLatest();
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
const LIVE_SUMMARY_KEYS = ['active', 'asOf', 'counts', 'since', 'waves'];
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

  it('opens the live signal stream anonymously: an uncacheable event stream that starts with its retry hint', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${BASE_URL}/api/medschools/live/stream`, {
      headers: { accept: 'text/event-stream' },
      signal: ctrl.signal,
    });
    try {
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
      expect(res.headers.get('cache-control')).toBe('no-store, no-transform');
      expect(res.headers.get('x-accel-buffering')).toBe('no');
      expect(res.headers.get('set-cookie')).toBeNull();
      const first = await res.body!.getReader().read();
      expect(new TextDecoder().decode(first.value)).toContain('retry: 15000');
    } finally {
      ctrl.abort();
    }
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

  it("serves the live page's Today summary: pinned keys, Admit and SDN events of the last 24 hours, never RMH", async () => {
    const res = await anon.get('/api/medschools/live/summary');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/public/);
    expect(Object.keys(res.body).sort()).toEqual(LIVE_SUMMARY_KEYS);
    expect(Date.parse(res.body.asOf) - Date.parse(res.body.since)).toBe(24 * 3_600_000);
    for (const c of res.body.counts) {
      expect(Object.keys(c).sort()).toEqual(['count', 'eventType']);
      expect(c.count).toBeGreaterThan(0);
    }
    for (const list of [res.body.waves, res.body.active]) {
      for (const r of list) {
        expect(Object.keys(r).sort()).toEqual(['count', 'school']);
        expect(Object.keys(r.school).sort()).toEqual(LIVE_SCHOOL_KEYS);
      }
    }
    expect(res.body.active.length).toBeLessThanOrEqual(5);
    expect(res.body.active.map((a: { school: { slug: string } }) => a.school.slug)).not.toContain(INACTIVE_SLUG);
    // The fixture school's count is exactly its Admit and SDN events in the window: the RMH event is never counted.
    const mine = res.body.active.find((a: { school: { slug: string } }) => a.school.slug === SLUG);
    if (mine) {
      const expected = await db().query(
        `select count(*)::int as n from med_cycle_event e join med_school s on s.id = e."schoolId"
         where s.slug = $1 and e.source in ('ADMIT', 'SDN') and e."occurredAt" >= $2 and e."occurredAt" <= $3`,
        [SLUG, new Date(res.body.since), new Date(res.body.asOf)],
      );
      expect(mine.count).toBe((expected.rows[0] as { n: number }).n);
    }
    const text = JSON.stringify(res.body);
    for (const f of FORBIDDEN) expect(text).not.toContain(f);
    expect(text).not.toContain('RMH');
    // The same filters as the live feed; a bad one is a 400.
    expect((await anon.get('/api/medschools/live/summary?programs=md,do-phd&state=NC')).status).toBe(200);
    expect((await anon.get('/api/medschools/live/summary?state=ZZ')).status).toBe(400);
    expect((await anon.get('/api/medschools/live/summary?programs=phd')).status).toBe(400);
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

  it("lists each school's newest public status: pinned keys, the live feed's sources only, the list's programs", async () => {
    type Row = { slug: string; latest: { eventType: string; occurredAt: string; dayOnly: boolean } | null };
    const row = async (query = '') =>
      ((await anon.get(freshPath(`/api/medschools/schools${query}`))).body.schools as Row[]).find((r) => r.slug === SLUG)!;
    const all = await row();
    expect(Object.keys(all.latest!).sort()).toEqual(['dayOnly', 'eventType', 'occurredAt']);
    // The newest is the RMH waitlist at 23:00 today, which is never public: the newest public one is today's 01:00
    // Admit acceptance (PHD), one of three tied at that minute.
    expect(all.latest!.eventType).not.toBe('WAITLIST');
    expect(all.latest!.eventType).toBe('ACCEPTANCE');
    expect(all.latest!.occurredAt).toMatch(/T01:00:00\.000Z$/);
    expect(all.latest!.dayOnly).toBe(false);
    // MD only (REG): the PHD acceptance is out, an MD interview is the newest.
    expect((await row('?programs=md')).latest!.eventType).toBe('INTERVIEW');
  });

  it('follows the public source= choice (owner 2026-11-24): one source, never a sum, unchanged keys, junk is a 400', async () => {
    type Row = { slug: string; reported: { source: string; count: number } | null };
    const list = async (query = '') => (await anon.get(freshPath(`/api/medschools/schools${query}`))).body.schools as Row[];
    const mine = (rows: Row[]) => rows.find((r) => r.slug === SLUG)!;
    const plain = await list();
    // CycleTrack is first in the primary order; Admit.org's own interview sum (3 + 5) when asked for.
    expect(mine(plain).reported!.source).toBe('CYCLETRACK');
    expect(mine(await list('?source=admit')).reported).toEqual({ source: 'ADMIT', count: 8 });
    expect(mine(await list('?source=cycletrack')).reported).toEqual(mine(plain).reported);
    expect(Object.keys(mine(await list('?source=admit'))).sort()).toEqual(Object.keys(mine(plain)).sort());

    const activity = async (query = '') => (await anon.get(`/api/medschools/schools/${SLUG}/activity${query}`)).body;
    type Ty = { eventType: string; primary: string | null; sources: unknown[] };
    const a0 = await activity();
    const a1 = await activity('?source=admit');
    expect(Object.keys(a1).sort()).toEqual(Object.keys(a0).sort());
    const type = (body: { types: Ty[] }, t: string) => body.types.find((x) => x.eventType === t)!;
    expect(type(a0, 'INTERVIEW').primary).toBe('CYCLETRACK');
    expect(type(a1, 'INTERVIEW').primary).toBe('ADMIT');
    expect(type(a1, 'INTERVIEW').sources).toEqual(type(a0, 'INTERVIEW').sources);
    // Admit has no acceptance here: the other source stays primary.
    expect(type(a1, 'ACCEPTANCE').primary).toBe('CYCLETRACK');

    for (const bad of ['sdn', 'ADMIT', 'junk', 'admit,cycletrack']) {
      expect((await anon.get(`/api/medschools/schools?source=${bad}`)).status, bad).toBe(400);
      expect((await anon.get(`/api/medschools/schools/${SLUG}/activity?source=${bad}`)).status, bad).toBe(400);
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

  it('filters the live feed and the Today summary by an explicit schools= list (owner 2026-11-24: My cycle, My lists)', async () => {
    const all = await anon.get(`/api/medschools/live?school=${SLUG}&limit=100`);
    expect(all.body.events.length).toBeGreaterThan(0);
    // The fixture school among others (any order, a repeat): exactly its events, the same pinned keys.
    const listed = await anon.get(`/api/medschools/live?schools=zz-not-a-school,${SLUG},${SLUG}&limit=100`);
    expect(listed.status).toBe(200);
    expect(Object.keys(listed.body).sort()).toEqual(['asOf', 'events', 'nextCursor']);
    for (const e of listed.body.events) expect(Object.keys(e).sort()).toEqual(LIVE_EVENT_KEYS);
    expect(listed.body.events.map((e: { id: string }) => e.id)).toEqual(
      all.body.events.map((e: { id: string }) => e.id),
    );
    expect(listed.headers.get('cache-control')).toMatch(/public/);
    // An unknown slug matches nothing; with `school` the two intersect.
    expect((await anon.get('/api/medschools/live?schools=zz-not-a-school')).body.events).toEqual([]);
    expect((await anon.get(`/api/medschools/live?school=${SLUG}&schools=zz-not-a-school`)).body.events).toEqual([]);
    const summary = await anon.get(`/api/medschools/live/summary?schools=${SLUG}`);
    expect(summary.status).toBe(200);
    expect(Object.keys(summary.body).sort()).toEqual(LIVE_SUMMARY_KEYS);
    for (const a of summary.body.active as { school: { slug: string } }[]) expect(a.school.slug).toBe(SLUG);
    // Validation: malformed, upper case, empty, more than 300.
    const tooMany = Array.from({ length: 301 }, (_, i) => `s${i}`).join(',');
    for (const bad of ['Duke', 'duke,', ',duke', 'a;b', tooMany]) {
      expect((await anon.get(`/api/medschools/live?schools=${encodeURIComponent(bad)}`)).status, bad.slice(0, 12)).toBe(
        400,
      );
      expect((await anon.get(`/api/medschools/live/summary?schools=${encodeURIComponent(bad)}`)).status).toBe(400);
    }
  });

  it('filters by several states at once (owner 2026-11-24): known codes only, at most ten, a single code still works', async () => {
    type School = { slug: string; state: string };
    const schools = async (state: string) => anon.get(`/api/medschools/schools?state=${state}`);
    const one = await schools('NC');
    expect(one.status).toBe(200);
    expect((one.body.schools as School[]).every((s) => s.state === 'NC')).toBe(true);
    expect((one.body.schools as School[]).some((s) => s.slug === SLUG)).toBe(true);
    const two = await schools('TX,NC');
    expect(two.status).toBe(200);
    expect((two.body.schools as School[]).every((s) => s.state === 'NC' || s.state === 'TX')).toBe(true);
    expect((two.body.schools as School[]).some((s) => s.slug === SLUG)).toBe(true);
    expect((await schools('TX')).body.schools.some((s: School) => s.slug === SLUG)).toBe(false);
    expect((await schools('NC,ZZ')).status).toBe(400);
    expect((await schools('AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI')).status).toBe(400);
    const live = await anon.get('/api/medschools/live?state=NC,TX&limit=100');
    expect(live.status).toBe(200);
    expect(
      (live.body.events as { school: { state: string } }[]).every((e) => ['NC', 'TX'].includes(e.school.state)),
    ).toBe(true);
    expect((await anon.get('/api/medschools/live?state=NC,ZZ')).status).toBe(400);
  });

  it('server-renders the school page with charts, the unit and the source, and nothing identifying', async () => {
    const res = await anon.get(`/med/${SLUG}`);
    expect(res.status).toBe(200);
    const html = String(res.body);
    expect(html).toContain('<svg');
    expect(html).toContain('Reported events');
    expect(html).toContain('Source:');
    for (const f of FORBIDDEN) expect(html, f).not.toContain(f);
    expect(html).not.toContain('"count":99');
  });

  it('serves the index and the live page as HTML', async () => {
    for (const path of ['/med', '/med/live']) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(200);
      expect(String(res.body)).toContain('<html');
      // The "interview invites reported today" block was removed; the live page and the rail carry that now.
      expect(String(res.body), path).not.toMatch(/invites reported today/i);
    }
  });

  it('answers an unknown school with a 404 page', async () => {
    for (const slug of ['does-not-exist', 'Harvard', 'a'.repeat(300)]) {
      const res = await anon.get(`/med/${slug}`);
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
    expect(xml).toContain(`/med/${SLUG}`);
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
    const res = await anon.get(`/med/${SLUG}?tab=forecast`);
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
    const res = await anon.get(`/med/${SLUG}?tab=secondaries`);
    expect(res.status).toBe(200);
    const html = String(res.body);
    expect(html).toContain(SECONDARIES_TEXT.same);
    expect(html).toContain('Source: Admit.org');
    expect(html).toContain('Rolling admissions');
    // The tab itself offers no writing field. The live rail beside it (server-rendered on every page) has its own
    // filter controls, so look only inside <main>.
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    expect(main).toContain(SECONDARIES_TEXT.same);
    expect(main).not.toMatch(/<(input|textarea)\b/);
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

/* --------------------------- school facts: the AAMC MSAR report rows and their endpoint --------------------------- */

const FACTS_KEYS = ['classes', 'facts', 'mdphd', 'pageUrl'];
const PROFILE_CLASS_KEYS = ['checkedOn', 'enteringYear', 'label', 'stats', 'url'];
const PROFILE_STAT_KEYS = ['evidence', 'kind', 'num', 'program', 'qualifier', 'value'];
const MDPHD_KEYS = ['mstp', 'program', 'timeline'];
const MDPHD_PROGRAM_KEYS = ['checkedOn', 'exists', 'name', 'source', 'sourceUrl'];
const MDPHD_TIMELINE_KEYS = ['checkedOn', 'evidence', 'pattern', 'phases', 'sourceUrl', 'totalYears'];
const MDPHD_MSTP_KEYS = ['checkedOn', 'fiscalYear', 'grant', 'listed', 'sourceUrl'];
const FACT_KEYS = [
  'checkedOn',
  'cycleYear',
  'kind',
  'note',
  'num',
  'page',
  'printed',
  'report',
  'reportId',
  'sourceLabel',
  'sourceUrl',
  'value',
];
const factsUrl = (slug = SLUG) => `/api/medschools/schools/${slug}/facts`;

describe('the public school facts endpoint', () => {
  it('has the pinned key sets and a long public cache, and no internal id', async () => {
    const res = await anon.get(factsUrl());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(FACTS_KEYS);
    expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.body.facts.map((f: { kind: string }) => f.kind)).toEqual([
      'ACCEPTS_OUT_OF_STATE',
      'COA_IN_STATE',
      'CURRICULUM_CLERKSHIP_GRADING',
    ]);
    for (const f of res.body.facts) expect(Object.keys(f).sort()).toEqual(FACT_KEYS);
    expect(res.body.facts[0]).toMatchObject({
      value: 'YES',
      note: 'Fixture note.',
      cycleYear: 2027,
      checkedOn: '2026-11-24',
    });
    expect(res.body.facts[1]).toMatchObject({ num: 69123, report: 'Tuition, Fees and Insurance Information' });
    // Admit.org's curriculum rows come through with their own source label, no report and no entering class.
    expect(res.body.facts[2]).toMatchObject({
      value: 'H_HP_P_F',
      printed: 'H/HP/P/F',
      reportId: null,
      report: '',
      cycleYear: 0,
      sourceLabel: 'Admit.org',
      sourceUrl: 'https://admit.org',
      checkedOn: '2026-11-24',
    });
    expect(res.body.pageUrl).toMatch(/^https:\/\/students-residents\.aamc\.org\//);
    const text = JSON.stringify(res.body);
    // `page` is the AAMC PDF page the fact was read on (public; the source link opens the PDF there), null for Admit.
    expect(res.body.facts[0].page).toBe(2);
    expect(res.body.facts[2].page).toBeNull();
    for (const f of ['schoolId', 'userId', 'it-fact-']) expect(text).not.toContain(f);
  });

  it('is empty for a school the reports do not cover and 404 for an unknown or inactive slug', async () => {
    const none = await anon.get(factsUrl(SECONDARIES_NOTYET_SLUG));
    expect(none.status).toBe(200);
    expect(none.body.facts).toEqual([]);
    expect((await anon.get(factsUrl('does-not-exist'))).status).toBe(404);
    expect((await anon.get(factsUrl(INACTIVE_SLUG))).status).toBe(404);
  });

  it('serves the MD-PhD program with pinned keys, and its rows never join the facts list', async () => {
    const res = await anon.get(factsUrl());
    const m = res.body.mdphd;
    expect(Object.keys(m).sort()).toEqual(MDPHD_KEYS);
    expect(Object.keys(m.program).sort()).toEqual(MDPHD_PROGRAM_KEYS);
    expect(Object.keys(m.timeline).sort()).toEqual(MDPHD_TIMELINE_KEYS);
    expect(Object.keys(m.mstp).sort()).toEqual(MDPHD_MSTP_KEYS);
    expect(m.program).toMatchObject({
      exists: true,
      name: 'Fixture MSTP',
      source: 'SCHOOL_PAGE',
      checkedOn: '2026-11-24',
    });
    expect(m.timeline).toMatchObject({
      pattern: '2-4-2',
      totalYears: 8,
      evidence: MDPHD_EVIDENCE,
      sourceUrl: MDPHD_PAGE,
    });
    expect(m.timeline.phases.map((p: { phase: string }) => p.phase)).toEqual(['preclinical', 'research', 'clinical']);
    expect(m.mstp).toEqual({
      listed: true,
      grant: 'T32GM000001',
      fiscalYear: 2026,
      sourceUrl: 'https://reporter.nih.gov/project-details/1',
      checkedOn: '2026-11-24',
    });
    for (const k of ['MDPHD_PROGRAM', 'MDPHD_TIMELINE', 'MSTP_T32'])
      expect(res.body.facts.map((f: { kind: string }) => f.kind)).not.toContain(k);
    expect(JSON.stringify(m)).not.toMatch(/it-mdphd-|applId|projectNum|organization/);
  });

  it('gives a school with no combined program no MD-PhD facts: the one row, no timeline, no MSTP status', async () => {
    const res = await anon.get(factsUrl(SECONDARIES_NOTYET_SLUG));
    expect(res.body.mdphd).toEqual({
      program: {
        exists: false,
        name: null,
        source: 'SCHOOL_PAGE',
        sourceUrl: 'https://fixture.edu/md',
        checkedOn: '2026-11-24',
      },
      timeline: null,
      mstp: null,
    });
  });

  it('shows the MD-PhD group in the server HTML of the Facts tab', async () => {
    const html = String((await anon.get(`/med/${SLUG}?tab=facts`)).body);
    expect(html).toContain('MD-PhD program');
    expect(html).toContain('Fixture MSTP');
    expect(html).toContain('T32GM000001');
    expect(html).toContain('Preclinical 2 years, then PhD research 4 years, then clinical 2 years');
    const none = String((await anon.get(`/med/${SECONDARIES_NOTYET_SLUG}?tab=facts`)).body);
    expect(none).toContain('No combined program');
    expect(none).not.toContain('medapp-phasebar');
  });

  it('serves the class profile with pinned keys, newest class first, the figures as the page writes them', async () => {
    const res = await anon.get(factsUrl());
    const classes = res.body.classes;
    expect(classes.map((c: { label: string; enteringYear: number }) => [c.label, c.enteringYear])).toEqual([
      ['Class of 2030', 2026],
      ['Class of 2029', 2025],
    ]);
    for (const c of classes) {
      expect(Object.keys(c).sort()).toEqual(PROFILE_CLASS_KEYS);
      for (const st of c.stats) expect(Object.keys(st).sort()).toEqual(PROFILE_STAT_KEYS);
    }
    expect(classes[0].url).toBe(PROFILE_PAGE);
    expect(classes[0].checkedOn).toBe('2026-11-24');
    expect(
      classes[0].stats.map(
        (x: { kind: string; value: string; program: string }) => `${x.program}:${x.kind}:${x.value}`,
      ),
    ).toEqual(['REG:MCAT_MEDIAN:517', 'REG:APPLICANTS:7,412', 'REG:OTHER:22%', 'REG:OTHER:31%', 'PHD:APPLICANTS:562']);
    expect(classes[0].stats[1]).toEqual({
      kind: 'APPLICANTS',
      program: 'REG',
      value: '7,412',
      num: 7412,
      qualifier: null,
      evidence: 'Applicants 7,412',
    });
    // Profile rows never join the AAMC / Admit facts list, and no internal id leaks.
    for (const f of res.body.facts) expect(f.kind).not.toMatch(/^PROFILE_/);
    expect(JSON.stringify(classes)).not.toMatch(/it-profile-|schoolId|"order"/);
    expect((await anon.get(factsUrl(SECONDARIES_NOTYET_SLUG))).body.classes).toEqual([]);
  });

  it('shows the Entering class panel first on the Facts tab in the server HTML, and none without a profile', async () => {
    const html = String((await anon.get(`/med/${SLUG}?tab=facts`)).body);
    expect(html).toContain('Entering class');
    expect(html).toContain('Entered 2026');
    expect(html).toContain('Median MCAT');
    expect(html).toContain('Figures as the school publishes them.');
    expect(html.indexOf('school-profile-heading')).toBeLessThan(html.indexOf('school-curriculum-heading'));
    const none = String((await anon.get(`/med/${SECONDARIES_NOTYET_SLUG}?tab=facts`)).body);
    expect(none).not.toContain('school-profile-heading');
  });

  it('never depends on the viewer', async () => {
    const a = await anon.get(`${factsUrl()}?cb=viewer`);
    expect(JSON.stringify(a.body)).toBe(JSON.stringify((await anon.get(factsUrl())).body));
  });

  it('renders Curriculum and Admissions facts in the server HTML of the Facts tab, each with its source line', async () => {
    const res = await anon.get(`/med/${SLUG}?tab=facts`);
    expect(res.status).toBe(200);
    expect(String(res.body)).toContain('Admissions facts');
    expect(String(res.body)).toContain('Source: AAMC MSAR Report for Applicants and Advisors, 2027 entering class');
    expect(String(res.body)).toContain('Curriculum');
    expect(String(res.body)).toContain('H/HP/P/F');
    expect(String(res.body)).toContain('Compiled by Admit.org; confirm with the school.');
  });

  it('keeps the Activity tab to activity: the facts moved to their own tab', async () => {
    const res = await anon.get(`/med/${SLUG}`);
    expect(res.status).toBe(200);
    expect(String(res.body)).not.toContain('Admissions facts');
  });
});
