/**
 * RMH Med Schools, the private tracker, sharing, lists and preferences, black box (phase 4, plan Task 13).
 *
 * Runs against a RUNNING app and writes its own data: `lib/medschools-fixture.ts` inserts an MD and a DO school under
 * test-only slugs in `beforeAll` and deletes them (and the three users' tracker, list and preference rows) in
 * `afterAll`. CI's database is empty, so nothing here assumes pre-existing data.
 *
 * Needs `MEDSCHOOLS_DEDUPE_SECRET` in BOTH the app's environment and this process's (same value): the app derives the
 * sharing hashes with it and the tests recompute them to prove the final events equal the final milestones.
 *
 *   INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=… MEDSCHOOLS_DEDUPE_SECRET=… \
 *     pnpm test:integration -- testing/integration/medschools-private.test.ts
 *
 * What it proves, in the order of the plan's Review Focus: anonymous requests to every `me/**` endpoint are 401 and
 * never publicly cached; another member's ids are a 404; sharing reaches the public pages only through the daily
 * publish job and only at three contributors; turning sharing off removes the event at once and the public figure at the
 * next publish; edits and deletes keep events and counts equal to a from-scratch recompute; nothing person-shaped sits in
 * the event rows; rapid mixed writes from two clients converge; lists and preferences obey their caps and round-trip.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, closeDb, db, eventually, type TestUser } from './lib/client';
import {
  MEDSCHOOL_FIXTURE_SLUG,
  PRIVATE_DO_ID,
  PRIVATE_DO_SLUG,
  PRIVATE_MD_ID,
  PRIVATE_MD_SLUG,
  removeSecondariesFixture,
  removeSharingMembers,
  removeTurnaroundMembers,
  SECONDARIES_TEXT,
  seedSecondariesFixture,
  seedTurnaroundMembers,
  setTurnaroundSharing,
  turnaroundColumns,
  turnaroundRows,
  removeTrackerFixture,
  rmhCountRows,
  rmhEventCount,
  rmhRecompute,
  seedFillerSchools,
  seedSharingMembers,
  setSharerSharing,
  seedMedSchoolsFixture,
  seedTrackerFixture,
  waitCurveColumns,
  waitCurveRow,
} from './lib/medschools-fixture';

const SECRET = process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '';
const DAY = 86_400_000;

/** The entry year the site resolves as current (mirrors the fixture helper and `cycleYearOf(now, 'SECONDARY')`). */
const now = new Date();
const CYCLE = now.getUTCMonth() < 5 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
const dayAgo = (n: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - n * DAY).toISOString().slice(0, 10);

type Member = TestUser & { client: Client };
let a: Member;
let b: Member;
let c: Member;
const anon = new Client();
let counter = 0;
/** The public responses sit behind a 30 s shared cache and an in-process micro cache keyed by URL; a unique query defeats both. */
const fresh = (path: string) =>
  `${path}${path.includes('?') ? '&' : '?'}cb=${Date.now().toString(36)}${(counter += 1)}`;

/** The shared cast from the global setup (sign-up is limited to 10 a minute per IP, so this file signs nobody up). */
const member = (u: TestUser): Member => ({ ...u, client: new Client(u.cookies) });
const originalCreated = new Map<string, Date>();

beforeAll(async () => {
  if (SECRET.length < 16) throw new Error("MEDSCHOOLS_DEDUPE_SECRET (16+ characters, the app's own value) is required");
  [a, b, c] = [member(inject('alice')), member(inject('bob')), member(inject('carol'))];
  await seedTrackerFixture([a.id, b.id, c.id]);
  // Sharing needs an account at least 7 days old (plan Q8); the server reads `createdAt` from the database. Put it back after.
  const ids = [a.id, b.id, c.id];
  const was = await db().query('select id, "createdAt" from "user" where id = any($1)', [ids]);
  for (const r of was.rows) originalCreated.set(r.id, r.createdAt);
  await db().query(`update "user" set "createdAt" = now() - interval '30 days' where id = any($1)`, [ids]);
});
afterAll(async () => {
  const ids = [a?.id, b?.id, c?.id].filter((x): x is string => !!x);
  await removeSharingMembers();
  await removeTurnaroundMembers();
  await removeSecondariesFixture();
  await removeTrackerFixture(ids);
  for (const [id, createdAt] of originalCreated)
    await db().query('update "user" set "createdAt" = $2 where id = $1', [id, createdAt]);
  await closeDb();
});

/* ------------------------------ helpers ------------------------------ */

async function putCycle(m: Member, shareAnonymously: boolean, cycleYear = CYCLE) {
  return m.client.request('PUT', '/api/medschools/me/tracker/cycle', { json: { cycleYear, shareAnonymously } });
}
async function addApp(m: Member, schoolSlug: string, program: 'REG' | 'PHD' = 'REG', cycleYear = CYCLE) {
  const res = await m.client.post('/api/medschools/me/tracker/applications', { cycleYear, schoolSlug, program });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.id as string;
}
const putMilestone = (m: Member, appId: string, type: string, date: string) =>
  m.client.request('PUT', `/api/medschools/me/tracker/applications/${appId}/milestones/${type}`, { json: { date } });

/** The public activity response for the MD fixture school (cache-busted), and the RMH source of its INTERVIEW chart. */
async function publicInterview(slug = PRIVATE_MD_SLUG) {
  const res = await anon.get(fresh(`/api/medschools/schools/${slug}/activity`));
  expect(res.status).toBe(200);
  const type = res.body.types.find((t: { eventType: string }) => t.eventType === 'INTERVIEW');
  const rmh = type.sources.find((s: { source: string }) => s.source === 'RMH') ?? null;
  return { body: res.body, rmh: rmh as { total: number; days: { date: string; count: number }[] } | null };
}

/** Run the daily publish job's function directly (a manual run: no minimum interval), as the `jobs` worker would. */
async function runPublishJob() {
  const [{ prisma }, { runRmhPublish }] = await Promise.all([
    import('../../lib/prisma.server'),
    import('../../features/medschools/scrape/run-rmh-publish'),
  ]);
  const log = { info: () => {}, warn: () => {}, error: (m: string) => console.error(m) };
  // The structural run-ledger client the worker passes is the Prisma client itself.
  const summary = await runRmhPublish({ prisma: prisma as never, db: prisma, log }, { trigger: 'MANUAL' });
  expect(summary?.status).toBe('OK');
  return summary;
}

