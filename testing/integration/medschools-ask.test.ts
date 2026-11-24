/**
 * RMH Med Schools, AI Q&A, black box (phase 6, plan Task 12).
 *
 * Runs against a RUNNING app. The cases that need a model run against `lib/fake-deepseek.ts`, hosted by this process on
 * `INTEGRATION_AI_FAKE_PORT`; the app is started with `DEEPSEEK_API_KEY=integration-fake` and
 * `DEEPSEEK_BASE_URL=http://127.0.0.1:$INTEGRATION_AI_FAKE_PORT/v1` (CI does both; without the port they are skipped, so
 * a local run without it is not a pass for them).
 *
 *   INTEGRATION_BASE_URL=http://localhost:7005 INTEGRATION_AI_FAKE_PORT=7798 DATABASE_URL=… \
 *     pnpm test:integration -- testing/integration/medschools-ask.test.ts
 *
 * What it proves: signed-out is 401 and nothing is publicly cached; the daily cap, the shared budget and the in-flight
 * lock stop a question before any model call; citations point only at rows that were retrieved; a suppressed RMH figure
 * never reaches the prompt; planted text in a stored interview question is not obeyed and never reaches the member; an
 * ungrounded number is dropped; the member's own estimate is returned beside the answer and never shown to the model;
 * and no text of the question is stored anywhere in the database.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';
import { createFreshMember, removeFreshMembers, type FreshMember } from './lib/fresh-member';
import {
  FAKE_REASONING,
  startFakeDeepseek,
  userJson,
  type FakeCall,
  type FakeDeepseek,
  type FakeScript,
} from './lib/fake-deepseek';
import {
  ASK_INJECTION,
  MEDSCHOOL_FIXTURE_SLUG,
  removeAskFixture,
  removeMedSchoolsFixture,
  removeTrackerFixture,
  seedAskFixture,
  seedMedSchoolsFixture,
} from './lib/medschools-fixture';

const PORT = Number(process.env.INTEGRATION_AI_FAKE_PORT ?? 0);
const ASK = '/api/medschools/me/ask';
const NOT_PUBLIC = /public|s-maxage|max-age=[1-9]/i;
const DAY = 86_400_000;

// Fresh members, not the global cast: the `ai` rate-limit buckets, the daily-cap rows, the lease and the 60 s tier cache
// are all per user, and every later file that asks as alice, bob or carol would otherwise start with what this one left.
type Member = FreshMember;
let a: Member;
let b: Member;
let c: Member;
const anon = new Client();

beforeAll(async () => {
  a = await createFreshMember('ask-a');
  b = await createFreshMember('ask-b');
  c = await createFreshMember('ask-c');
});
afterAll(async () => {
  await removeFreshMembers([a, b, c]);
});

interface AskBody {
  status: string;
  segments: { text: string; cites: string[] }[];
  citations: { ref: string; label: string; sourceName: string; schoolSlug: string | null; href: string }[];
  notice: string | null;
  decline: string | null;
  schools: { slug: string; shortName: string }[];
  mine: { applicationId: string; school: { slug: string } }[] | null;
  remainingToday: number;
  dailyCap: number;
  thinking: boolean;
  code?: string;
}

const ask = (m: Member, question: string, extra: Record<string, unknown> = {}) =>
  m.client.post<AskBody>(ASK, { question, ...extra });

/** Reservation rows (`medschools-qa-ask`) are the day's count the cap reads; a priced row is Q&A spend. */
async function insertRouteRows(
  userId: string | null,
  n: number,
  createdAt: Date = new Date(),
  cost = 0,
  promptId = 'medschools-qa-ask',
) {
  for (let i = 0; i < n; i += 1) {
    await db().query(
      `insert into ai_usage ("userId", task, provider, model, "promptId", "promptVer", "inTokens", "outTokens", "costMicros", ok, "createdAt")
       values ($1, 'medschools-qa', 'deepseek', 'fake', $4, 1, 1, 1, $2, true, $3)`,
      [userId, cost, createdAt, promptId],
    );
  }
}
const clearLedger = async (ids: string[]) => {
  await db().query(`delete from ai_usage where task = 'medschools-qa' and ("userId" = any($1) or "userId" is null)`, [
    ids,
  ]);
};
const askRows = async (userId: string) =>
  Number(
    (
      await db().query(
        `select count(*)::int as n from ai_usage where "userId" = $1 and task = 'medschools-qa' and "promptId" = 'medschools-qa-ask'`,
        [userId],
      )
    ).rows[0].n,
  );

