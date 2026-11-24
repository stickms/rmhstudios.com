/**
 * RMH Med Schools Q&A limit tiers, the admin bypass and limit requests, black box (phase 6, R19).
 *
 * Runs against a RUNNING app (see `medschools-ask.test.ts`). The cases that reach the model need the fake provider on
 * `INTEGRATION_AI_FAKE_PORT`; the rest (the request flow, the tiers' caps, the 401 and 403 of the admin routes) do not.
 * The caps asserted are the defaults: 25 free, 40 approved, 100 member, none for an admin.
 *
 * What it proves: an admin passes the daily cap, the per-minute limit and the lease (and spends no reservation), but
 * not the shared monthly pause; a paying member has 100; a free member who files a request, whom an admin approves,
 * has 40 and goes back to 25 when it is revoked; a decline blocks a new request for 30 days; a pending request is
 * one per member; the admin routes are 401 signed out and 403 for a member.
 *
 * It signs up no one (sign-up is limited to 10 a minute per IP and the suite's other files already use most of that),
 * and it does not borrow the global cast either: the app caches a member's tier for 60 s, so a cast member the earlier
 * files already asked as would still read 'free' after this file gives them a Subscription row. The four roles are
 * fresh members (`lib/fresh-member.ts`): an admin, a free member who is also the declined one (with his requests cleared
 * in between) and a paying member. They are deleted in `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import { createFreshMember, removeFreshMembers, type FreshMember } from './lib/fresh-member';
import { startFakeDeepseek, userJson, type FakeCall, type FakeDeepseek, type FakeScript } from './lib/fake-deepseek';
import { removeAskFixture, removeMedSchoolsFixture, seedAskFixture, seedMedSchoolsFixture } from './lib/medschools-fixture';

const PORT = Number(process.env.INTEGRATION_AI_FAKE_PORT ?? 0);
const ASK = '/api/medschools/me/ask';
const REQ = '/api/medschools/me/qa-limit-request';
const ADMIN_REQ = '/api/admin/medschools/qa-limit-requests';
const DAY = 86_400_000;

type Member = FreshMember;

interface Status {
  configured: boolean;
  tier: string;
  remainingToday: number | null;
  dailyCap: number | null;
}
interface LimitState {
  state: string;
  tier: string;
  adminNote: string;
  reapplyOn: string | null;
}
interface AdminList {
  pending: { id: string; note: string; user: { id: string } }[];
  active: { id: string; status: string; adminNote: string; user: { id: string } }[];
  recent: { id: string; status: string; adminNote: string; revokeNote: string; user: { id: string } }[];
}

let admin: Member;
let free: Member;
let paying: Member;
let decline: Member;
const everyone = () => [admin.id, free.id, paying.id, decline.id];
const SUB_ID = 'it-sub-medschools-qa-limits';

/** Reservation rows (`medschools-qa-ask`) are the day's count; a priced row is Q&A spend. */
async function insertRows(userId: string | null, n: number, cost = 0, promptId = 'medschools-qa-ask') {
  for (let i = 0; i < n; i += 1) {
    await db().query(
      `insert into ai_usage ("userId", task, provider, model, "promptId", "promptVer", "inTokens", "outTokens", "costMicros", ok, "createdAt")
       values ($1, 'medschools-qa', 'deepseek', 'fake', $3, 1, 1, 1, $2, true, now())`,
      [userId, cost, promptId],
    );
  }
}
const clearLedger = () =>
  db().query(`delete from ai_usage where task = 'medschools-qa' and ("userId" = any($1) or "userId" is null)`, [everyone()]);
const clearRequests = () => db().query('delete from med_qa_limit_request where "userId" = any($1)', [everyone()]);
const askRows = async (userId: string) =>
  Number(
    (
      await db().query(
        `select count(*)::int as n from ai_usage where "userId" = $1 and task = 'medschools-qa' and "promptId" = 'medschools-qa-ask'`,
        [userId],
      )
    ).rows[0].n,
  );
const status = async (m: Member) => (await m.client.get<Status>(ASK)).body;
const state = async (m: Member) => (await m.client.get<LimitState>(REQ)).body;
const ask = (m: Member, question = 'How many interviews has Fixture reported?') => m.client.post<{ code?: string; dailyCap: number | null; remainingToday: number | null; tier: string }>(ASK, { question });
const pendingId = async (userId: string) => {
  const list = (await admin.client.get<AdminList>(ADMIN_REQ)).body;
  const hit = list.pending.find((r) => r.user.id === userId);
  expect(hit, 'a pending request for the member').toBeDefined();
  return hit!.id;
};
const decide = (id: string, action: 'approve' | 'decline' | 'revoke', adminNote?: string) =>
  admin.client.post(ADMIN_REQ, { id, action, ...(adminNote ? { adminNote } : {}) });

beforeAll(async () => {
  // Made admin in the row itself, so the first session already carries the flag (a session's cookie cache keeps the
  // flag it was created with).
  admin = await createFreshMember('qa-admin', { isAdmin: true });
  free = await createFreshMember('qa-free');
  paying = await createFreshMember('qa-paying');
  decline = free;
  // A paying member is a Subscription row, the one the Stripe webhook writes. The member is new, so the app has not
  // cached a tier for them yet and the first read sees it.
  await db().query(`insert into "Subscription" (id, plan, "referenceId", status) values ($1, 'starter', $2, 'active')`, [
    SUB_ID,
    paying.id,
  ]);
  await clearLedger();
});

