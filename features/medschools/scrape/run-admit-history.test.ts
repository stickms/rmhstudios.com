import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import { PROFILE_FLAG, RECENT_UPDATES, RESULT_STATUSES, RESULT_USERS } from './adapters/admit/queries';
import { createDailyBudget } from './request-budget';
import { admitHistoryOwed, runAdmitHistory, type AdmitHistoryDeps } from './run-admit-history';
import { runAdmitLive } from './run-admit-live';
import { ADMIT_GRAPHQL_PATH } from './sources';
import { assertNoLeak, createFakeHost, createFakePrisma, gqlKey, NEEDLES } from './test-support';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = new Date('2026-11-23T03:00:00.000Z');
const mk = (user: string, school: string, cycle: number, type: string) =>
  dedupeHash(SECRET, 'ADMIT', `author:${user}:${school}:${cycle}:${type}`);
const member = (user: string) => dedupeHash(SECRET, 'ADMIT', `member:${user}`);
const fx = (n: string) => readFileSync(join(__dirname, 'adapters', 'admit', '__fixtures__', `${n}.json`), 'utf8');

const resultsKey = (status: string, offset = 0) =>
  gqlKey(ADMIT_GRAPHQL_PATH, RESULT_USERS.operationName, {
    ...RESULT_USERS.variables,
    status: [status],
    limit: 100,
    offset,
  });
const flagKey = (userId: string) => gqlKey(ADMIT_GRAPHQL_PATH, PROFILE_FLAG.operationName, { userId });
const FEED_KEY = gqlKey(ADMIT_GRAPHQL_PATH, RECENT_UPDATES.operationName, {
  filterOwnSchools: false,
  slug: 'allSchools',
});
const usersBody = (ids: string[]) =>
  JSON.stringify({ data: { getAllCycleResults: ids.map((user_id) => ({ user_id })) } });
const ent = (over: Record<string, unknown> = {}) => ({
  school: { slug: 'harvard-medical-school' },
  secondary_submitted: null,
  interview_received: null,
  decision_date: null,
  decision: null,
  ...over,
});
const profile = (history: unknown[], mdPhd: boolean | null = false) =>
  JSON.stringify({ data: { getCycleTrackProfileByUserId: { md_phd: mdPhd, history } } });
const ERRORS = JSON.stringify({ errors: [{ message: 'hidden' }], data: null });

/** Every status lists the same users; profiles are keyed by user id. */
function routesFor(users: string[], profiles: Record<string, string | null>): Record<string, string | null> {
  const r: Record<string, string | null> = {};
  for (const st of RESULT_STATUSES) r[resultsKey(st)] = usersBody(users);
  for (const [u, body] of Object.entries(profiles)) r[flagKey(u)] = body;
  return r;
}

function setup(routes: Record<string, string | null>, deps: Partial<AdmitHistoryDeps> = {}, fail = 3) {
  const fake = createFakePrisma();
  fake.tables.medSchool!.push({ id: 's1', slug: 'harvard', active: true }, { id: 's2', slug: 'yale', active: true });
  fake.tables.medSchoolAlias!.push(
    { id: 'a1', schoolId: 's1', source: 'ADMIT', sourceKey: 'harvard-medical-school' },
    { id: 'a2', schoolId: 's2', source: 'ADMIT', sourceKey: 'yale-school-of-medicine' },
  );
  const live = { routes };
  const host = createFakeHost((p) => live.routes[p] ?? null, fail);
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  const run = (over: Partial<AdmitHistoryDeps> = {}) =>
    runAdmitHistory(
      {
        prisma: fake.prisma,
        host: host.host,
        secret: SECRET,
        shouldStop: () => false,
        log,
        now: () => NOW,
        ...deps,
        ...over,
      },
      { trigger: 'MANUAL' },
    );
  const events = () => fake.tables.medCycleEvent! as Array<Record<string, unknown>>;
  const counts = () => fake.tables.medCycleCount! as Array<Record<string, unknown>>;
  const members = () => fake.tables.medAdmitMember! as Array<Record<string, unknown>>;
  const profileRequests = () => host.requestedPosts.filter((p) => p.op === PROFILE_FLAG.operationName).length;
  return { ...fake, ...host, live, run, logs, events, counts, members, profileRequests };
}