/**
 * Counts equal a from-scratch grouping of the events. A cell whose last event went stays as a 0 row until the daily job
 * removes it (so it never vanishes mid-day); `rmhRecompute` leaves those rows out.
 */
async function expectConsistent(schoolId: string) {
  const r = await rmhRecompute(schoolId);
  expect(r.fromCounts).toEqual(r.fromEvents);
}

/* --------------------------- anonymous and caching --------------------------- */

/** One row per `me/**` route module: method, path with placeholder ids. */
const ME_ENDPOINTS: Array<[string, string, unknown?]> = [
  ['GET', '/api/medschools/me/tracker'],
  ['PUT', '/api/medschools/me/tracker/cycle', { cycleYear: CYCLE, shareAnonymously: false }],
  ['DELETE', `/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`],
  ['POST', '/api/medschools/me/tracker/applications', { cycleYear: CYCLE, schoolSlug: 'x', program: 'REG' }],
  ['PATCH', '/api/medschools/me/tracker/applications/x', { notes: null }],
  ['DELETE', '/api/medschools/me/tracker/applications/x'],
  ['PUT', '/api/medschools/me/tracker/applications/x/milestones/INTERVIEW', { date: '2026-10-01' }],
  ['DELETE', '/api/medschools/me/tracker/applications/x/milestones/INTERVIEW'],
  ['GET', '/api/medschools/me/lists'],
  ['POST', '/api/medschools/me/lists', { name: 'x' }],
  ['PATCH', '/api/medschools/me/lists/x', { name: 'y' }],
  ['DELETE', '/api/medschools/me/lists/x'],
  ['PUT', '/api/medschools/me/list-order', { ids: [] }],
  ['POST', '/api/medschools/me/list-items', { schoolSlug: 'x' }],
  ['PATCH', '/api/medschools/me/lists/x/items/y', { note: 'n' }],
  ['DELETE', '/api/medschools/me/lists/x/items/y'],
  ['PUT', '/api/medschools/me/lists/x/item-order', { ids: [] }],
  ['POST', '/api/medschools/me/lists/x/add-to-tracker', {}],
  ['GET', '/api/medschools/me/chances'],
  ['GET', '/api/medschools/me/secondaries/overlap?source=tracker'],
  ['GET', '/api/medschools/me/prefs'],
  ['PUT', '/api/medschools/me/prefs', { chartCategories: [] }],
  ['POST', '/api/medschools/me/tracker/import/parse', { text: 'Duke submitted 2026-06-12' }],
  ['POST', '/api/medschools/me/tracker/import/save', { cycleYear: CYCLE, rows: [] }],
  ['GET', '/api/medschools/me/ask'],
  ['POST', '/api/medschools/me/ask', { question: 'What is the median?' }],
  ['GET', '/api/medschools/me/qa-limit-request'],
  ['POST', '/api/medschools/me/qa-limit-request', { note: 'more please' }],
];

describe('the private endpoints refuse anonymous requests and are never publicly cached', () => {
  it('lists every me/** route module (a new endpoint must be added to this table)', () => {
    const modules = readdirSync('features/medschools/api').filter((f) => /^medschools\.me\..*\.server\.ts$/.test(f));
    const paths = new Set(
      ME_ENDPOINTS.map(([, p]) =>
        p
          .split('?')[0]
          .replace(/\/(x|y)(?=\/|$)/g, '/$')
          .replace(/\/INTERVIEW$/, '/$type'),
      ),
    );
    expect(modules.length).toBe(paths.size);
  });

  it.each(ME_ENDPOINTS)('%s %s is 401 without a session', async (method, path, json) => {
    const res = await anon.request(method, path, { json });
    expect(res.status).toBe(401);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).not.toMatch(/public|s-maxage/i);
    expect(res.headers.get('etag')).toBeNull();
  });

  it('answers a signed-in read with a private, unetagged response; the public list does not change with a session', async () => {
    for (const path of ['/api/medschools/me/tracker', '/api/medschools/me/lists', '/api/medschools/me/prefs']) {
      const res = await a.client.get(path);
      expect(res.status, path).toBe(200);
      const cc = res.headers.get('cache-control') ?? '';
      expect(cc, path).not.toMatch(/public|s-maxage/i);
      expect(res.headers.get('etag'), path).toBeNull();
    }
    const url = '/api/medschools/schools?cb=stable';
    const without = await anon.get(url);
    const withSession = await a.client.get(url);
    expect(without.headers.get('cache-control')).toMatch(/public/);
    expect(withSession.headers.get('cache-control')).toMatch(/public/);
    expect(JSON.stringify(withSession.body)).toBe(JSON.stringify(without.body));
  });

  it('serves the reserved paths as pages, not as the school 404', async () => {
    for (const path of ['/rmh-medschool/tracker', '/rmh-medschool/lists']) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(200);
    }
    const tracker = String(await anon.get('/rmh-medschool/tracker').then((r) => r.body));
    expect(tracker.toLowerCase()).toContain('sign in');
    expect(tracker).toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
  });
});

/* --------------------------- sharing and the public figure --------------------------- */