afterAll(async () => {
  if (admin && free && paying) {
    await clearLedger();
    await clearRequests();
  }
  await db().query(`delete from "Subscription" where id = $1`, [SUB_ID]);
  await removeFreshMembers([admin, free, paying]);
  await closeDb();
});

describe('limit tiers and requests: no model needed', () => {
  it('the admin routes are 401 signed out and 403 for a member, on GET and POST', async () => {
    const anon = new Client();
    const body = { id: 'x', action: 'approve' };
    expect((await anon.get(ADMIN_REQ)).status).toBe(401);
    expect((await anon.post(ADMIN_REQ, body)).status).toBe(401);
    expect((await free.client.get(ADMIN_REQ)).status).toBe(403);
    expect((await free.client.post(ADMIN_REQ, body)).status).toBe(403);
    expect((await paying.client.get(ADMIN_REQ)).status).toBe(403);
    expect((await anon.get(REQ)).status).toBe(401);
    expect((await anon.post(REQ, {})).status).toBe(401);
  });

  it('GET status names the tier: admin has no cap, a free member 25, a paying member 100', async () => {
    expect(await status(admin)).toMatchObject({ tier: 'admin', dailyCap: null, remainingToday: null });
    expect(await status(free)).toMatchObject({ tier: 'free', dailyCap: 25, remainingToday: 25 });
    expect(await status(paying)).toMatchObject({ tier: 'member', dailyCap: 100, remainingToday: 100 });
  });

  it('an admin and a paying member are not offered a request, and a POST is refused', async () => {
    expect((await state(admin)).state).toBe('not-needed');
    expect((await state(paying)).state).toBe('not-needed');
    for (const m of [admin, paying]) {
      const res = await m.client.post<{ code: string }>(REQ, { note: 'more please' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('MEDSCHOOLS_QA_LIMIT_NOT_NEEDED');
    }
  });

  it('a free member at the cap files one request, an admin approves it, and the limit is 40', async () => {
    await insertRows(free.id, 25);
    // The refusal needs the app to have a model key (no key is 503 before any gate); the CI app has one.
    if ((await status(free)).configured) {
      const capped = await ask(free);
      expect(capped.status).toBe(429);
      expect(capped.body.code).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    }

    expect((await state(free)).state).toBe('none');
    expect((await free.client.post(REQ, { note: 'x'.repeat(501) })).status).toBe(400);
    const filed = await free.client.post<LimitState>(REQ, { note: 'MCAT prep this week' });
    expect(filed.status).toBe(200);
    expect(filed.body.state).toBe('pending');
    const again = await free.client.post<{ code: string }>(REQ, { note: 'and again' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('MEDSCHOOLS_QA_LIMIT_PENDING');
    expect((await db().query('select count(*)::int as n from med_qa_limit_request where "userId" = $1', [free.id])).rows[0].n).toBe(1);

    const id = await pendingId(free.id);
    expect((await admin.client.get<AdminList>(ADMIN_REQ)).body.pending.find((r) => r.id === id)?.note).toBe('MCAT prep this week');
    // Still free until an admin decides.
    expect(await status(free)).toMatchObject({ tier: 'free', dailyCap: 25 });
    const ok = await decide(id, 'approve', 'Good luck');
    expect(ok.status).toBe(200);
    expect((await decide(id, 'decline')).status).toBe(409); // already decided

    expect(await state(free)).toMatchObject({ state: 'approved', tier: 'approved', adminNote: 'Good luck' });
    expect(await status(free)).toMatchObject({ tier: 'approved', dailyCap: 40, remainingToday: 15 });
    // An approved member cannot file another.
    expect((await free.client.post(REQ, {})).status).toBe(409);
  });

  it('a revoke takes the member back to 25 and starts the 30-day wait', async () => {
    const list = (await admin.client.get<AdminList>(ADMIN_REQ)).body;
    const granted = list.active.find((r) => r.user.id === free.id && r.status === 'APPROVED');
    expect(granted).toBeDefined();
    expect((await decide(granted!.id, 'revoke', 'Misuse')).status).toBe(200);
    expect(await status(free)).toMatchObject({ tier: 'free', dailyCap: 25 });
    const after = (await admin.client.get<AdminList>(ADMIN_REQ)).body;
    expect(after.active.find((r) => r.id === granted!.id)).toBeUndefined();
    expect(after.recent.find((r) => r.id === granted!.id)).toMatchObject({ status: 'REVOKED', revokeNote: 'Misuse' });
    const s = await state(free);
    expect(s.state).toBe('declined');
    expect(Date.parse(s.reapplyOn!) - Date.now()).toBeGreaterThan(29 * DAY);
    const res = await free.client.post<{ code: string }>(REQ, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MEDSCHOOLS_QA_LIMIT_WAIT');
  });

  it('a decline blocks a new request for 30 days, then the member can ask again', async () => {
    // The declined member is bob again, so the revoke of the case before must not be what blocks him.
    await clearRequests();
    expect((await decline.client.post<LimitState>(REQ, {})).body.state).toBe('pending');
    expect((await decide(await pendingId(decline.id), 'decline', 'Not now')).status).toBe(200);
    const s = await state(decline);
    expect(s).toMatchObject({ state: 'declined', tier: 'free', adminNote: 'Not now' });
    const wait = Date.parse(s.reapplyOn!) - Date.now();
    expect(wait).toBeGreaterThan(29 * DAY);
    expect(wait).toBeLessThanOrEqual(30 * DAY);
    expect((await decline.client.post<{ code: string }>(REQ, {})).body.code).toBe('MEDSCHOOLS_QA_LIMIT_WAIT');
    // Day 31: the wait is over.
    await db().query(`update med_qa_limit_request set "decidedAt" = now() - interval '31 days' where "userId" = $1`, [decline.id]);
    expect((await state(decline)).state).toBe('none');
    expect((await decline.client.post<LimitState>(REQ, { note: 'second try' })).body.state).toBe('pending');
  });

  it('a paying member has 100: 99 used leaves one, 100 used is the cap, with no model call for the refusal', async () => {
    await insertRows(paying.id, 100);
    expect(await status(paying)).toMatchObject({ tier: 'member', remainingToday: 0, dailyCap: 100 });
    if ((await status(paying)).configured) {
      const res = await ask(paying);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    }
  });

  it('an unknown request id is 404', async () => {
    expect((await decide('does-not-exist', 'approve')).status).toBe(404);
  });
});

const factsOf = (call: FakeCall) => (userJson(call.user)?.facts ?? []) as { ref: string; text: string }[];
const goodScript: FakeScript = (call) => {
  if (call.kind === 'route') return { intent: 'facts', schools: ['Fixture'], cycle: null, filters: { state: null, format: null } };
  const f = factsOf(call).find((x) => /reported interview events/.test(x.text));
  const n = /([\d,]+) reported interview events/.exec(f?.text ?? '')?.[1] ?? '0';
  return { segments: [{ text: `Fixture has ${n} reported interview events.`, cites: [f?.ref ?? 'f1'] }], thin: false };
};

describe.skipIf(!PORT)('limit tiers with the fake provider', () => {
  let fake: FakeDeepseek;
  beforeAll(async () => {
    fake = await startFakeDeepseek(PORT, goodScript);
    await seedMedSchoolsFixture();
    await seedAskFixture();
    await clearLedger();
  });
  afterAll(async () => {
    await fake?.close();
    await clearLedger();
    await removeAskFixture();
    await removeMedSchoolsFixture();
  });

  it('an admin passes the daily cap, the lease and the per-minute limit, one after another, and no reservation is written', async () => {
    await insertRows(admin.id, 200); // far past every cap
    const serial: number[] = [];
    for (let i = 0; i < 12; i++) serial.push((await ask(admin)).status);
    expect(serial).toEqual(Array(12).fill(200));
    // Parallel is bounded: at most 3 in flight, so a burst of 30 is some 200s and the rest the busy refusal, never a 5xx.
    const burst = await Promise.all(Array.from({ length: 30 }, () => ask(admin)));
    const ok = burst.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok[0]!.body).toMatchObject({ tier: 'admin', dailyCap: null, remainingToday: null });
    for (const r of burst.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(429);
      expect(r.body.code).toBe('MEDSCHOOLS_QA_BUSY');
    }
    // The 200 planted rows are all there is: the admin's questions reserved nothing.
    await new Promise((r) => setTimeout(r, 500));
    expect(await askRows(admin.id)).toBe(200);
    expect(await status(admin)).toMatchObject({ tier: 'admin', dailyCap: null, remainingToday: null });
  });

  it('an approved member, below 40 used, reaches the model after a free member at 25 was refused', async () => {
    await clearLedger();
    await clearRequests();
    await insertRows(free.id, 25);
    expect((await ask(free)).status).toBe(429);
    expect((await free.client.post(REQ, { note: 'please' })).status).toBe(200);
    expect((await decide(await pendingId(free.id), 'approve')).status).toBe(200);
    fake.reset();
    const ok = await ask(free);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ tier: 'approved', dailyCap: 40, remainingToday: 14 });
    expect(fake.calls().length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 500));
    await insertRows(free.id, 14); // 26 + 14 = 40
    expect((await ask(free)).body.code).toBe('MEDSCHOOLS_QA_DAILY_CAP');
  });

  it('the shared monthly pause still stops an admin, before any model call', async () => {
    await clearLedger();
    fake.reset();
    const total = Number(process.env.MEDSCHOOLS_AI_MONTHLY_USD || 20);
    const share = Number(process.env.MEDSCHOOLS_QA_AI_SHARE || 0.25);
    await insertRows(null, 1, Math.ceil(total * share * 1_000_000) + 1, 'medschools-qa-route');
    const res = await ask(admin);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('MEDSCHOOLS_QA_PAUSED');
    expect(fake.calls()).toHaveLength(0);
  });
});
