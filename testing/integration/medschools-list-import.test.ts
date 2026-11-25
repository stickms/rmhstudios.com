/**
 * RMH Med Schools list import, black box (owner 2026-11-24). Modelled on `medschools-import.test.ts` and run the same
 * way: against a RUNNING app, with the fake provider on `INTEGRATION_AI_FAKE_PORT` for the model-dependent cases.
 *
 * What it proves: signed out is 401 with no public cache header; pasted text and an uploaded file read into the same
 * preview of school names and write nothing; a name the model invented (not in the text) is dropped and counted; a name
 * the text holds that is no active school comes back unmatched for the picker; a program is PHD only where the text says
 * so; save writes only the items it is sent, into the caller's own list or a new one, de-dupes against the list, counts
 * an inactive school as invalid, and answers another member's list with a 404; a body naming a user or a school id is
 * refused; an import is one of the day's questions (the cap stops it before any model call); and nothing of the file
 * (its text, its name, the essay in it) is in any row of any table.
 *
 * Fresh members only (`lib/fresh-member.ts`): a imports, b owns the list a must not reach, c is the cap's.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import { createFreshMember, removeFreshMembers, type FreshMember } from './lib/fresh-member';
import { startFakeDeepseek, userJson, type FakeCall, type FakeDeepseek, type FakeScript } from './lib/fake-deepseek';
import {
  MEDSCHOOL_FIXTURE_SLUG,
  PRIVATE_DO_SLUG,
  PRIVATE_MD_SLUG,
  removeMedSchoolsFixture,
  removeTrackerFixture,
  seedFillerSchools,
  seedMedSchoolsFixture,
  seedTrackerFixture,
} from './lib/medschools-fixture';

const PORT = Number(process.env.INTEGRATION_AI_FAKE_PORT ?? 0);
const PARSE = '/api/medschools/me/lists/import/parse';
const SAVE = '/api/medschools/me/lists/import/save';
const LISTS = '/api/medschools/me/lists';
const ASK = '/api/medschools/me/ask';
const NOT_PUBLIC = /public|s-maxage|max-age=[1-9]/i;

/** Words only this file holds: if any appears in any row of any table, the file was kept. */
const ESSAY = 'quillzebra-essay-sentence';
const FILENAME = 'quillzebra-schools.txt';
const NAME_FIXTURE = 'Fixture University School of Medicine';
const NAME_MD = 'Tracker Fixture School of Medicine';
const NAME_DO = 'Tracker Fixture College of Osteopathic Medicine';

const TEXT = [
  'My school list',
  `${NAME_FIXTURE} | MD`,
  `${NAME_MD} | MD-PhD`,
  NAME_DO,
  'Unknown Academy of Healing',
  `Essay: ${ESSAY} I want to be a doctor because of my grandmother.`,
].join('\n');

interface Preview {
  dropped: number;
  truncated: boolean;
  rows: { key: string; schoolName: string; school: { slug: string } | null; program: string }[];
  remainingToday: number | null;
  dailyCap: number | null;
  code?: string;
}
interface Saved {
  list: { id: string; name: string; items: { school: { slug: string }; program: string }[] };
  added: number;
  alreadyThere: number;
  invalid: number;
  code?: string;
}

/** What the model returns for TEXT: every name as written, one it made up, and a note that must go nowhere. */
const modelReply: FakeScript = (call: FakeCall) => ({
  schools: [
    { name: NAME_FIXTURE, program: 'MD' },
    { name: NAME_MD, program: 'MD-PhD' },
    { name: NAME_DO, program: '' },
    { name: 'Unknown Academy of Healing', program: '' },
    // Invented: the text does not hold it.
    { name: 'Stanford University School of Medicine', program: 'MD' },
  ],
  notes: `${ESSAY} ${call.system.length}`,
});

let a: FreshMember;
let b: FreshMember;
let c: FreshMember;
const anon = new Client();

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
const parseText = (m: FreshMember, text = TEXT) => m.client.post<Preview>(PARSE, { text });
const parseFile = (m: FreshMember, name = FILENAME, type = 'text/plain', text = TEXT) => {
  const form = new FormData();
  form.append('file', new File([text], name, { type }));
  return m.client.postForm<Preview>(PARSE, form);
};
const wipeLists = (ids: string[]) => db().query('delete from med_school_list where "userId" = any($1)', [ids]);
const listCount = async (userId: string) =>
  (await db().query('select count(*)::int as n from med_school_list where "userId" = $1', [userId])).rows[0].n as number;