describe('runAdmitHistory', () => {
  it('ingests a member once: every history entry becomes a member-keyed event with the md_phd program, rolled up', async () => {
    const t = setup(
      routesFor(['u1'], {
        u1: profile(
          [
            ent({
              secondary_submitted: '2026-07-12T16:00:00.000Z',
              interview_received: '2026-10-02T16:00:00.000Z',
              decision_date: '2026-11-10T16:00:00.000Z',
              decision: 'ACCEPTED',
            }),
            ent({
              school: { slug: 'yale-school-of-medicine' },
              decision_date: '2026-09-15T16:00:00.000Z',
              decision: 'REJECTED',
            }),
          ],
          true,
        ),
      }),
    );
    const s = await t.run();
    expect(s).toMatchObject({ status: 'OK', discovered: 1, fetched: 1, eventsCreated: 4, remaining: 0 });
    expect(
      t
        .events()
        .map((e) => e.dedupeHash)
        .sort(),
    ).toEqual(
      [
        mk('u1', 's1', 2027, 'SECONDARY'),
        mk('u1', 's1', 2027, 'INTERVIEW'),
        mk('u1', 's1', 2027, 'ACCEPTANCE'),
        mk('u1', 's2', 2027, 'REJECTION'),
      ].sort(),
    );
    expect(t.events().every((e) => e.program === 'PHD' && e.source === 'ADMIT')).toBe(true);
    expect(t.counts()).toHaveLength(4);
    expect(t.counts().every((c) => c.count === 1 && c.source === 'ADMIT' && c.program === 'PHD')).toBe(true);
    // the polite backfill session
    expect(t.sessions).toEqual([{ spacingMs: 3000, jitterMs: 1000 }]);
    // progress is a hash, marked after the write
    expect(t.members()).toEqual([expect.objectContaining({ memberHash: member('u1'), state: 'DONE' })]);
  });

  it('resumes: a settled member costs no profile request, and a repeat run creates nothing', async () => {
    const t = setup(routesFor(['u1'], { u1: profile([ent({ interview_received: '2026-10-02T16:00:00.000Z' })]) }));
    await t.run();
    expect(t.profileRequests()).toBe(1);
    const second = await t.run();
    expect(second).toMatchObject({ status: 'OK', discovered: 1, settled: 1, fetched: 0, eventsCreated: 0 });
    expect(t.profileRequests()).toBe(1);
    expect(t.events()).toHaveLength(1);
  });

  it('the cap stops the run PARTIAL with the rest remaining; the next run continues with the others', async () => {
    const t = setup(
      routesFor(['u1', 'u2', 'u3'], {
        u1: profile([ent({ interview_received: '2026-10-01T16:00:00.000Z' })]),
        u2: profile([ent({ interview_received: '2026-10-02T16:00:00.000Z' })]),
        u3: profile([ent({ interview_received: '2026-10-03T16:00:00.000Z' })]),
      }),
    );
    const first = await t.run({ maxProfiles: 2 });
    expect(first).toMatchObject({ status: 'PARTIAL', fetched: 2, remaining: 1, eventsCreated: 2 });
    const second = await t.run({ maxProfiles: 2 });
    expect(second).toMatchObject({ status: 'OK', settled: 2, fetched: 1, remaining: 0, eventsCreated: 1 });
    expect(t.events()).toHaveLength(3);
    expect(t.profileRequests()).toBe(3);
  });

  it('works in batches: a batch size of one still rolls up and marks each member', async () => {
    const t = setup(
      routesFor(['u1', 'u2'], {
        u1: profile([ent({ interview_received: '2026-10-01T16:00:00.000Z' })], true),
        u2: profile([ent({ interview_received: '2026-10-01T18:00:00.000Z' })], true),
      }),
    );
    const s = await t.run({ batchSize: 1 });
    expect(s).toMatchObject({ status: 'OK', fetched: 2, eventsCreated: 2 });
    // two members, same day, same school: one cell with count 2
    expect(t.counts()).toHaveLength(1);
    expect(t.counts()[0]!.count).toBe(2);
    expect(t.members()).toHaveLength(2);
  });

  it('never double counts with the live feed, whichever path saw the member first', async () => {
    // history first: acceptance dated the 12th; then the live feed reports the same acceptance on the 10th
    const t = setup({
      ...routesFor(['u1'], {
        u1: profile([ent({ decision_date: '2026-11-12T16:00:00.000Z', decision: 'ACCEPTED' })], false),
      }),
      [FEED_KEY]: JSON.stringify({
        data: {
          getRecentSchoolCycleUpdates: [
            {
              cycle_update_id: 'upd-77',
              school: { slug: 'harvard-medical-school' },
              user_id: 'u1',
              current_status: 'ACCEPTED',
              current_status_date: '2026-11-10T04:00:00.000Z',
            },
          ],
        },
      }),
    });
    await t.run();
    expect(t.events()).toHaveLength(1);
    expect(t.counts().map((c) => (c.date as Date).toISOString().slice(0, 10))).toEqual(['2026-11-12']);
    const live = await runAdmitLive(
      {
        prisma: t.prisma,
        host: t.host,
        secret: SECRET,
        shouldStop: () => false,
        log: { info() {}, warn() {}, error() {} },
        now: () => NOW,
      },
      { trigger: 'MANUAL' },
    );
    expect(live).toMatchObject({ status: 'OK', created: 0, alreadyStored: 1, moved: 1 });
    // still one event, now on the earlier day, and the old day's cell is gone, not left behind
    expect(t.events()).toHaveLength(1);
    expect((t.events()[0]!.occurredAt as Date).toISOString()).toBe('2026-11-10T04:00:00.000Z');
    expect(t.counts().map((c) => [(c.date as Date).toISOString().slice(0, 10), c.count])).toEqual([['2026-11-10', 1]]);
    // and the reverse order: a fresh database where the live feed comes first, then the history
    const u = setup({
      ...routesFor(['u1'], {
        u1: profile([ent({ decision_date: '2026-11-12T16:00:00.000Z', decision: 'ACCEPTED' })], false),
      }),
      [FEED_KEY]: JSON.stringify({
        data: {
          getRecentSchoolCycleUpdates: [
            {
              cycle_update_id: 'upd-77',
              school: { slug: 'harvard-medical-school' },
              user_id: 'u1',
              current_status: 'ACCEPTED',
              current_status_date: '2026-11-10T04:00:00.000Z',
            },
          ],
        },
      }),
    });
    const l2 = await runAdmitLive(
      {
        prisma: u.prisma,
        host: u.host,
        secret: SECRET,
        shouldStop: () => false,
        log: { info() {}, warn() {}, error() {} },
        now: () => NOW,
      },
      { trigger: 'MANUAL' },
    );
    // the live feed ingested the new member's history from the lookup it already made
    expect(l2).toMatchObject({ status: 'OK', membersIngested: 1 });
    expect(u.events()).toHaveLength(1);
    const h2 = await u.run();
    expect(h2).toMatchObject({ status: 'OK', settled: 1, fetched: 0, eventsCreated: 0 });
    expect(u.events()).toHaveLength(1);
    expect(u.counts().map((c) => c.count)).toEqual([1]);
  });

  it('a lookup that errors is retried next run; three failures park the member for a week', async () => {
    const t = setup(routesFor(['u1'], { u1: ERRORS }));
    for (let i = 1; i <= 3; i++) {
      const s = await t.run();
      expect(s).toMatchObject({ status: 'PARTIAL', failedLookups: 1, fetched: 0 });
      expect(t.members()[0]).toMatchObject({ state: 'FAILED', attempts: i });
    }
    const parked = await t.run();
    expect(parked).toMatchObject({ settled: 1, failedLookups: 0 });
    expect(t.profileRequests()).toBe(3);
  });

  it('a hidden or missing profile is marked done with no events', async () => {
    const t = setup(routesFor(['u1'], { u1: JSON.stringify({ data: { getCycleTrackProfileByUserId: null } }) }));
    const s = await t.run();
    expect(s).toMatchObject({ status: 'OK', fetched: 1, noProfile: 1, eventsCreated: 0 });
    expect(t.members()[0]).toMatchObject({ state: 'DONE' });
  });

  it('a halted source ends the run PARTIAL; written batches stay, the rest remain', async () => {
    const t = setup(
      routesFor(['u1', 'u2', 'u3'], {
        u1: profile([ent({ interview_received: '2026-10-01T16:00:00.000Z' })]),
        u2: null, // a plain 404, counted by the client: with a limit of one failure the source halts
        u3: profile([ent({ interview_received: '2026-10-03T16:00:00.000Z' })]),
      }),
      {},
      1,
    );
    const s = await t.run({ batchSize: 1 });
    expect(s.status).toBe('PARTIAL');
    expect(s.eventsCreated).toBe(1);
    expect(s.remaining).toBeGreaterThan(0);
    expect(t.requestedPosts.some((p) => JSON.stringify(p.variables).includes('u3'))).toBe(false);
  });

  it('counts entries it cannot use and unknown schools, and writes nothing for them', async () => {
    const t = setup(
      routesFor(['u1'], {
        u1: profile([
          ent({ decision: 'ACCEPTED' }),
          ent({ decision_date: '2026-11-10T00:00:00.000Z', decision: 'MAYBE' }),
          ent({ school: { slug: 'nowhere-university' }, interview_received: '2026-10-02T16:00:00.000Z' }),
        ]),
      }),
    );
    const s = await t.run();
    expect(s).toMatchObject({ status: 'OK', entriesSkipped: 2, misses: 1, eventsCreated: 0 });
    expect(t.tables.medSchoolAliasMiss).toHaveLength(1);
  });

  it('a failed discovery status is counted and the run is PARTIAL', async () => {
    const routes = routesFor(['u1'], { u1: profile([]) });
    routes[resultsKey('HOLD')] = ERRORS;
    const t = setup(routes);
    expect(await t.run()).toMatchObject({ status: 'PARTIAL', failedStatuses: 1, fetched: 1 });
  });

  it('refuses without the secret, makes no request, and writes no event', async () => {
    const t = setup(routesFor(['u1'], { u1: profile([]) }));
    const s = await t.run({ secret: 'short' });
    expect(s.status).toBe('FAILED');
    expect(t.requestedPosts).toHaveLength(0);
    expect(t.tables.medSourceRun).toHaveLength(0);
  });

  it('runs the one-time re-key first: old per-update ADMIT events are gone before any new write, once only', async () => {
    const t = setup(routesFor(['u1'], { u1: profile([ent({ interview_received: '2026-10-02T16:00:00.000Z' })]) }));
    t.tables.medCycleEvent!.push({
      id: 'old',
      schoolId: 's1',
      source: 'ADMIT',
      dedupeHash: 'per-update-hash',
      program: 'REG',
      cycleYear: 2027,
      eventType: 'INTERVIEW',
      occurredAt: new Date('2026-10-02T04:00:00.000Z'),
    });
    t.tables.medCycleCount!.push({
      id: 'oldc',
      schoolId: 's1',
      source: 'ADMIT',
      program: 'REG',
      cycleYear: 2027,
      date: new Date('2026-10-02T00:00:00.000Z'),
      eventType: 'INTERVIEW',
      count: 1,
    });
    await t.run();
    expect(t.events().map((e) => e.dedupeHash)).toEqual([mk('u1', 's1', 2027, 'INTERVIEW')]);
    expect(t.counts().map((c) => c.id)).not.toContain('oldc');
    expect(t.counts()).toHaveLength(1);
    await t.run();
    const runs = (t.tables.medSourceRun as Array<{ job: string }>).filter((r) => r.job === 'admit-rekey');
    expect(runs).toHaveLength(1);
    expect(t.events()).toHaveLength(1);
  });

  it('does not run, and writes nothing, when the re-key cannot complete', async () => {
    const t = setup(routesFor(['u1'], { u1: profile([ent({ interview_received: '2026-10-02T16:00:00.000Z' })]) }));
    t.prisma.medCycleEvent.deleteMany = (async () => {
      throw new Error('boom');
    }) as never;
    const s = await t.run();
    expect(s.status).toBe('FAILED');
    expect(t.requestedPosts).toHaveLength(0);
    expect(t.events()).toHaveLength(0);
  });

  it('stops at the deadline', async () => {
    const t = setup(routesFor(['u1'], { u1: profile([ent({ interview_received: '2026-10-02T16:00:00.000Z' })]) }));
    const s = await t.run({ deadlineMs: 0 });
    expect(s).toMatchObject({ status: 'PARTIAL', fetched: 0, remaining: 1 });
  });

  it('run record is counters only and admitHistoryOwed turns false after a pass', async () => {
    const t = setup(routesFor(['u1'], { u1: profile([ent({ interview_received: '2026-10-02T16:00:00.000Z' })]) }));
    expect(await admitHistoryOwed(t.prisma)).toBe(true);
    await t.run();
    const rec = (t.tables.medSourceRun as Array<{ job: string; stats: Record<string, unknown> }>).find(
      (r) => r.job === 'admit-history',
    )!;
    expect(Object.values(rec.stats).every((v) => typeof v === 'number' || typeof v === 'boolean')).toBe(true);
    expect(await admitHistoryOwed(t.prisma)).toBe(false);
  });
});