describe('sharing reaches the public figure only through the daily job, and only at three', () => {
  const apps: Record<string, string> = {};
  const day = dayAgo(3);

  it('shares nothing while a cycle is private', async () => {
    expect((await putCycle(a, false)).status).toBe(200);
    apps.a = await addApp(a, PRIVATE_MD_SLUG);
    expect((await putMilestone(a, apps.a, 'INTERVIEW', day)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(0);
  });

  it('never creates an event for SUBMITTED or COMPLETE, even with sharing on', async () => {
    expect((await putCycle(a, true)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(1); // a's INTERVIEW, shared when the switch went on
    const submitted = await putMilestone(a, apps.a, 'SUBMITTED', dayAgo(20));
    const complete = await putMilestone(a, apps.a, 'COMPLETE', dayAgo(15));
    expect(submitted.status).toBe(200);
    expect(complete.status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(1);
    await expectConsistent(PRIVATE_MD_ID);
  });

  it('keeps two contributors out of the public response while the count row exists (k floor)', async () => {
    expect((await putCycle(b, true)).status).toBe(200);
    apps.b = await addApp(b, PRIVATE_MD_SLUG);
    expect((await putMilestone(b, apps.b, 'INTERVIEW', day)).status).toBe(200);
    const rows = await rmhCountRows(PRIVATE_MD_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: day, eventType: 'INTERVIEW', count: 2, contributors: 2 });
    await runPublishJob();
    expect((await publicInterview()).rmh).toBeNull();
  });

  it('shows no public change when the third contributor shares, until the publish job runs', async () => {
    expect((await putCycle(c, true)).status).toBe(200);
    apps.c = await addApp(c, PRIVATE_MD_SLUG);
    expect((await putMilestone(c, apps.c, 'INTERVIEW', day)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(3);
    const live = await rmhCountRows(PRIVATE_MD_ID);
    expect(live[0]).toMatchObject({ count: 3, contributors: 3, publishedCount: 2, publishedContributors: 2 });
    expect((await publicInterview()).rmh).toBeNull();

    await runPublishJob();
    const { body, rmh } = await publicInterview();
    expect(rmh).not.toBeNull();
    expect(rmh?.total).toBe(3);
    expect(rmh?.days.find((d) => d.date === day)?.count).toBe(3);
    // The response never says how many people stand behind a figure, or who.
    const text = JSON.stringify(body);
    expect(text).not.toContain('contributors');
    expect(text).not.toContain('dedupeHash');
  });

  it('keeps RMH out of the live feed', async () => {
    const res = await anon.get(fresh(`/api/medschools/live?school=${PRIVATE_MD_SLUG}&limit=100`));
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain('RMH');
  });

  it('removes the event at once when sharing goes off, and the public figure at the next publish', async () => {
    expect((await putCycle(a, false)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(2);
    const rows = await rmhCountRows(PRIVATE_MD_ID);
    expect(rows[0]).toMatchObject({ count: 2, contributors: 2 });
    // Unchanged until the job: nobody learns who just stopped sharing.
    expect((await publicInterview()).rmh?.total).toBe(3);
    await runPublishJob();
    expect((await publicInterview()).rmh).toBeNull();
    await expectConsistent(PRIVATE_MD_ID);
  });

  it('brings the figure back when sharing is switched on again (after the next publish)', async () => {
    expect((await putCycle(a, true)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(3);
    expect((await publicInterview()).rmh).toBeNull();
    await runPublishJob();
    expect((await publicInterview()).rmh?.total).toBe(3);
    await expectConsistent(PRIVATE_MD_ID);
  });

  it('moves a count between two cells when a milestone date changes', async () => {
    const moved = dayAgo(4);
    expect((await putMilestone(a, apps.a, 'INTERVIEW', moved)).status).toBe(200);
    const rows = await rmhCountRows(PRIVATE_MD_ID);
    expect(rows.map((r) => [r.date, r.count])).toEqual([
      [moved, 1],
      [day, 2],
    ]);
    await expectConsistent(PRIVATE_MD_ID);
  });

  it('deletes a milestone, an application and a cycle with their events', async () => {
    const del = await a.client.delete(`/api/medschools/me/tracker/applications/${apps.a}/milestones/INTERVIEW`);
    expect(del.status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(2);
    await expectConsistent(PRIVATE_MD_ID);

    expect((await b.client.delete(`/api/medschools/me/tracker/applications/${apps.b}`)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(1);
    await expectConsistent(PRIVATE_MD_ID);

    expect((await c.client.delete(`/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`)).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(0);
    // The writer leaves zero rows for the day; the job removes them, and the public figure was already gone.
    expect((await rmhCountRows(PRIVATE_MD_ID)).every((r) => r.count === 0)).toBe(true);
    await runPublishJob();
    expect(await rmhCountRows(PRIVATE_MD_ID)).toEqual([]);
    expect((await publicInterview()).rmh).toBeNull();
  });
});

describe('anonymity at rest', () => {
  it('stores nothing that links an event to a member, a cycle, an application or a milestone', async () => {
    const m = a;
    expect((await putCycle(m, true)).status).toBe(200);
    const appId = await addApp(m, PRIVATE_DO_SLUG);
    expect((await putMilestone(m, appId, 'SECONDARY', dayAgo(6))).status).toBe(200);
    const { rows } = await db().query(`select * from med_cycle_event where "schoolId" = $1 and source = 'RMH'`, [
      PRIVATE_DO_ID,
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row.ingestedAt.getTime()).toBe(row.occurredAt.getTime());
    expect(row.inState).toBeNull();
    const ids = await db().query(
      `select c.id as cycle, ap.id as app, mi.id as milestone from med_tracker_cycle c
         join med_tracker_application ap on ap."cycleId" = c.id
         join med_tracker_milestone mi on mi."applicationId" = ap.id
       where c."userId" = $1 and ap.id = $2`,
      [m.id, appId],
    );
    const text = JSON.stringify(row);
    for (const secret of [m.id, m.email, ids.rows[0].cycle, appId, ids.rows[0].milestone])
      expect(text).not.toContain(secret);
    // The hash is a keyed digest of the milestone id: reproducible only with the server secret.
    const expected = createHmac('sha256', SECRET).update(`RMH:milestone:${ids.rows[0].milestone}`).digest('hex');
    expect(row.dedupeHash).toBe(expected);
    const cols = await db().query(
      `select column_name from information_schema.columns where table_name = 'med_tracker_milestone'`,
    );
    expect(cols.rows.map((r) => r.column_name).filter((n) => /hash|event/i.test(n))).toEqual([]);
    await a.client.delete(`/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
    expect(await rmhEventCount(PRIVATE_DO_ID)).toBe(0);
  });
});

/* --------------------------- cross-user access --------------------------- */

describe("another member's ids are a 404 and change nothing", () => {
  it('refuses every tracker and list write that names a foreign id', async () => {
    expect((await putCycle(a, false)).status).toBe(200);
    const appId = await addApp(a, PRIVATE_MD_SLUG);
    expect((await putMilestone(a, appId, 'INTERVIEW', dayAgo(5))).status).toBe(200);
    const saved = await a.client.post('/api/medschools/me/list-items', {
      schoolSlug: PRIVATE_MD_SLUG,
      newListName: 'A list',
    });
    expect(saved.status).toBe(200);
    const listId = saved.body.id as string;
    const itemId = saved.body.items[0].id as string;

    const calls: Array<[string, string, unknown?]> = [
      ['PATCH', `/api/medschools/me/tracker/applications/${appId}`, { notes: 'hijack' }],
      ['DELETE', `/api/medschools/me/tracker/applications/${appId}`],
      ['PUT', `/api/medschools/me/tracker/applications/${appId}/milestones/SECONDARY`, { date: dayAgo(9) }],
      ['DELETE', `/api/medschools/me/tracker/applications/${appId}/milestones/INTERVIEW`],
      ['PATCH', `/api/medschools/me/lists/${listId}`, { name: 'hijack' }],
      ['DELETE', `/api/medschools/me/lists/${listId}`],
      ['PATCH', `/api/medschools/me/lists/${listId}/items/${itemId}`, { note: 'hijack' }],
      ['DELETE', `/api/medschools/me/lists/${listId}/items/${itemId}`],
      ['PUT', `/api/medschools/me/lists/${listId}/item-order`, { ids: [itemId] }],
      ['POST', `/api/medschools/me/lists/${listId}/add-to-tracker`, {}],
      ['POST', '/api/medschools/me/list-items', { schoolSlug: PRIVATE_DO_SLUG, listId }],
    ];
    for (const [method, path, json] of calls) {
      const res = await b.client.request(method, path, { json });
      expect(res.status, `${method} ${path}`).toBe(404);
    }

    const tracker = await a.client.get(`/api/medschools/me/tracker?cycle=${CYCLE}`);
    const app = tracker.body.cycle.applications.find((x: { id: string }) => x.id === appId);
    expect(app.notes).toBeNull();
    expect(app.milestones.map((m: { type: string }) => m.type)).toEqual(['INTERVIEW']);
    const lists = await a.client.get('/api/medschools/me/lists');
    const mine = lists.body.lists.find((l: { id: string }) => l.id === listId);
    expect(mine.name).toBe('A list');
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].note).toBeNull();
    // b never saw a's data in its own reads either.
    expect(JSON.stringify((await b.client.get('/api/medschools/me/lists')).body)).not.toContain(listId);
    await a.client.delete(`/api/medschools/me/lists/${listId}`);
    await a.client.delete(`/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
  });
});

/* --------------------------- concurrency --------------------------- */

describe('rapid mixed writes from two clients converge', () => {
  it('leaves events equal to the shareable milestones under the final flag, and counts equal to their grouping', async () => {
    expect((await putCycle(a, true)).status).toBe(200);
    const appId = await addApp(a, PRIVATE_DO_SLUG);
    const second = new Client(a.client.cookies);
    const types = ['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE', 'SUBMITTED'];
    const ops: Array<Promise<unknown>> = [];
    for (let i = 0; i < 20; i += 1) {
      const m = i % 2 === 0 ? a.client : second;
      const type = types[i % types.length];
      const day = dayAgo(2 + (i % 5));
      if (i % 5 === 0)
        ops.push(
          m.request('PUT', '/api/medschools/me/tracker/cycle', {
            json: { cycleYear: CYCLE, shareAnonymously: i % 10 === 0 },
          }),
        );
      else if (i % 7 === 3) ops.push(m.delete(`/api/medschools/me/tracker/applications/${appId}/milestones/${type}`));
      else
        ops.push(
          m.request('PUT', `/api/medschools/me/tracker/applications/${appId}/milestones/${type}`, {
            json: { date: day },
          }),
        );
    }
    const results = (await Promise.all(ops)) as Array<{ status: number }>;
    for (const r of results) expect([200, 404, 429]).toContain(r.status);

    const check = async () => {
      const cyc = await db().query(
        `select "shareAnonymously" as s from med_tracker_cycle where "userId" = $1 and "cycleYear" = $2`,
        [a.id, CYCLE],
      );
      const sharing = cyc.rows[0].s as boolean;
      const ms = await db().query(
        `select mi.id, mi.type::text as type from med_tracker_milestone mi
           join med_tracker_application ap on ap.id = mi."applicationId"
           join med_tracker_cycle c on c.id = ap."cycleId" where c."userId" = $1`,
        [a.id],
      );
      const want = sharing
        ? ms.rows
            .filter((m) => m.type !== 'SUBMITTED' && m.type !== 'COMPLETE')
            .map((m) => createHmac('sha256', SECRET).update(`RMH:milestone:${m.id}`).digest('hex'))
        : [];
      const have = await db().query(
        `select "dedupeHash" as h from med_cycle_event where "schoolId" = $1 and source = 'RMH'`,
        [PRIVATE_DO_ID],
      );
      if (
        [...want].sort().join() !==
        have.rows
          .map((r) => r.h)
          .sort()
          .join()
      )
        return null;
      const r = await rmhRecompute(PRIVATE_DO_ID);
      return JSON.stringify(r.fromCounts) === JSON.stringify(r.fromEvents) ? true : null;
    };
    await eventually(check, 8_000);
    await a.client.delete(`/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
    expect(await rmhEventCount(PRIVATE_DO_ID)).toBe(0);
  });
});

/* --------------------------- lists and preferences --------------------------- */

describe('lists and preferences', () => {
  it('creates one default list under two simultaneous first saves', async () => {
    const [x, y] = await Promise.all([
      c.client.post('/api/medschools/me/list-items', { schoolSlug: PRIVATE_MD_SLUG }),
      c.client.post('/api/medschools/me/list-items', { schoolSlug: PRIVATE_DO_SLUG }),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    const lists = (await c.client.get('/api/medschools/me/lists')).body.lists;
    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe('My schools');
    expect(lists[0].items).toHaveLength(2);
    await c.client.delete(`/api/medschools/me/lists/${lists[0].id}`);
  });

  it('creates, renames, reorders, saves, notes and removes', async () => {
    const one = (await b.client.post('/api/medschools/me/lists', { name: 'First' })).body;
    const two = (await b.client.post('/api/medschools/me/lists', { name: 'Second' })).body;
    expect(
      (await b.client.request('PATCH', `/api/medschools/me/lists/${one.id}`, { json: { name: 'Renamed' } })).body.name,
    ).toBe('Renamed');
    const order = await b.client.request('PUT', '/api/medschools/me/list-order', { json: { ids: [two.id, one.id] } });
    expect(order.body.lists.map((l: { name: string }) => l.name)).toEqual(['Second', 'Renamed']);
    // A body with a foreign id or a duplicate is refused, not half-applied.
    const stale = await b.client.request('PUT', '/api/medschools/me/list-order', {
      json: { ids: [two.id, 'not-mine'] },
    });
    expect(stale.status).toBeGreaterThanOrEqual(400);
    expect(stale.status).toBeLessThan(500);

    const s1 = await b.client.post('/api/medschools/me/list-items', {
      schoolSlug: PRIVATE_MD_SLUG,
      listId: one.id,
      program: 'REG',
    });
    expect(s1.status).toBe(200);
    await b.client.post('/api/medschools/me/list-items', {
      schoolSlug: PRIVATE_MD_SLUG,
      listId: one.id,
      program: 'PHD',
    });
    const s3 = await b.client.post('/api/medschools/me/list-items', { schoolSlug: PRIVATE_DO_SLUG, listId: one.id });
    expect(s3.body.items).toHaveLength(3);
    // Saving the same item twice adds nothing.
    const again = await b.client.post('/api/medschools/me/list-items', { schoolSlug: PRIVATE_DO_SLUG, listId: one.id });
    expect(again.body.items).toHaveLength(3);
    const item = s3.body.items[0];
    const noted = await b.client.request('PATCH', `/api/medschools/me/lists/${one.id}/items/${item.id}`, {
      json: { note: 'Ask about <b>research</b>' },
    });
    expect(noted.status).toBe(200);
    expect(noted.body.items.find((i: { id: string }) => i.id === item.id).note).toBe('Ask about <b>research</b>');
    const removed = await b.client.delete(`/api/medschools/me/lists/${one.id}/items/${item.id}`);
    expect(removed.body.items).toHaveLength(2);
    // The response never carries a user id.
    expect(JSON.stringify(removed.body)).not.toContain(b.id);
    await b.client.delete(`/api/medschools/me/lists/${one.id}`);
    await b.client.delete(`/api/medschools/me/lists/${two.id}`);
  });

  it('answers the 21st list and the 201st item with a 409', async () => {
    const own = (await b.client.get('/api/medschools/me/lists')).body.lists as unknown[];
    for (let i = own.length; i < 20; i += 1) {
      await db().query(
        `insert into med_school_list (id, "userId", name, position, "updatedAt") values ($1, $2, $3, $4, now())`,
        [randomUUID(), b.id, `Filler list ${i}`, i],
      );
    }
    const over = await b.client.post('/api/medschools/me/lists', { name: 'One too many' });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('MEDSCHOOLS_LIST_CAP');
    await db().query('delete from med_school_list where "userId" = $1', [b.id]);

    const fill = await seedFillerSchools(67);
    const list = (await b.client.post('/api/medschools/me/lists', { name: 'Full' })).body;
    let n = 0;
    for (const id of fill) {
      for (const program of ['ANY', 'REG', 'PHD']) {
        if (n >= 200) break;
        await db().query(
          `insert into med_school_list_item (id, "listId", "schoolId", program, position) values ($1, $2, $3, $4::"MedListProgram", $5)`,
          [randomUUID(), list.id, id, program, n],
        );
        n += 1;
      }
    }
    const full = await b.client.post('/api/medschools/me/list-items', { schoolSlug: PRIVATE_MD_SLUG, listId: list.id });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('MEDSCHOOLS_ITEM_CAP');
    await db().query('delete from med_school_list where "userId" = $1', [b.id]);
  });

  it('round-trips preferences and applies them to the server-rendered index only for that member', async () => {
    const put = await c.client.request('PUT', '/api/medschools/me/prefs', {
      json: { programs: ['md-phd'], homeState: null, chartCategories: ['INTERVIEW', 'ACCEPTANCE'] },
    });
    expect(put.status).toBe(200);
    const got = (await c.client.get('/api/medschools/me/prefs')).body;
    expect(got.programs).toEqual(['md-phd']);
    expect(got.chartCategories).toEqual(['INTERVIEW', 'ACCEPTANCE']);
    expect(JSON.stringify(got)).not.toContain(c.id);

    const signedIn = String((await c.client.get('/rmh-medschool')).body);
    const signedOut = String((await anon.get('/rmh-medschool')).body);
    // The program toggles are aria-pressed buttons; the member's preference narrows them, the public default does not.
    const pressed = (html: string) =>
      Object.fromEntries(
        [...html.matchAll(/aria-pressed="(true|false)"[^>]*><span[^>]*>(MD|MD-PhD|DO|DO-PhD)<\/span>/g)].map((m) => [
          m[2],
          m[1],
        ]),
      );
    expect(pressed(signedIn)).toEqual({ MD: 'false', 'MD-PhD': 'true', DO: 'false', 'DO-PhD': 'false' });
    expect(pressed(signedOut)).toEqual({ MD: 'true', 'MD-PhD': 'true', DO: 'true', 'DO-PhD': 'true' });
    await c.client.request('PUT', '/api/medschools/me/prefs', {
      json: { programs: ['md', 'md-phd', 'do', 'do-phd'], homeState: null, chartCategories: [] },
    });
  });
});

/* --------------------------- public reads that gained parts --------------------------- */

describe('the public arrivals and live endpoints', () => {
  it('pins the arrivals key set (aggregates only, no person or time of one event)', async () => {
    await seedMedSchoolsFixture();
    const res = await anon.get(fresh(`/api/medschools/schools/${MEDSCHOOL_FIXTURE_SLUG}/arrivals`));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'cycles',
      'eventType',
      'hours',
      'program',
      'total',
      'weekdays',
      'zone',
    ]);
    expect(res.body.weekdays.length === 7 || res.body.weekdays.length === 0).toBe(true);
    expect(res.body.hours.length === 24 || res.body.hours.length === 0).toBe(true);
    for (const cyc of res.body.cycles)
      expect(Object.keys(cyc).sort()).toEqual(['count', 'cycleYear', 'firstOn', 'medianOn']);
    const text = JSON.stringify(res.body);
    for (const f of ['dedupeHash', 'ingestedAt', 'occurredAt', 'contributors', 'RMH']) expect(text).not.toContain(f);
    expect((await anon.get(`/api/medschools/schools/does-not-exist/arrivals`)).status).toBe(404);
  });

  it('pins the live key set with q, state, types and programs', async () => {
    for (const query of [
      'q=fixture',
      'q=NC',
      'state=NC',
      'types=interview,acceptance',
      'programs=md',
      'programs=md-phd,do',
    ]) {
      const res = await anon.get(fresh(`/api/medschools/live?${query}&limit=100`));
      expect(res.status, query).toBe(200);
      expect(Object.keys(res.body).sort(), query).toEqual(['asOf', 'events', 'nextCursor']);
      for (const e of res.body.events) {
        expect(Object.keys(e).sort(), query).toEqual([
          'eventType',
          'id',
          'occurredAt',
          'program',
          'school',
          'source',
          'wave',
        ]);
        expect(Object.keys(e.school).sort(), query).toEqual(['city', 'degree', 'name', 'shortName', 'slug', 'state']);
        expect(['ADMIT', 'SDN']).toContain(e.source);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/dedupeHash|ingestedAt|contributors|RMH/);
    }
    const hit = await anon.get(fresh('/api/medschools/live?q=fixture&limit=100'));
    expect(hit.body.events.length).toBeGreaterThan(0);
    expect(hit.body.events.every((e: { school: { slug: string } }) => e.school.slug === MEDSCHOOL_FIXTURE_SLUG)).toBe(
      true,
    );
    const miss = await anon.get(fresh('/api/medschools/live?q=zzz-no-such-school&limit=100'));
    expect(miss.body.events).toEqual([]);
    for (const bad of ['q=' + 'x'.repeat(200), 'types=nonsense', 'programs=md,xx', 'state=zz']) {
      expect((await anon.get(fresh(`/api/medschools/live?${bad}`))).status, bad).toBeLessThan(500);
    }
  });
});

/* --------------------------- phase 5: the personal invite chance --------------------------- */

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

const CHANCE_KEYS = [
  'applicationId',
  'asOf',
  'basis',
  'completeOn',
  'invitedOn',
  'points',
  'program',
  'school',
  'status',
];

describe('the personal invite chance (me/chances)', () => {
  let memberDates: string[] = [];
  const chances = async (m: Member) => {
    const res = await m.client.get('/api/medschools/me/chances');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res;
  };

  beforeAll(async () => {
    // Start from empty trackers for the three members (earlier sections left cycles behind), then give alice and bob a
    // waiting application at the DO fixture school; neither shares, so neither feeds the curve.
    for (const m of [a, b, c]) await m.client.request('DELETE', `/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
    for (const [m, ago] of [
      [a, 40],
      [b, 33],
    ] as const) {
      expect((await putCycle(m, false)).status).toBe(200);
      const app = await addApp(m, PRIVATE_DO_SLUG, 'REG');
      expect((await putMilestone(m, app, 'COMPLETE', dayAgo(ago))).status).toBe(200);
    }
    // 19 other members who share, at the same school and program: one under the floor of 20.
    memberDates = await seedSharingMembers(PRIVATE_DO_ID, CYCLE, 19);
    await runForecastJob();
  });

  it('is 401 for a signed-out visitor with no public cache header', async () => {
    const res = await anon.get('/api/medschools/me/chances');
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage/i);
    expect(res.headers.get('etag')).toBeNull();
  });

  it('answers a signed-in read privately, with the pinned key sets', async () => {
    const res = await chances(a);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).not.toMatch(/public|s-maxage/i);
    expect(res.headers.get('etag')).toBeNull();
    expect(Object.keys(res.body).sort()).toEqual(['chances', 'cycleYear']);
    expect(res.body.cycleYear).toBe(CYCLE);
    expect(res.body.chances).toHaveLength(1);
    const [one] = res.body.chances;
    expect(Object.keys(one).sort()).toEqual(CHANCE_KEYS);
    expect(Object.keys(one.school).sort()).toEqual(['active', 'name', 'shortName', 'slug']);
    expect(one.completeOn).toBe(dayAgo(40));
  });

  it('is thin with 19 sharing members and an estimate with 20 (the floor counts distinct members)', async () => {
    const thin = (await chances(a)).body.chances[0];
    expect(thin.status).toBe('thin');
    expect(thin.points).toEqual([]);
    expect(thin.basis).toBeNull();
    expect(await waitCurveRow(PRIVATE_DO_ID)).toBeNull();

    memberDates = [...memberDates, ...(await seedSharingMembers(PRIVATE_DO_ID, CYCLE, 1, 19))];
    await runForecastJob();
    const est = (await chances(a)).body.chances[0];
    expect(est.status).toBe('estimate');
    expect(est.basis).toBe(20);
    expect(est.asOf).toBe(dayAgo(1));
    expect(est.points.length).toBeGreaterThan(0);
    let prev = -1;
    for (const p of est.points) {
      expect(Object.keys(p).sort()).toEqual(['on', 'percent']);
      expect(p.percent % 5).toBe(0); // R13: the chance is shown in steps of 5
      expect(Number.isInteger(p.percent)).toBe(true);
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
      expect(p.percent).toBeGreaterThanOrEqual(prev);
      expect(p.on > dayAgo(0)).toBe(true);
      prev = p.percent;
    }
    // Only horizons whose week still has 10 members at risk are shown (R13): with this fixture that is the nearest ones.
    // Late invites exist in the fixture past alice's 39 days, so the chance does rise.
    expect(est.points[est.points.length - 1].percent).toBeGreaterThan(0);
  });

  it("never carries another member's dates: bob sees his own and not alice's, and nobody sees a sharer's", async () => {
    const [mine, theirs] = [await chances(a), await chances(b)];
    expect(theirs.body.chances[0].completeOn).toBe(dayAgo(33));
    expect(JSON.stringify(theirs.body)).not.toContain(dayAgo(40));
    expect(JSON.stringify(mine.body)).not.toContain(dayAgo(33));
    for (const res of [mine, theirs]) {
      const text = JSON.stringify(res.body);
      for (const d of memberDates) expect(text, d).not.toContain(d);
      expect(text).not.toMatch(/it-medschools-sharer|userId|dedupeHash|members"/);
    }
    // carol has no application: an empty answer, not an error.
    expect((await chances(c)).body.chances).toEqual([]);
    // A school filter naming a school she did not apply to answers empty, for any member.
    const other = await a.client.get(`/api/medschools/me/chances?school=${PRIVATE_MD_SLUG}`);
    expect(other.status).toBe(200);
    expect(other.body.chances).toEqual([]);
  });

  it('stores a curve with no column that could hold a person, only t, s and the at-risk counts', async () => {
    const cols = await waitCurveColumns();
    expect(cols).toEqual(['id', 'schoolId', 'program', 'asOf', 'computedAt', 'members', 'invited', 'maxDay', 'curve']);
    expect(cols.join(' ')).not.toMatch(/user|member_?id|email|application/i);
    const row = await waitCurveRow(PRIVATE_DO_ID);
    expect(row).not.toBeNull();
    expect(Object.keys(row!.curve as object).sort()).toEqual(['n', 's', 't']);
    // Weekly bins (R13): every step sits on a multiple of 7, whatever days the members completed on.
    for (const t of (row!.curve as { t: number[] }).t) expect(t % 7).toBe(0);
    expect(row!.invited as number).toBeGreaterThanOrEqual(10);
    expect(row!.members).toBe(20);
  });

  it('drops back to thin when one member turns sharing off and the job runs again', async () => {
    await setSharerSharing(0, false);
    await runForecastJob();
    expect((await chances(a)).body.chances[0].status).toBe('thin');
    expect(await waitCurveRow(PRIVATE_DO_ID)).toBeNull();
    await setSharerSharing(0, true);
  });

  it('says nothing for a closed application and "invited" for one that has its invite', async () => {
    const app = (await a.client.get('/api/medschools/me/tracker')).body.cycle.applications[0].id as string;
    expect((await putMilestone(a, app, 'INTERVIEW', dayAgo(5))).status).toBe(200);
    const invited = (await chances(a)).body.chances[0];
    expect(invited.status).toBe('invited');
    expect(invited.invitedOn).toBe(dayAgo(5));
    // A rejection with no invite closes the application: bob's gets no line at all.
    const bobApp = (await b.client.get('/api/medschools/me/tracker')).body.cycle.applications[0].id as string;
    expect((await putMilestone(b, bobApp, 'REJECTION', dayAgo(2))).status).toBe(200);
    expect((await chances(b)).body.chances[0].status).toBe('closed');
  });

  describe('what a curve may reveal (R13)', () => {
    const rebuild = async () => {
      await setSharerSharing(0, true);
      await runForecastJob();
    };
    const sharerInvites = () =>
      db().query(
        `select count(*)::int as n from med_tracker_milestone where type = 'INTERVIEW' and id like 'it-medschools-sharer-%'`,
      );

    it('refreshes only after at least 3 more members or invites: one new sharer changes nothing, three do', async () => {
      await rebuild();
      const first = await waitCurveRow(PRIVATE_DO_ID);
      expect(first).not.toBeNull();
      expect(first!.members).toBe(20);
      // Sharer 20 would be invited (20 % 3 = 2 waits, so the fixture leaves them waiting): +1 member, no new invite.
      await seedSharingMembers(PRIVATE_DO_ID, CYCLE, 1, 20);
      await runForecastJob();
      const same = await waitCurveRow(PRIVATE_DO_ID);
      expect(same!.members).toBe(20);
      expect(same!.curve).toEqual(first!.curve);
      expect(same!.computedAt).toEqual(first!.computedAt);
      // Two more: members 23, a difference of 3 from the stored row, so it is rebuilt.
      await seedSharingMembers(PRIVATE_DO_ID, CYCLE, 2, 21);
      await runForecastJob();
      expect((await waitCurveRow(PRIVATE_DO_ID))!.members).toBe(23);
    });

    it('needs at least 10 invites on top of the members: with fewer, the curve is deleted at once', async () => {
      expect(await waitCurveRow(PRIVATE_DO_ID)).not.toBeNull();
      const before = (await sharerInvites()).rows[0].n as number;
      expect(before).toBeGreaterThanOrEqual(10);
      // Take the sharers' invites away until 9 remain: 23 members, 9 invites.
      await db().query(
        `delete from med_tracker_milestone where id in (
           select id from med_tracker_milestone where type = 'INTERVIEW' and id like 'it-medschools-sharer-%' order by id limit $1)`,
        [before - 9],
      );
      await runForecastJob();
      expect(await waitCurveRow(PRIVATE_DO_ID)).toBeNull();
    });
  });
});

/* --------------------------- secondaries: the essay overlap (me/**) --------------------------- */

describe('the essay overlap', () => {
  const OVERLAP = '/api/medschools/me/secondaries/overlap';
  let listId = '';

  beforeAll(async () => {
    await seedMedSchoolsFixture();
    await seedSecondariesFixture({ mdId: PRIVATE_MD_ID });
    for (const m of [a, b]) await m.client.request('DELETE', `/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
    const first = await a.client.post('/api/medschools/me/list-items', {
      schoolSlug: MEDSCHOOL_FIXTURE_SLUG,
      newListName: 'Alice secret reach list',
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    listId = first.body.id as string;
    await a.client.post('/api/medschools/me/list-items', { schoolSlug: PRIVATE_MD_SLUG, listId });
  });
  afterAll(async () => {
    await a.client.delete(`/api/medschools/me/lists/${listId}`);
  });

  it('is 401 without a session and never publicly cached', async () => {
    const res = await anon.get(`${OVERLAP}?source=list&list=${listId}`);
    expect(res.status).toBe(401);
    const ok = await a.client.get(`${OVERLAP}?source=list&list=${listId}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage/i);
    expect(ok.headers.get('etag')).toBeNull();
  });

  it("groups the list's schools by theme with a pinned key set and no list name or id", async () => {
    const res = await a.client.get(`${OVERLAP}?source=list&list=${listId}`);
    expect(Object.keys(res.body).sort()).toEqual(['cycleYear', 'groups', 'schoolCount', 'source', 'withoutPrompts']);
    expect(res.body.schoolCount).toBe(2);
    const diversity = res.body.groups.find((g: { theme: string }) => g.theme === 'diversity');
    expect(diversity).toMatchObject({ schools: 2, shortestWords: 250, longestWords: 300 });
    expect(Object.keys(diversity).sort()).toEqual(['entries', 'longestWords', 'schools', 'shortestWords', 'theme']);
    for (const e of diversity.entries)
      expect(Object.keys(e).sort()).toEqual(
        ['basis', 'limit', 'optional', 'program', 'promptId', 'schoolName', 'slug', 'text'].sort(),
      );
    expect(diversity.entries.map((e: { text: string }) => e.text).sort()).toEqual(
      [SECONDARIES_TEXT.diversityA, SECONDARIES_TEXT.diversityB].sort(),
    );
    const text = JSON.stringify(res.body);
    for (const f of [listId, 'Alice secret reach list', a.id, 'userId', 'position', 'note'])
      expect(text).not.toContain(f);
  });

  it("another member's list is a 404 with the same body as an unknown id, and bob never sees alice's data", async () => {
    const foreign = await b.client.get(`${OVERLAP}?source=list&list=${listId}`);
    const unknown = await b.client.get(`${OVERLAP}?source=list&list=does-not-exist`);
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(unknown.body));
    const own = await b.client.get(`${OVERLAP}?source=tracker`);
    expect(own.status).toBe(200);
    const text = JSON.stringify(own.body);
    expect(text).not.toContain('Alice secret reach list');
    expect(own.body.groups).toEqual([]);
  });

  it('rejects a list source with no list and a tracker source with one', async () => {
    expect((await a.client.get(`${OVERLAP}?source=list`)).status).toBe(400);
    expect((await a.client.get(`${OVERLAP}?source=tracker&list=${listId}`)).status).toBe(400);
    expect((await a.client.get(`${OVERLAP}`)).status).toBe(400);
  });

  it("the tracker source reads the caller's current-cycle schools only", async () => {
    expect((await putCycle(a, false)).status).toBe(200);
    expect((await putCycle(b, false)).status).toBe(200);
    await addApp(a, MEDSCHOOL_FIXTURE_SLUG);
    await addApp(b, PRIVATE_MD_SLUG);
    const mine = await a.client.get(`${OVERLAP}?source=tracker`);
    expect(mine.status).toBe(200);
    expect(mine.body.source).toBe('tracker');
    expect(mine.body.schoolCount).toBe(1);
    const slugs = mine.body.groups.flatMap((g: { entries: { slug: string }[] }) => g.entries.map((e) => e.slug));
    expect(new Set(slugs)).toEqual(new Set([MEDSCHOOL_FIXTURE_SLUG]));
    // No application this cycle is an empty 200, never an error.
    await a.client.request('DELETE', `/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
    const none = await a.client.get(`${OVERLAP}?source=tracker`);
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ groups: [], schoolCount: 0, withoutPrompts: [] });
  });
});

/* --------------------------- secondaries: turnaround (received -> submitted) --------------------------- */

describe('secondary turnaround', () => {
  const publicTurnaround = async () => {
    const res = await anon.get(fresh(`/api/medschools/schools/${PRIVATE_MD_SLUG}/secondaries`));
    expect(res.status).toBe(200);
    return res.body.turnaround as Array<Record<string, unknown>>;
  };

  beforeAll(async () => {
    await removeTurnaroundMembers();
  });

  it('shows no figure under 20 sharing members and one at 20, with counts and whole days only', async () => {
    await seedTurnaroundMembers(PRIVATE_MD_ID, CYCLE, 19);
    await runForecastJob();
    expect(await turnaroundRows(PRIVATE_MD_ID)).toHaveLength(0);
    expect(await publicTurnaround()).toEqual([]);

    await seedTurnaroundMembers(PRIVATE_MD_ID, CYCLE, 1, 19);
    await runForecastJob();
    const rows = await turnaroundRows(PRIVATE_MD_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ program: 'REG', members: 20 });
    const shown = await publicTurnaround();
    expect(shown).toHaveLength(1);
    expect(Object.keys(shown[0]!).sort()).toEqual(['asOf', 'medianDays', 'members', 'p25Days', 'p75Days', 'program']);
    expect(shown[0]!.members).toBe(20);
    for (const k of ['medianDays', 'p25Days', 'p75Days']) expect(Number.isInteger(shown[0]![k])).toBe(true);
    expect(shown[0]!.medianDays as number).toBeGreaterThanOrEqual(3);
    expect(shown[0]!.medianDays as number).toBeLessThanOrEqual(11);
    expect(JSON.stringify(shown)).not.toMatch(/it-medschools-turn|userId|receivedOn|submittedOn/);
  });

  it('stores no column that could hold a person or a date of one contribution', async () => {
    const cols = await turnaroundColumns();
    expect(cols).toEqual([
      'id',
      'schoolId',
      'program',
      'asOf',
      'computedAt',
      'members',
      'p25Days',
      'medianDays',
      'p75Days',
    ]);
    expect(cols.join(' ')).not.toMatch(/user|member_?id|email|application|date/i);
  });

  it('refreshes only after at least 3 more members: two new ones change nothing, three do', async () => {
    const before = (await turnaroundRows(PRIVATE_MD_ID))[0]!;
    await seedTurnaroundMembers(PRIVATE_MD_ID, CYCLE, 2, 20);
    await runForecastJob();
    const same = (await turnaroundRows(PRIVATE_MD_ID))[0]!;
    expect(same.members).toBe(20);
    expect(same.computedAt).toEqual(before.computedAt);
    await seedTurnaroundMembers(PRIVATE_MD_ID, CYCLE, 1, 22);
    await runForecastJob();
    expect((await turnaroundRows(PRIVATE_MD_ID))[0]!.members).toBe(23);
  });

  it('removes the figure at once when members turn sharing off and the count falls under 20', async () => {
    for (const i of [0, 1, 2, 3, 4]) await setTurnaroundSharing(i, false);
    await runForecastJob();
    expect(await turnaroundRows(PRIVATE_MD_ID)).toHaveLength(0);
    expect(await publicTurnaround()).toEqual([]);
  });

  it('SECONDARY_SUBMITTED is accepted privately and never becomes a public event; SECONDARY does', async () => {
    expect((await putCycle(a, true)).status).toBe(200);
    const appId = await addApp(a, PRIVATE_MD_SLUG);
    const before = await rmhEventCount(PRIVATE_MD_ID);
    expect((await putMilestone(a, appId, 'SECONDARY_SUBMITTED', dayAgo(4))).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(before);
    expect((await putMilestone(a, appId, 'SECONDARY', dayAgo(9))).status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(before + 1);
    await a.client.request('DELETE', `/api/medschools/me/tracker/cycle?cycleYear=${CYCLE}`);
  });
});
