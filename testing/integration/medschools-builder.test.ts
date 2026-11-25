/**
 * RMH Med Schools phase D, black box: the private stats and the AI list builder.
 *
 * Runs against a RUNNING app. The model cases run against `lib/fake-deepseek.ts` on `INTEGRATION_AI_FAKE_PORT` (the app
 * started with `DEEPSEEK_API_KEY=integration-fake` and `DEEPSEEK_BASE_URL=http://127.0.0.1:$INTEGRATION_AI_FAKE_PORT/v1`);
 * without the port they are skipped.
 *
 *   INTEGRATION_BASE_URL=http://localhost:7005 INTEGRATION_AI_FAKE_PORT=7798 DATABASE_URL=… \
 *     pnpm test:integration -- testing/integration/medschools-builder.test.ts
 *
 * What it proves: signed out every new route is 401 and nothing is publicly cached; the stats round trip, are another
 * member's 404-free nothing, and change no public byte; the builder labels in code from the class's published figures
 * and the member's stats; a hostile reply (an invented number, a link, a school that was not a candidate, a label of
 * its own) is cut by the validator; the model never sees a note, an activity, the member's id or email; nothing of the
 * request is stored in any table; saving makes an ordinary private list.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import { createFreshMember, removeFreshMembers, type FreshMember } from './lib/fresh-member';
import { startFakeDeepseek, userJson, type FakeCall, type FakeDeepseek, type FakeScript } from './lib/fake-deepseek';

const PORT = Number(process.env.INTEGRATION_AI_FAKE_PORT ?? 0);
const STATS = '/api/medschools/me/stats';
const ONBOARD = '/api/medschools/me/stats/onboarding';
const BUILD = '/api/medschools/me/list-builder';
const SAVE = '/api/medschools/me/list-builder/save';
const NOT_PUBLIC = /public|s-maxage|max-age=[1-9]/i;
const NOTE = 'zzz-private-note-never-sent';
const ACTIVITY = 'zzz-private-activity-title';
const REQUEST = 'zzzrequest schools in the fixture states, research heavy';

const SCHOOLS = [
  // slug, state, MCAT median, GPA median
  ['it-builder-high', 'VT', '522', 3.95],
  ['it-builder-mid', 'VT', '512', 3.8],
  ['it-builder-low', 'ME', '504', 3.55],
  ['it-builder-none', 'ME', null, null],
] as const;

async function seedSchools(): Promise<void> {
  await removeSchools();
  for (const [slug, state, mcat, gpa] of SCHOOLS) {
    const id = `${slug}-school`;
    await db().query(
      `insert into med_school (id, slug, name, "shortName", degree, city, state, active, "updatedAt")
       values ($1, $2, $3, $4, 'MD', 'Town', $5, true, now())`,
      [id, slug, `${slug} School of Medicine`, slug, state],
    );
    const facts: [string, string, number][] = [];
    if (mcat) facts.push(['PROFILE_MCAT_MEDIAN', mcat, Number(mcat)]);
    if (gpa) facts.push(['PROFILE_GPA_MEDIAN', gpa.toFixed(2), gpa]);
    for (const [i, [kind, text, num]] of facts.entries()) {
      await db().query(
        `insert into med_school_fact (id, "schoolId", program, "cycleYear", kind, "valueNum", "valueText", "valueJson", source, "sourceUrl", "sourceLabel", "checkedOn")
         values ($1, $2, 'REG', 2026, $3, $4, $5, $6, 'SCHOOL_PROFILE', $7, 'Class profile', '2026-11-24')`,
        [
          `${id}-fact-${i}`,
          id,
          kind,
          num,
          text,
          JSON.stringify({ text, label: 'Entered 2026', qualifier: null, evidence: `${kind} ${text}`, url: `https://${slug}.example.edu/p`, unit: null, order: i }),
          `https://${slug}.example.edu/p`,
        ],
      );
    }
  }
}
async function removeSchools(): Promise<void> {
  await db().query('delete from med_school where slug = any($1)', [SCHOOLS.map((s) => s[0])]);
}

let a: FreshMember;
let b: FreshMember;
const anon = new Client();
/** The client has no `put`; the tracker tests send PUTs the same way. */
const put = (c: Client, path: string, json: unknown) => c.request('PUT', path, { json });