const rowFor = (p: Preview, slug: string) => p.rows.find((r) => r.school?.slug === slug);

beforeAll(async () => {
  a = await createFreshMember('list-import-a');
  b = await createFreshMember('list-import-b');
  c = await createFreshMember('list-import-c');
  await seedTrackerFixture([a.id, b.id, c.id]);
  await seedMedSchoolsFixture();
});
afterAll(async () => {
  const ids = [a?.id, b?.id, c?.id].filter((x): x is string => !!x);
  if (ids.length) {
    await clearLedger(ids);
    await removeTrackerFixture(ids);
  }
  await removeMedSchoolsFixture();
  await removeFreshMembers([a, b, c]);
  await closeDb();
});

describe('list import: no model needed', () => {
  afterEach(async () => {
    await wipeLists([a.id, b.id, c.id]);
  });

  it('signed out: parse (paste and file) and save are 401, with no public cache header and no data', async () => {
    const form = new FormData();
    form.append('file', new File(['Harvard'], 'a.txt', { type: 'text/plain' }));
    for (const res of [
      await anon.post(PARSE, { text: TEXT }),
      await anon.postForm(PARSE, form),
      await anon.post(SAVE, { target: { newList: 'x' }, items: [{ slug: PRIVATE_MD_SLUG, program: 'ANY' }] }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
      expect(JSON.stringify(res.body)).not.toMatch(/rows|slug|items/);
    }
  });

  it('save validates the body: a user, a school id, two targets, a bad slug or program is 400, nothing is written', async () => {
    const item = { slug: PRIVATE_MD_SLUG, program: 'ANY' };
    for (const body of [
      { target: { newList: 'x' }, items: [item], userId: b.id },
      { target: { newList: 'x' }, items: [{ ...item, schoolId: 'x' }] },
      { target: { newList: 'x', listId: 'y' }, items: [item] },
      { target: { newList: 'x' }, items: [{ ...item, slug: 'Not A Slug!' }] },
      { target: { newList: 'x' }, items: [{ ...item, program: 'MDPHD' }] },
      { target: { newList: 'x' }, items: [] },
    ]) {
      expect((await a.client.post(SAVE, body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(await listCount(a.id)).toBe(0);
  });

  it("another member's list is a 404 and is left exactly as it was", async () => {
    const theirs = await b.client.post<{ id: string }>(LISTS, { name: 'B list' });
    expect(theirs.status).toBe(200);
    const res = await a.client.post<Saved>(SAVE, {
      target: { listId: theirs.body.id },
      items: [{ slug: PRIVATE_MD_SLUG, program: 'ANY' }],
    });
    expect(res.status).toBe(404);
    const n = await db().query('select count(*)::int as n from med_school_list_item where "listId" = $1', [theirs.body.id]);
    expect(n.rows[0].n).toBe(0);
  });

  it('a new list, then the same import into it: added, then already there; an inactive school is invalid', async () => {
    const [inactive] = await seedFillerSchools(1);
    const first = await a.client.post<Saved>(SAVE, {
      target: { newList: 'Imported' },
      items: [
        { slug: PRIVATE_MD_SLUG, program: 'PHD' },
        { slug: PRIVATE_DO_SLUG, program: 'ANY' },
        { slug: inactive, program: 'ANY' },
      ],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    expect(first.body).toMatchObject({ added: 2, alreadyThere: 0, invalid: 1, list: { name: 'Imported' } });
    const again = await a.client.post<Saved>(SAVE, {
      target: { listId: first.body.list.id },
      items: [
        { slug: PRIVATE_MD_SLUG, program: 'PHD' },
        { slug: PRIVATE_MD_SLUG, program: 'ANY' },
      ],
    });
    expect(again.body).toMatchObject({ added: 1, alreadyThere: 1, invalid: 0 });
    expect(again.body.list.items.map((i) => [i.school.slug, i.program])).toEqual([
      [PRIVATE_MD_SLUG, 'PHD'],
      [PRIVATE_DO_SLUG, 'ANY'],
      [PRIVATE_MD_SLUG, 'ANY'],
    ]);
  });

  it('refuses a file the reader cannot read or that is too large, and a text with no words, before any model call', async () => {
    const bad = await parseFile(a, 'tool.exe', 'application/x-msdownload', 'MZ');
    expect(bad.status).toBe(415);
    expect(bad.body.code).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    const big = await parseFile(a, 'big.csv', 'text/csv', 'a,b\n'.repeat(900_000));
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('MEDSCHOOLS_IMPORT_TOO_LARGE');
    const none = await parseText(a, '1 | 2 | 3.5 | --');
    expect(none.status).toBe(422);
    expect(none.body.code).toBe('MEDSCHOOLS_LIST_IMPORT_EMPTY');
  });
});

describe.skipIf(!PORT)('list import: with the fake provider', () => {
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
    await wipeLists(ids());
  });
  afterAll(async () => {
    await fake?.close();
  });

  it('pasted text and an uploaded file read into the same preview; nothing is written', async () => {
    const paste = await parseText(a);
    expect(paste.status, JSON.stringify(paste.body)).toBe(200);
    expect(paste.headers.get('cache-control') ?? '').toMatch(/no-store/);
    expect(rowFor(paste.body, MEDSCHOOL_FIXTURE_SLUG)?.program).toBe('REG');
    expect(rowFor(paste.body, PRIVATE_MD_SLUG)?.program).toBe('PHD');
    expect(rowFor(paste.body, PRIVATE_DO_SLUG)?.program).toBe('ANY');
    // A name the text holds that is no school: as written, with no school, for the picker.
    expect(paste.body.rows.find((r) => r.school === null)?.schoolName).toBe('Unknown Academy of Healing');
    // The invented school is dropped and counted; the model's note never reaches the response.
    expect(JSON.stringify(paste.body)).not.toMatch(/Stanford/);
    expect(paste.body.dropped).toBe(1);
    expect(JSON.stringify(paste.body)).not.toContain(ESSAY);
    // The file's order is the preview's order.
    expect(paste.body.rows.map((r) => r.schoolName)).toEqual([NAME_FIXTURE, NAME_MD, NAME_DO, 'Unknown Academy of Healing']);

    const file = await parseFile(a);
    expect(file.status, JSON.stringify(file.body)).toBe(200);
    expect(file.body.rows.map((r) => [r.schoolName, r.school?.slug ?? null, r.program])).toEqual(
      paste.body.rows.map((r) => [r.schoolName, r.school?.slug ?? null, r.program]),
    );
    expect(await listCount(a.id)).toBe(0);
  });

  it("an import is one of the day's questions: it counts, and a spent day stops it before any model call", async () => {
    const before = (await a.client.get<{ remainingToday: number; dailyCap: number }>(ASK)).body;
    const res = await parseText(a);
    expect(res.status).toBe(200);
    expect(res.body.remainingToday).toBe(before.remainingToday - 1);

    await clearLedger(ids());
    await insertAskRows(c.id, before.dailyCap);
    fake.reset();
    const capped = await parseText(c);
    expect(capped.status).toBe(429);
    expect(capped.body.code).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    expect(modelCalls()).toHaveLength(0);
  });

  it('parse then save writes the ticked rows into a new list; the file is in no table', async () => {
    const parsed = await parseFile(a);
    expect(parsed.status, JSON.stringify(parsed.body)).toBe(200);
    // The member unticks the DO school and leaves the unmatched name unpicked: the body simply does not carry them.
    const items = parsed.body.rows
      .filter((r) => r.school && r.school.slug !== PRIVATE_DO_SLUG)
      .map((r) => ({ slug: r.school!.slug, program: r.program }));
    const saved = await a.client.post<Saved>(SAVE, { target: { newList: 'From my file' }, items });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({ added: 2, alreadyThere: 0, invalid: 0, list: { name: 'From my file' } });
    expect(saved.body.list.items.map((i) => [i.school.slug, i.program])).toEqual([
      [MEDSCHOOL_FIXTURE_SLUG, 'REG'],
      [PRIVATE_MD_SLUG, 'PHD'],
    ]);

    const tables = (await db().query(`select tablename from pg_tables where schemaname = 'public'`)).rows.map(
      (r: { tablename: string }) => r.tablename,
    );
    for (const table of tables) {
      for (const needle of [ESSAY, 'quillzebra', 'grandmother', 'Unknown Academy of Healing']) {
        const hit = await db().query(`select count(*)::int as n from "${table}" t where t::text ilike $1`, [`%${needle}%`]);
        expect(hit.rows[0].n, `${table} holds "${needle}"`).toBe(0);
      }
    }
  });
});
