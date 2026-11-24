/**
 * RMH Med Schools tracker import, black box (owner 2026-11-23).
 *
 * Runs against a RUNNING app (see `medschools-ask.test.ts`): the model-dependent cases need the fake provider on
 * `INTEGRATION_AI_FAKE_PORT` (the app is started with `DEEPSEEK_API_KEY=integration-fake` and `DEEPSEEK_BASE_URL` at it)
 * and the sharing case needs `MEDSCHOOLS_DEDUPE_SECRET` in both the app and this process.
 *
 * What it proves: signed out is 401 with no public cache header; a pasted text and an uploaded file read into the same
 * preview and write nothing; save writes only the rows it is sent, through share-sync (a date is shared only when the
 * cycle's sharing is already on, and only the shareable types); a conflicting date is kept unless it is ticked; a school
 * that is not an active school is `invalid` and a body naming a user or an application is refused; an import is one of
 * the day's questions (the cap stops it before any model call); a date the model invented (not in the text) is dropped;
 * and nothing of the file (its text, its name, the essay in it) is in any row of any table.
 *
 * It signs up no one and borrows no one from the global cast: the roles are fresh members (`lib/fresh-member.ts`, made 30
days old for sharing), so the `ai` rate-limit buckets, daily-cap rows, leases and tier caches the other files filled for
alice, bob and carol are not this file's (a imports, b has an import of his own, c is the cap's).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import { createFreshMember, removeFreshMembers, type FreshMember } from './lib/fresh-member';
import { startFakeDeepseek, userJson, type FakeCall, type FakeDeepseek, type FakeScript } from './lib/fake-deepseek';
import {
  PRIVATE_MD_ID,
  PRIVATE_MD_SLUG,
  removeTrackerFixture,
  rmhEventCount,
  seedFillerSchools,
  seedTrackerFixture,
} from './lib/medschools-fixture';

const PORT = Number(process.env.INTEGRATION_AI_FAKE_PORT ?? 0);
const SECRET = process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '';
const PARSE = '/api/medschools/me/tracker/import/parse';
const SAVE = '/api/medschools/me/tracker/import/save';
const ASK = '/api/medschools/me/ask';
const TRACKER = '/api/medschools/me/tracker';
const NOT_PUBLIC = /public|s-maxage|max-age=[1-9]/i;
const DAY = 86_400_000;

type Member = FreshMember;
let a: Member;
let b: Member;
let c: Member;
const anon = new Client();

/** A calendar day `ago` days before now, so every date is real, in the window and not in the future whenever this runs. */
const dayAgo = (ago: number) => new Date(Date.now() - ago * DAY).toISOString().slice(0, 10);
const SUBMITTED = dayAgo(30);
const COMPLETE = dayAgo(20);
const INTERVIEW = dayAgo(10);
const NOT_IN_FILE = dayAgo(5);

/** Words only this file holds: if any appears in any row of any table, the file was kept. */
const ESSAY = 'zebraquill-essay-sentence';
const FILENAME = 'zebraquill-notes.txt';
const NAME_FIXTURE = 'Fixture University School of Medicine';
const NAME_PRIVATE = 'Tracker Fixture School of Medicine';

const TEXT = [
  `${NAME_FIXTURE} | submitted | ${SUBMITTED}`,
  `${NAME_FIXTURE} | complete | ${COMPLETE}`,
  `${NAME_FIXTURE} | interview | ${INTERVIEW}`,
  `${NAME_PRIVATE} | submitted | ${SUBMITTED}`,
  `Unknown Academy of Healing | submitted | ${SUBMITTED}`,
  `Essay: ${ESSAY} I want to be a doctor because of my grandmother.`,
].join('\n');

interface Preview {
  cycleYear: number;
  dropped: number;
  rows: { key: string; schoolName: string; school: { slug: string } | null; milestones: { type: string; date: string }[] }[];
  remainingToday: number | null;
  dailyCap: number | null;
  code?: string;
}
interface Saved {
  added: number;
  overwritten: number;
  unchanged: number;
  conflicts: number;
  invalid: number;
  schoolsAdded: number;
  code?: string;
}
interface TrackerBody {
  cycle: { cycleYear: number; applications: { school: { slug: string }; milestones: { type: string; date: string }[] }[] } | null;
}