beforeAll(async () => {
  a = await createFreshMember('builder-a');
  b = await createFreshMember('builder-b');
});
afterAll(async () => {
  await db().query('delete from med_school_list where "userId" = any($1)', [[a.id, b.id]]);
  await removeFreshMembers([a, b]);
});

const STATS_BODY = {
  mcat: [{ year: 2026, month: 4, cpbs: 128, cars: 127, bbls: 129, psbb: 128 }],
  gpa: { cumulative: 3.81, science: 3.7 },
  hours: [{ category: 'RESEARCH', hours: 1200, note: NOTE, activities: [{ title: ACTIVITY, hours: 700 }] }],
  homeState: 'VT',
  missions: ['research'],
};

describe('medschools stats: private', () => {
  it('signed out: every new route is 401 with no public cache header', async () => {
    for (const res of [
      await anon.get(STATS),
      await put(anon, STATS, {}),
      await anon.delete(STATS),
      await put(anon, ONBOARD, { state: 'skipped' }),
      await anon.post(BUILD, { request: REQUEST }),
      await anon.post(SAVE, { name: 'x', items: [{ slug: 'it-builder-high' }] }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    }
  });

  it('round trips, is the member’s alone, and is never publicly cached', async () => {
    expect((await a.client.get(STATS)).body).toMatchObject({ stats: null, onboarding: 'pending' });
    const saved = await put(a.client, STATS, STATS_BODY);
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    expect(saved.body.stats.mcat[0].total).toBe(512);
    expect(saved.body.onboarding).toBe('done');
    expect(JSON.stringify(saved.body)).not.toMatch(/"(id|userId|profileId)"/);
    const other = await b.client.get(STATS);
    expect(other.body.stats).toBeNull();
    expect(JSON.stringify(other.body)).not.toContain(NOTE);
    expect((await put(a.client, STATS, { gpa: { cumulative: 4.5 } })).status).toBe(400);
    expect((await put(a.client, STATS, { userId: b.id })).status).toBe(400);
  });

  it('a member with stats changes no public byte', async () => {
    const paths = ['/api/medschools/schools', '/api/medschools/live'];
    for (const p of paths) {
      const signedOut = await anon.get(p);
      const signedIn = await a.client.get(p);
      expect(JSON.stringify(signedIn.body)).toBe(JSON.stringify(signedOut.body));
      expect(JSON.stringify(signedIn.body)).not.toMatch(/512|3\.81|zzz-private/);
    }
  });

  it('skip is remembered', async () => {
    expect((await put(b.client, ONBOARD, { state: 'skipped' })).body.onboarding).toBe('done');
    expect((await b.client.get(STATS)).body.onboarding).toBe('done');
  });
});

const candidatesOf = (call: FakeCall) =>
  ((userJson(call.user)?.candidates ?? []) as { id: string; name: string; label: string; facts: { ref: string; text: string }[] }[]);
const isAnswer = (call: FakeCall) => Array.isArray(userJson(call.user)?.candidates);

/** A hostile model: one honest reason, one invented number, one link, a pick that is no candidate, a label of its own. */
const hostile: FakeScript = (call) => {
  if (!isAnswer(call)) return { intent: 'list', states: ['VT', 'ME'], count: 10, missions: ['research'] };
  const c = candidatesOf(call);
  const id = (slug: string) => c.find((x) => x.name.startsWith(slug))?.id ?? 'zz';
  const mcatRef = (slug: string) => c.find((x) => x.name.startsWith(slug))?.facts[0]?.ref ?? 'zz';
  return {
    picks: [
      { id: id('it-builder-high'), label: 'likely', reason: { text: 'Your MCAT of 512 is below the class median of 522.', cites: ['m1', mcatRef('it-builder-high')] } },
      { id: id('it-builder-mid'), reason: { text: 'You have a 73% chance here.', cites: [mcatRef('it-builder-mid')] } },
      { id: id('it-builder-low'), reason: { text: 'See https://evil.example now.', cites: [mcatRef('it-builder-low')] } },
      { id: id('it-builder-none') },
      { id: 'c999', reason: { text: 'Harvard is perfect.', cites: [] } },
    ],
  };
};

describe.skipIf(!PORT)('medschools list builder: with the fake provider', () => {
  let fake: FakeDeepseek;
  beforeAll(async () => {
    fake = await startFakeDeepseek(PORT, hostile);
    await seedSchools();
    await put(a.client, STATS, STATS_BODY);
  });
  afterEach(() => fake.reset());
  afterAll(async () => {
    await fake?.close();
    await removeSchools();
    await db().query(`delete from ai_usage where task = 'medschools-qa' and "userId" = any($1)`, [[a.id, b.id]]);
    await closeDb();
  });

  it('labels in code, cuts what is ungrounded, and the model saw no note, activity or person', async () => {
    const res = await a.client.post(BUILD, { request: REQUEST, useStats: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    type Row = { slug: string; label: string; comparisons: Record<string, unknown>[]; reason: { text: string } | null };
    const by = Object.fromEntries((res.body.schools as Row[]).map((s) => [s.slug, s])) as Record<string, Row>;
    expect(Object.keys(by).sort()).toEqual(['it-builder-high', 'it-builder-low', 'it-builder-mid', 'it-builder-none']);
    expect(by['it-builder-high']!.label).toBe('reach');
    expect(by['it-builder-mid']!.label).toBe('target');
    expect(by['it-builder-low']!.label).toBe('likely');
    expect(by['it-builder-none']!.label).toBe('not-enough-data');
    expect(by['it-builder-high']!.comparisons[0]).toMatchObject({ yours: '512', theirs: '522', stat: 'median' });
    // MCAT is banded by AAMC percentile rank: 512 is 84, 522 is 99.
    expect(by['it-builder-high']!.comparisons[0]).toMatchObject({
      band: 'below',
      mcat: { latest: 512, earlier: [], yoursPct: { rank: 84 }, theirsPct: { rank: 99 } },
    });
    expect(by['it-builder-high']!.reason?.text).toContain('522');
    expect(by['it-builder-mid']!.reason).toBeNull();
    expect(by['it-builder-low']!.reason).toBeNull();
    expect(res.body.notice).toBe('removed-ungrounded');
    expect(JSON.stringify(res.body)).not.toMatch(/73%|evil\.example|Harvard/);
    const seen = fake.calls().map((x) => x.system + x.user).join('\n');
    for (const needle of [NOTE, ACTIVITY, a.id, a.email, 'cpbs']) expect(seen).not.toContain(needle);
    expect(seen).toContain('Your most recent MCAT total (April 2026): 512');
  });

  it('stores nothing of the request or the answer, and saving makes an ordinary private list', async () => {
    await a.client.post(BUILD, { request: REQUEST, useStats: false });
    await new Promise((r) => setTimeout(r, 400));
    const tables = await db().query(
      `select table_name from information_schema.columns where table_schema = 'public' and data_type in ('text', 'character varying', 'jsonb') group by table_name`,
    );
    for (const { table_name } of tables.rows as { table_name: string }[]) {
      const hit = await db().query(`select 1 from "${table_name}" t where t::text like $1 limit 1`, ['%zzzrequest%']);
      expect(hit.rowCount, table_name).toBe(0);
    }
    const saved = await a.client.post(SAVE, {
      name: 'Built',
      items: [{ slug: 'it-builder-high' }, { slug: 'it-builder-mid' }, { slug: 'not-a-school' }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.items.map((i: { school: { slug: string } }) => i.school.slug)).toEqual([
      'it-builder-high',
      'it-builder-mid',
    ]);
    expect((await b.client.get('/api/medschools/me/lists')).body.lists).toEqual([]);
  });

  it('DELETE removes the stats; a later build compares nothing', async () => {
    expect((await a.client.delete(STATS)).body.stats.mcat).toEqual([]);
    const res = await a.client.post(BUILD, { request: REQUEST, useStats: true });
    expect(res.body.statsMissing).toBe(true);
    expect(new Set((res.body.schools as { label: string }[]).map((s) => s.label))).toEqual(new Set(['not-compared']));
  });
});