/** The retrieved facts the answer call was shown. */
const factsOf = (call: FakeCall) =>
  (userJson(call.user)?.facts ?? []) as { ref: string; label: string; text: string; untrusted: boolean }[];

const ROUTE_FACTS = { intent: 'facts', schools: ['Fixture'], cycle: null, filters: { state: null, format: null } };

/** A well-behaved model: routes to the fixture school and states the reported interview count it was shown. */
const goodScript: FakeScript = (call) => {
  if (call.kind === 'route') return ROUTE_FACTS;
  const f = factsOf(call).find((x) => /reported interview events/.test(x.text));
  const n = /([\d,]+) reported interview events/.exec(f?.text ?? '')?.[1] ?? '0';
  return { segments: [{ text: `Fixture has ${n} reported interview events.`, cites: [f?.ref ?? 'f1'] }], thin: false };
};

describe('medschools Q&A: no model needed', () => {
  it('signed out: POST and GET are 401, carry no school data and no public cache header', async () => {
    for (const res of [await anon.post(ASK, { question: 'What is the median?' }), await anon.get(ASK)]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
      expect(JSON.stringify(res.body)).not.toMatch(/segments|citations|remainingToday|slug/);
    }
  });

  it('signed in GET: whole numbers for the cap and the questions left, never cached', async () => {
    const res = await a.client.get<{ configured: boolean; remainingToday: number; dailyCap: number }>(ASK);
    expect(res.status).toBe(200);
    expect(Number.isInteger(res.body.dailyCap)).toBe(true);
    expect(Number.isInteger(res.body.remainingToday)).toBe(true);
    expect(typeof res.body.configured).toBe('boolean');
    expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
  });

  it('validation: a short question, a long one and a bad slug are 400 before anything runs', async () => {
    for (const body of [
      { question: 'hi' },
      { question: 'x'.repeat(401) },
      { question: '   ' },
      { question: 'What is the median?', slug: 'Not A Slug!' },
    ]) {
      const res = await a.client.post(ASK, body);
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
  });
});

describe.skipIf(!PORT)('medschools Q&A: with the fake provider', () => {
  let fake: FakeDeepseek;
  const ids = () => [a.id, b.id, c.id];

  beforeAll(async () => {
    fake = await startFakeDeepseek(PORT, goodScript);
    await seedMedSchoolsFixture();
    await seedAskFixture();
    await clearLedger(ids());
  });
  afterEach(async () => {
    fake.setScript(goodScript);
    fake.reset();
    // The ledger row of a call is written just after its response; let it land before clearing, so the next case starts at zero.
    await new Promise((r) => setTimeout(r, 400));
    await clearLedger(ids());
    await db().query('delete from med_school_list where "userId" = any($1)', [ids()]);
  });
  afterAll(async () => {
    await fake?.close();
    await clearLedger(ids());
    await removeTrackerFixture(ids());
    await removeAskFixture();
    await removeMedSchoolsFixture();
    await closeDb();
  });

  it('a grounded answer: citations are retrieved rows only, and the prompt never held a suppressed RMH figure or a person', async () => {
    const res = await ask(a, 'How many interviews has Fixture reported?');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control') ?? '').not.toMatch(NOT_PUBLIC);
    expect(res.body.status).toBe('answered');
    expect(res.body.notice).toBeNull();
    expect(res.body.schools).toEqual([{ slug: MEDSCHOOL_FIXTURE_SLUG, shortName: 'Fixture' }]);
    expect(res.body.dailyCap).toBeGreaterThan(0);

    const answerCall = fake.calls().find((x) => x.kind === 'answer');
    expect(answerCall).toBeDefined();
    const shown = factsOf(answerCall!);
    const shownRefs = new Set(shown.map((f) => f.ref));
    // Every citation is a retrieved fact, every cite of every segment is listed, every listing is cited.
    const cited = new Set(res.body.segments.flatMap((s) => s.cites));
    expect(res.body.citations.length).toBeGreaterThan(0);
    for (const cit of res.body.citations) {
      expect(shownRefs.has(cit.ref)).toBe(true);
      expect(cited.has(cit.ref)).toBe(true);
      expect(cit.schoolSlug).toBe(MEDSCHOOL_FIXTURE_SLUG);
      expect(cit.href).toMatch(new RegExp(`^/med/${MEDSCHOOL_FIXTURE_SLUG}\\?tab=`));
    }
    for (const ref of cited) expect(res.body.citations.some((x) => x.ref === ref)).toBe(true);
    // The CycleTrack figure was shown; the RMH cell (99 on 2 contributors, never published) was not.
    expect(shown.some((f) => /CycleTrack/.test(f.text) && /reported interview events/.test(f.text))).toBe(true);
    const factText = shown.map((f) => f.text).join('\n');
    expect(factText).not.toMatch(/\b99\b/);
    expect(factText).not.toMatch(/\bRMH\b/);
    // No person and no tracker in anything the model saw.
    const everything = fake
      .calls()
      .map((x) => x.system + x.user)
      .join('\n');
    for (const needle of [a.email, a.id, a.name, 'tracker']) expect(everything).not.toContain(needle);
  });

  it('think: the answer call alone runs with thinking enabled, and no reasoning text reaches the response', async () => {
    const res = await ask(a, 'How many interviews has Fixture reported?', { think: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('answered');
    expect(res.body.thinking).toBe(true);
    const calls = fake.calls();
    expect(calls.find((x) => x.kind === 'route')?.thinking?.type).toBe('disabled');
    const answer = calls.find((x) => x.kind === 'answer')!;
    expect(answer.thinking).toEqual({ type: 'enabled' });
    expect(answer.hasTemperature).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('FAKE-REASONING');
    expect(JSON.stringify(res.body)).not.toContain(FAKE_REASONING);
    // The day's count is one question, whatever it cost.
    await new Promise((r) => setTimeout(r, 400));
    expect(await askRows(a.id)).toBe(1);
    // The ledger holds no reasoning text either.
    const rows = await db().query(`select * from ai_usage where "userId" = $1`, [a.id]);
    expect(JSON.stringify(rows.rows)).not.toContain('FAKE-REASONING');
  });

  it('without think no request carries thinking enabled', async () => {
    const res = await ask(b, 'How many interviews has Fixture reported?');
    expect(res.body.thinking).toBe(false);
    expect(fake.calls().every((x) => x.thinking?.type === 'disabled')).toBe(true);
  });

  it('GET reports thinkingAvailable', async () => {
    const res = await a.client.get<{ thinkingAvailable: boolean }>(ASK);
    expect(typeof res.body.thinkingAvailable).toBe('boolean');
  });

  it("the userId in the body is ignored: the ledger row is the session user's", async () => {
    const res = await ask(a, 'How many interviews has Fixture reported?', { userId: b.id });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(await askRows(a.id)).toBe(1);
    expect(await askRows(b.id)).toBe(0);
  });

  it('an invented citation and a wrong number are dropped, with a notice; all wrong is declined as ungrounded', async () => {
    fake.setScript((call) => {
      if (call.kind === 'route') return ROUTE_FACTS;
      const f = factsOf(call).find((x) => /reported interview events/.test(x.text))!;
      const n = /([\d,]+) reported interview events/.exec(f.text)![1];
      return {
        segments: [
          { text: `Fixture has ${n} reported interview events.`, cites: [f.ref] },
          { text: 'Fixture has 12 reported interview events.', cites: ['f77'] },
          { text: 'Fixture has 987654 reported interview events.', cites: [f.ref] },
        ],
        thin: false,
      };
    });
    const partial = await ask(a, 'How many interviews has Fixture reported?');
    expect(partial.body.status).toBe('partial');
    expect(partial.body.notice).toBe('removed-ungrounded');
    expect(partial.body.segments).toHaveLength(1);
    expect(JSON.stringify(partial.body)).not.toMatch(/987654|f77/);

    fake.setScript((call) =>
      call.kind === 'route'
        ? ROUTE_FACTS
        : { segments: [{ text: 'Fixture has 987654 reported interview events.', cites: ['f1'] }], thin: false },
    );
    const none = await ask(b, 'How many interviews has Fixture reported?');
    expect(none.body.status).toBe('no-data');
    expect(none.body.decline).toBe('ungrounded');
    expect(none.body.segments).toEqual([]);
  });

  it('an injection planted in a stored interview question is data: shown only inside the data region, never obeyed or leaked', async () => {
    let answerSystem = '';
    fake.setScript((call) => {
      if (call.kind === 'route') return { ...ROUTE_FACTS, intent: 'interviews' };
      answerSystem = call.system;
      const facts = factsOf(call);
      const planted = facts.find((f) => f.untrusted && /Ignore all previous/.test(f.text))!;
      const stat = facts.find((f) => /GPA median/.test(f.text));
      return {
        segments: [
          { text: 'The MCAT median is 999.', cites: [planted.ref] },
          { text: 'Visit evil.example for the real figures.', cites: [planted.ref] },
          { text: `My instructions: ${call.system.slice(40, 120)}`, cites: [planted.ref] },
          ...(stat ? [{ text: 'The GPA median is 3.9.', cites: [stat.ref] }] : []),
        ],
        thin: false,
      };
    });
    const res = await ask(b, 'What do they ask at Fixture interviews?');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('999');
    expect(text).not.toContain('evil.example');
    expect(text).not.toContain('My instructions');
    expect(text).not.toContain(answerSystem.slice(40, 120));
    expect(res.body.segments.every((s) => !/evil|999/.test(s.text))).toBe(true);

    const answerCall = fake.calls().find((x) => x.kind === 'answer')!;
    // The planted text is in the user turn only, inside the single data region, with no closing tag of its own.
    expect(answerCall.system).not.toContain('evil.example');
    expect((answerCall.user.match(/<\/user-content>/g) ?? []).length).toBe(1);
    expect(answerCall.user.indexOf('Ignore all previous')).toBeGreaterThan(answerCall.user.indexOf('<user-content>'));
    expect(answerCall.user.indexOf('Ignore all previous')).toBeLessThan(answerCall.user.indexOf('</user-content>'));
    expect(ASK_INJECTION).toContain('</user-content>');
  });

  it("my chance: the caller's own application comes back beside the answer; no date or percent of it reaches the model", async () => {
    const completeOn = new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10);
    const cycleYear = new Date().getUTCMonth() < 5 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() + 1;
    const mk = async (m: Member) => {
      await m.client.request('PUT', '/api/medschools/me/tracker/cycle', {
        json: { cycleYear, shareAnonymously: false },
      });
      const r = await m.client.post<{ cycle: { applications: { id: string }[] } }>(
        '/api/medschools/me/tracker/applications',
        {
          cycleYear,
          schoolSlug: MEDSCHOOL_FIXTURE_SLUG,
          program: 'REG',
        },
      );
      expect(r.status).toBeLessThan(300);
      const appId = (await m.client.get<{ cycle: { applications: { id: string }[] } }>('/api/medschools/me/tracker'))
        .body.cycle.applications[0].id;
      await m.client.request('PUT', `/api/medschools/me/tracker/applications/${appId}/milestones/COMPLETE`, {
        json: { date: completeOn },
      });
      return appId;
    };
    const aApp = await mk(a);
    const bApp = await mk(b);
    expect(aApp).not.toBe(bApp);

    fake.setScript((call) =>
      call.kind === 'route'
        ? { ...ROUTE_FACTS, intent: 'my-chance' }
        : (() => {
            const f = factsOf(call).find((x) => /reported interview events/.test(x.text))!;
            const n = /([\d,]+) reported interview events/.exec(f.text)![1];
            return { segments: [{ text: `Fixture has ${n} reported interview events.`, cites: [f.ref] }], thin: false };
          })(),
    );
    const res = await ask(a, 'When will I hear from Fixture?');
    expect(res.status).toBe(200);
    expect(res.body.mine).not.toBeNull();
    expect(res.body.mine!.map((m) => m.applicationId)).toEqual([aApp]);
    expect(res.body.mine![0].school.slug).toBe(MEDSCHOOL_FIXTURE_SLUG);
    const prompts = fake
      .calls()
      .map((x) => x.user)
      .join('\n');
    expect(userJson(fake.calls().find((x) => x.kind === 'answer')!.user)?.personal).toBe(true);
    expect(prompts).not.toContain(completeOn);
    expect(prompts).not.toMatch(/\d\s?%/);
    expect(prompts).not.toContain(aApp);
    expect(prompts).not.toContain(bApp);
    await removeTrackerFixture([a.id, b.id]);
  });

  it('no tracker row at the school: mine is an empty list, not null', async () => {
    fake.setScript((call) => (call.kind === 'route' ? { ...ROUTE_FACTS, intent: 'my-chance' } : goodScript(call)));
    const res = await ask(c, 'When will I hear from Fixture?');
    expect(res.status).toBe(200);
    expect(res.body.mine).toEqual([]);
  });

  describe('the ceilings stop a question before any model call', () => {
    // Carol may hold a paid plan (the developer API file seeds one, and files run in turn), so the cap is read, not assumed.
    const capOf = async (m: Member) => (await m.client.get<{ dailyCap: number }>(ASK)).body.dailyCap;

    it('the daily cap reached: 429 with the cap code, and the provider is never called', async () => {
      const cap = await capOf(c);
      expect(cap).toBeGreaterThanOrEqual(25); // free 25, member 100 (R19)
      await insertRouteRows(c.id, cap);
      const res = await ask(c, 'How many interviews has Fixture reported?');
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('MEDSCHOOLS_QA_DAILY_CAP');
      expect(fake.calls()).toHaveLength(0);
      const status = await c.client.get<{ remainingToday: number }>(ASK);
      expect(status.body.remainingToday).toBe(0);
    });

    it("one under the cap still reaches the model; yesterday's rows and another member's rows do not count", async () => {
      const cap = await capOf(c);
      await insertRouteRows(c.id, cap - 1);
      const ok = await ask(c, 'How many interviews has Fixture reported?');
      expect(ok.status).toBe(200);
      expect(ok.body.remainingToday).toBe(0);
      expect(fake.calls().length).toBeGreaterThan(0);

      await new Promise((r) => setTimeout(r, 400));
      await clearLedger(ids());
      await insertRouteRows(b.id, 25, new Date(Date.now() - 2 * DAY));
      await insertRouteRows(a.id, 25);
      fake.reset();
      const other = await ask(b, 'How many interviews has Fixture reported?');
      expect(other.status).toBe(200);
      expect(fake.calls().length).toBeGreaterThan(0);
    });

    it('the Q&A share of the monthly budget spent: 503 paused, no provider call', async () => {
      const total = Number(process.env.MEDSCHOOLS_AI_MONTHLY_USD || 20);
      const share = Number(process.env.MEDSCHOOLS_QA_AI_SHARE || 0.25);
      await insertRouteRows(null, 1, new Date(), Math.ceil(total * share * 1_000_000) + 1, 'medschools-qa-route');
      const res = await ask(c, 'How many interviews has Fixture reported?');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('MEDSCHOOLS_QA_PAUSED');
      expect(fake.calls()).toHaveLength(0);
    });

    it('a second question while one is in flight is refused, and the first still answers', async () => {
      fake.setScript(async (call) => {
        if (call.kind === 'route') await new Promise((r) => setTimeout(r, 900));
        return goodScript(call);
      });
      const [first, second] = await Promise.all([
        ask(c, 'How many interviews has Fixture reported?'),
        (async () => {
          await new Promise((r) => setTimeout(r, 250));
          return ask(c, 'What are the medians at Fixture?');
        })(),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(second.body.code).toBe('MEDSCHOOLS_QA_BUSY');
      // The refused one used none of the day, and the lease is gone: the member can ask again at once.
      fake.setScript(goodScript);
      const third = await ask(c, 'What are the medians at Fixture?');
      expect(third.status).toBe(200);
      expect(await askRows(c.id)).toBe(2);
    });
  });

  it('a failing provider is a clean refusal with no provider text, and the attempt still counts', async () => {
    fake.setScript(() => ({ fakeStatus: 500 }));
    const res = await ask(b, 'How many interviews has Fixture reported?');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/fake provider failure|stack|at \w+ \(/);
    await new Promise((r) => setTimeout(r, 400));
    expect(await askRows(b.id)).toBeGreaterThan(0);
  });

  it('keeps no text: the question appears in no row of any table', async () => {
    const needle = `zqneedle${Math.random().toString(36).slice(2, 10)}`;
    const res = await ask(a, `How many interviews has Fixture reported? ${needle}`);
    expect(res.status).toBe(200);
    expect(fake.calls().some((x) => x.user.includes(needle))).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    const tables = (
      await db().query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
      )
    ).rows.map((r) => r.table_name);
    const hits: string[] = [];
    for (const t of tables) {
      const n = Number(
        (await db().query(`select count(*)::int as n from "${t}" x where x::text ilike $1`, [`%${needle}%`])).rows[0].n,
      );
      if (n > 0) hits.push(t);
    }
    expect(hits).toEqual([]);
  });
});