/** What the model returns for TEXT: every date quoted from the text, plus one it made up and a note that must go nowhere. */
const modelReply: FakeScript = (call: FakeCall) => ({
  rows: [
    {
      schoolName: NAME_FIXTURE,
      program: 'MD',
      milestones: [
        { type: 'SUBMITTED', date: SUBMITTED, raw: SUBMITTED },
        { type: 'COMPLETE', date: COMPLETE, raw: COMPLETE },
        { type: 'INTERVIEW', date: INTERVIEW, raw: INTERVIEW },
        // Invented: the date is not in the text anywhere.
        { type: 'SECONDARY', date: NOT_IN_FILE, raw: NOT_IN_FILE },
      ],
    },
    { schoolName: NAME_PRIVATE, milestones: [{ type: 'SUBMITTED', date: SUBMITTED, raw: SUBMITTED }] },
    { schoolName: 'Unknown Academy of Healing', milestones: [{ type: 'SUBMITTED', date: SUBMITTED, raw: SUBMITTED }] },
  ],
  cycleHint: null,
  notes: `${ESSAY} ${call.system.length}`,
});

const clearLedger = (ids: string[]) =>
  db().query(`delete from ai_usage where task = any($1) and ("userId" = any($2) or "userId" is null)`, [
    ['medschools-qa', 'medschools-import'],
    ids,
  ]);
const insertAskRows = async (userId: string, n: number) => {
  for (let i = 0; i < n; i += 1) {
    await db().query(
      `insert into ai_usage ("userId", task, provider, model, "promptId", "promptVer", "inTokens", "outTokens", "costMicros", ok, "createdAt")
       values ($1, 'medschools-qa', 'deepseek', 'fake', 'medschools-qa-ask', 1, 1, 1, 0, true, now())`,
      [userId],
    );
  }
};
const parseText = (m: Member, text = TEXT) => m.client.post<Preview>(PARSE, { text });
const parseFile = (m: Member, name = FILENAME, type = 'text/plain', text = TEXT) => {
  const form = new FormData();
  form.append('file', new File([text], name, { type }));
  return m.client.postForm<Preview>(PARSE, form);
};
const tracker = async (m: Member, cycle: number) =>
  (await m.client.get<TrackerBody>(`${TRACKER}?cycle=${cycle}`)).body;
const wipe = (ids: string[]) => db().query('delete from med_tracker_cycle where "userId" = any($1)', [ids]);
const rowFor = (p: Preview, slug: string) => p.rows.find((r) => r.school?.slug === slug);

beforeAll(async () => {
  // Sharing needs an account at least 7 days old.
  const old = new Date(Date.now() - 30 * DAY);
  a = await createFreshMember('import-a', { createdAt: old });
  b = await createFreshMember('import-b', { createdAt: old });
  c = await createFreshMember('import-c', { createdAt: old });
  await seedTrackerFixture([a.id, b.id, c.id]);
});
afterAll(async () => {
  const ids = [a?.id, b?.id, c?.id].filter((x): x is string => !!x);
  if (ids.length) {
    await clearLedger(ids);
    await removeTrackerFixture(ids);
  }
  await removeFreshMembers([a, b, c]);
  await closeDb();
});