describe('runAdmitHistory budgets', () => {
  const users = ['u1', 'u2', 'u3'];
  const profiles = Object.fromEntries(
    users.map((u, i) => [u, profile([ent({ interview_received: `2026-10-0${i + 1}T16:00:00.000Z` })])]),
  );

  it('the job quota ends the run PARTIAL when spent and the next day continues; it is shared by every run of the day', async () => {
    const t = setup(routesFor(users, profiles));
    let day = Date.UTC(2026, 10, 23, 3, 0, 0);
    const quota = createDailyBudget(
      t.prisma,
      'ADMIT:history',
      () => 2,
      () => new Date(day),
    );
    const first = await t.run({ quota });
    expect(first).toMatchObject({ status: 'PARTIAL', fetched: 2, budgetSpent: true, remaining: 1 });
    // a second run the same day (restart, manual) gets nothing: the quota is persisted, not per run
    const again = await t.run({
      quota: createDailyBudget(
        t.prisma,
        'ADMIT:history',
        () => 2,
        () => new Date(day),
      ),
    });
    expect(again).toMatchObject({ status: 'PARTIAL', fetched: 0, budgetSpent: true });
    day += 86_400_000;
    const next = await t.run({ quota });
    expect(next).toMatchObject({ status: 'OK', fetched: 1, budgetSpent: false, remaining: 0 });
    expect(t.events()).toHaveLength(3);
  });

  it('the host budget halts the session mid-run: PARTIAL, budgetSpent, written batches kept', async () => {
    const fake = createFakePrisma();
    const t = setup(routesFor(users, profiles));
    const host = createFakeHost((p) => t.live.routes[p] ?? null, 3);
    // a host whose daily budget allows the robots-free fake: 6 discovery pages + 1 profile
    const budget = createDailyBudget(
      fake.prisma,
      'ADMIT',
      () => 7,
      () => new Date(NOW),
    );
    const { BudgetExhaustedError } = await import('./http');
    const gated = {
      session: (o?: { spacingMs?: number; jitterMs?: number }) => {
        const inner = host.host.session(o);
        let spent = false;
        return {
          get: inner.get.bind(inner),
          async post(path: string, body: string) {
            if (!(await budget.take())) {
              spent = true;
              throw new BudgetExhaustedError();
            }
            return inner.post(path, body);
          },
          noteSuccess: () => inner.noteSuccess(),
          noteFailure: (r: string) => inner.noteFailure(r),
          get halted() {
            return spent || inner.halted;
          },
          get requests() {
            return inner.requests;
          },
          get lastFailure() {
            return spent ? 'daily request budget spent' : inner.lastFailure;
          },
        };
      },
    };
    const s = await t.run({ host: gated, batchSize: 1 });
    expect(s.status).toBe('PARTIAL');
    expect(s.budgetSpent).toBe(true);
    expect(s.fetched).toBe(1);
    expect(s.remaining).toBe(2);
    expect(t.events()).toHaveLength(1);
  });
});