describe('tracker import: no model needed', () => {
  it('signed out: parse (paste and file) and save are 401, with no public cache header and no data', async () => {
    const form = new FormData();
    form.append('file', new File(['x 2026-01-01'], 'a.txt', { type: 'text/plain' }));
    const responses = [
      await anon.post(PARSE, { text: TEXT }),
      await anon.postForm(PARSE, form),
      await anon.post(SAVE, { cycleYear: 2027, rows: [] }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
      expect(JSON.stringify(res.body)).not.toMatch(/rows|slug|milestones/);
    }
  });

  it('save validates the body: another member, an application or an unknown key is 400, nothing is written', async () => {
    const good = { slug: PRIVATE_MD_SLUG, program: 'REG', milestones: [{ type: 'SUBMITTED', date: SUBMITTED, overwrite: false }] };
    const bodies: unknown[] = [
      { cycleYear: 2027, userId: b.id, rows: [good] },
      { cycleYear: 2027, rows: [{ ...good, applicationId: 'x' }] },
      { cycleYear: 2027, rows: [{ ...good, slug: 'Not A Slug!' }] },
      { cycleYear: 1999, rows: [good] },
      { cycleYear: 2027, rows: [] },
      { cycleYear: 2027, rows: [{ ...good, milestones: [{ type: 'NOPE', date: SUBMITTED, overwrite: false }] }] },
    ];
    for (const body of bodies) {
      const res = await a.client.post(SAVE, body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    const n = await db().query('select count(*)::int as n from med_tracker_cycle where "userId" = $1', [a.id]);
    expect(n.rows[0].n).toBe(0);
  });

  it('save names a school that is not an active school: it is counted invalid and nothing is created', async () => {
    const [inactive] = await seedFillerSchools(1);
    const cycle = Number(new Date().getUTCFullYear()) + 1;
    const res = await a.client.post<Saved>(SAVE, {
      cycleYear: cycle,
      rows: [
        { slug: 'no-such-school', program: 'REG', milestones: [{ type: 'SUBMITTED', date: SUBMITTED, overwrite: false }] },
        { slug: inactive, program: 'REG', milestones: [{ type: 'SUBMITTED', date: SUBMITTED, overwrite: false }] },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ added: 0, schoolsAdded: 0, invalid: 2 });
    expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    const n = await db().query('select count(*)::int as n from med_tracker_application a join med_tracker_cycle c on c.id = a."cycleId" where c."userId" = $1', [a.id]);
    expect(n.rows[0].n).toBe(0);
  });

  it('refuses a file the reader cannot read or that is too large, and a text with no digit, before any model call', async () => {
    const bad = await parseFile(a, 'tool.exe', 'application/x-msdownload', 'MZ');
    expect(bad.status).toBe(415);
    expect(bad.body.code).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    const big = await parseFile(a, 'big.csv', 'text/csv', 'a,b\n'.repeat(900_000));
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('MEDSCHOOLS_IMPORT_TOO_LARGE');
    const none = await parseText(a, 'Harvard, no dates written down yet');
    expect(none.status).toBe(422);
    expect(none.body.code).toBe('MEDSCHOOLS_IMPORT_EMPTY');
  });
});

describe.skipIf(!PORT)('tracker import: with the fake provider', () => {
  let fake: FakeDeepseek;
  const ids = () => [a.id, b.id, c.id];
  const modelCalls = () => fake.calls().filter((x) => userJson(x.user)?.text !== undefined);

  beforeAll(async () => {
    fake = await startFakeDeepseek(PORT, modelReply);
    await clearLedger(ids());
  });
  afterEach(async () => {
    fake.setScript(modelReply);
    fake.reset();
    await new Promise((r) => setTimeout(r, 400));
    await clearLedger(ids());
    await wipe(ids());
  });
  afterAll(async () => {
    await fake?.close();
  });

  it('pasted text and an uploaded file read into the same preview; nothing is written, nothing is cached', async () => {
    const paste = await parseText(a);
    expect(paste.status, JSON.stringify(paste.body)).toBe(200);
    expect(paste.headers.get('cache-control') ?? '').toMatch(/no-store/);
    expect(paste.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    const fixture = rowFor(paste.body, 'it-medschools-fixture');
    expect(fixture?.milestones.map((m) => m.type)).toEqual(['SUBMITTED', 'COMPLETE', 'INTERVIEW']);
    expect(rowFor(paste.body, PRIVATE_MD_SLUG)).toBeDefined();
    // A school that did not match comes back as written, with no school, for the member to pick.
    const unmatched = paste.body.rows.find((r) => r.school === null);
    expect(unmatched?.schoolName).toBe('Unknown Academy of Healing');
    // The invented date is dropped and counted; the model's note never reaches the response.
    expect(paste.body.rows.flatMap((r) => r.milestones).some((m) => m.date === NOT_IN_FILE)).toBe(false);
    expect(paste.body.dropped).toBe(1);
    expect(JSON.stringify(paste.body)).not.toContain(ESSAY);

    const file = await parseFile(a);
    expect(file.status, JSON.stringify(file.body)).toBe(200);
    expect(file.body.rows.map((r) => [r.schoolName, r.milestones.map((m) => m.date)])).toEqual(
      paste.body.rows.map((r) => [r.schoolName, r.milestones.map((m) => m.date)]),
    );

    const written = await db().query('select count(*)::int as n from med_tracker_cycle where "userId" = $1', [a.id]);
    expect(written.rows[0].n).toBe(0);
  });

  it('an import is one of the day\'s questions: it counts, and a spent day stops it before any model call', async () => {
    const before = (await a.client.get<{ remainingToday: number; dailyCap: number }>(ASK)).body;
    const res = await parseText(a);
    expect(res.status).toBe(200);
    expect(res.body.dailyCap).toBe(before.dailyCap);
    expect(res.body.remainingToday).toBe(before.remainingToday - 1);
    expect((await a.client.get<{ remainingToday: number }>(ASK)).body.remainingToday).toBe(before.remainingToday - 1);

    await clearLedger(ids());
    await insertAskRows(c.id, before.dailyCap);
    fake.reset();
    const capped = await parseText(c);
    expect(capped.status).toBe(429);
    expect(capped.body.code).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    expect(modelCalls()).toHaveLength(0);
  });

  it('parse then save writes the ticked rows; an unticked school is not written; the file is in no table', async () => {
    const parsed = await parseFile(a);
    expect(parsed.status, JSON.stringify(parsed.body)).toBe(200);
    const preview = parsed.body;
    const fixture = rowFor(preview, 'it-medschools-fixture')!;
    // The member unticks the private school and the unmatched one: the body simply does not carry them. They also
    // untick the fixture's COMPLETE date.
    const body = {
      cycleYear: preview.cycleYear,
      rows: [
        {
          slug: 'it-medschools-fixture',
          program: 'REG',
          milestones: fixture.milestones
            .filter((m) => m.type !== 'COMPLETE')
            .map((m) => ({ type: m.type, date: m.date, overwrite: false })),
        },
      ],
    };
    const saved = await a.client.post<Saved>(SAVE, body);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    expect(saved.body).toMatchObject({ schoolsAdded: 1, added: 2, overwritten: 0, conflicts: 0, invalid: 0 });

    const t = await tracker(a, preview.cycleYear);
    expect(t.cycle?.applications.map((x) => x.school.slug)).toEqual(['it-medschools-fixture']);
    expect(t.cycle?.applications[0]?.milestones.map((m) => m.type).sort()).toEqual(['INTERVIEW', 'SUBMITTED']);

    // No row of any table holds the file's text, its essay or its name.
    const tables = (await db().query(`select tablename from pg_tables where schemaname = 'public'`)).rows.map(
      (r: { tablename: string }) => r.tablename,
    );
    for (const table of tables) {
      for (const needle of [ESSAY, 'zebraquill', 'grandmother']) {
        const hit = await db().query(`select count(*)::int as n from "${table}" t where t::text ilike $1`, [`%${needle}%`]);
        expect(hit.rows[0].n, `${table} holds "${needle}"`).toBe(0);
      }
    }
  });

  it('a different date already on the tracker is kept unless the row is ticked; the same date changes nothing', async () => {
    const parsed = await parseText(a);
    expect(parsed.status, JSON.stringify(parsed.body)).toBe(200);
    const preview = parsed.body;
    const slug = PRIVATE_MD_SLUG;
    const first = (overwrite: boolean, date: string) => ({
      cycleYear: preview.cycleYear,
      rows: [{ slug, program: 'REG', milestones: [{ type: 'SUBMITTED', date, overwrite }] }],
    });
    const other = dayAgo(40);
    expect((await a.client.post<Saved>(SAVE, first(false, other))).body).toMatchObject({ added: 1, schoolsAdded: 1 });

    const kept = await a.client.post<Saved>(SAVE, first(false, SUBMITTED));
    expect(kept.body).toMatchObject({ added: 0, overwritten: 0, conflicts: 1 });
    expect((await tracker(a, preview.cycleYear)).cycle?.applications[0]?.milestones[0]?.date).toBe(other);

    const same = await a.client.post<Saved>(SAVE, first(false, other));
    expect(same.body).toMatchObject({ added: 0, overwritten: 0, conflicts: 0, unchanged: 1 });

    const replaced = await a.client.post<Saved>(SAVE, first(true, SUBMITTED));
    expect(replaced.body).toMatchObject({ added: 0, overwritten: 1, conflicts: 0 });
    expect((await tracker(a, preview.cycleYear)).cycle?.applications[0]?.milestones[0]?.date).toBe(SUBMITTED);
  });

  it('saving goes through share-sync: shared only when the cycle already shares, and only the shareable types', async () => {
    if (SECRET.length < 16) return; // the app cannot share without it; the private suite requires it
    const parsed = await parseText(b);
    expect(parsed.status, JSON.stringify(parsed.body)).toBe(200);
    const preview = parsed.body;
    const body = (slugRow: string) => ({
      cycleYear: preview.cycleYear,
      rows: [
        {
          slug: slugRow,
          program: 'REG',
          milestones: [
            { type: 'SUBMITTED', date: SUBMITTED, overwrite: false },
            { type: 'INTERVIEW', date: INTERVIEW, overwrite: false },
          ],
        },
      ],
    });
    // Sharing off (the default): nothing is shared.
    const off = await b.client.post<Saved>(SAVE, body(PRIVATE_MD_SLUG));
    expect(off.body).toMatchObject({ added: 2 });
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(0);
    // Sharing on first: the interview is shared, the submitted date is not.
    await wipe(ids());
    const on = await b.client.request('PUT', `${TRACKER}/cycle`, {
      json: { cycleYear: preview.cycleYear, shareAnonymously: true },
    });
    expect(on.status).toBe(200);
    const saved = await b.client.post<Saved>(SAVE, body(PRIVATE_MD_SLUG));
    expect(saved.body).toMatchObject({ added: 2 });
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(1);
    // Deleting the cycle through the API takes the shared event with it (a direct row delete would not).
    const gone = await b.client.delete(`${TRACKER}/cycle?cycleYear=${preview.cycleYear}`);
    expect(gone.status).toBe(200);
    expect(await rmhEventCount(PRIVATE_MD_ID)).toBe(0);
  });
});