describe('Admit history anonymization boundary', () => {
  const USER = 'user-hostile-9931';
  async function hostileRun() {
    const routes: Record<string, string | null> = {};
    for (const st of RESULT_STATUSES) routes[resultsKey(st)] = fx('cycle-results-users-hostile');
    routes[flagKey(USER)] = fx('profile-history-hostile');
    const t = setup(routes);
    const s = await t.run();
    return { t, s };
  }

  it('no person field, id, GPA or MCAT reaches any write, table or log line', async () => {
    const { t, s } = await hostileRun();
    expect(s).toMatchObject({ status: 'OK', discovered: 1, eventsCreated: 5 });
    const needles = [...NEEDLES, '3.987', '527', USER];
    assertNoLeak(t.writes, needles);
    assertNoLeak([t.tables], needles);
    assertNoLeak(t.logs, needles);
    expect(JSON.stringify([t.writes, t.tables])).not.toContain('user_id');
  });

  it('event rows keep the anonymous key set; the only member-shaped column is the keyed hash table', async () => {
    const { t } = await hostileRun();
    for (const e of t.events())
      expect(
        Object.keys(e)
          .filter((k) => k !== 'id')
          .sort(),
      ).toEqual(['cycleYear', 'dedupeHash', 'eventType', 'inState', 'occurredAt', 'program', 'schoolId', 'source']);
    expect(t.members()).toHaveLength(1);
    expect(
      Object.keys(t.members()[0]!)
        .filter((k) => k !== 'id')
        .sort(),
    ).toEqual(['attempts', 'createdAt', 'memberHash', 'state', 'updatedAt']);
    // the member hash is not any event key, so the table does not join to the events
    const keys = new Set(t.events().map((e) => e.dedupeHash));
    expect(keys.has(t.members()[0]!.memberHash)).toBe(false);
    expect(t.members()[0]!.memberHash).toBe(member(USER));
  });
});
