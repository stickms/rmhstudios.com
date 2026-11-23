import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BudgetExhaustedError, type PoliteClient, type PoliteHost } from './http';
import { readFixture as readSdnFixture } from './adapters/sdn/test-fixtures';
import {
  SECONDARIES_CRON,
  SECONDARIES_FRESH_MS,
  SECONDARIES_MIN_INTERVAL_MS,
  SECONDARIES_SDN_JITTER_MS,
  SECONDARIES_SDN_SPACING_MS,
  runSecondaries,
  type SecondariesDeps,
} from './run-secondaries';
import { ADMIT_SECONDARY_URL, SOURCES } from './sources';
import { essayQuestionsUrl } from './adapters/sdn';
import { NEEDLES, assertNoLeak, createFakeHost, createFakePrisma, httpStatusRoute } from './test-support';
import type { MedSecondaryObservationRow, MedSecondaryPromptRow } from './types';

const readAdmitFixture = (name: string): string =>
  readFileSync(join(__dirname, 'adapters', 'admit', '__fixtures__', name), 'utf8');

const NOW = new Date('2026-11-25T05:35:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const HARVARD = 'harvard-medical-school';
const ADMIT_URL = ADMIT_SECONDARY_URL(HARVARD);
const COLUMBIA_URL = essayQuestionsUrl('COL', 'columbia');
const admitPage = readAdmitFixture('secondary-essays-harvard.html');
const sdnPage = readSdnFixture('essays-columbia.html');

const CLOUDFLARE =
  '<html><head><title>Just a moment...</title></head><body><noscript>Enable JavaScript and cookies to continue</noscript></body></html>';

interface Opts {
  schools?: { id: string; slug: string; active: boolean }[];
  admitAliases?: Record<string, string>; // schoolId -> slug
  sdnAliases?: Record<string, string>; // schoolId -> summary key
  admitRoutes?: (url: string) => string | null;
  sdnRoutes?: (url: string) => string | null;
  deps?: Partial<SecondariesDeps>;
  maxFailures?: number;
}

function setup(o: Opts = {}) {
  const fake = createFakePrisma();
  const schools = o.schools ?? [
    { id: 's1', slug: 'harvard', active: true },
    { id: 's2', slug: 'columbia', active: true },
  ];
  fake.tables.medSchool!.push(...schools);
  const admitAliases = o.admitAliases ?? { s1: HARVARD, s2: 'columbia-university-vagelos' };
  const sdnAliases = o.sdnAliases ?? { s1: 'summary:HMS/harvard', s2: 'summary:COL/columbia' };
  for (const [schoolId, sourceKey] of Object.entries(admitAliases))
    fake.tables.medSchoolAlias!.push({ id: `a-${schoolId}`, schoolId, source: 'ADMIT', sourceKey });
  for (const [schoolId, sourceKey] of Object.entries(sdnAliases))
    fake.tables.medSchoolAlias!.push({ id: `d-${schoolId}`, schoolId, source: 'SDN', sourceKey });

  const live = { now: NOW };
  const admit = createFakeHost((p) => (o.admitRoutes ? o.admitRoutes(p) : admitPage), o.maxFailures ?? 3);
  const sdn = createFakeHost((p) => (o.sdnRoutes ? o.sdnRoutes(p) : sdnPage), o.maxFailures ?? 3);
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  const run = (trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' = 'MANUAL', deps: Partial<SecondariesDeps> = {}) =>
    runSecondaries(
      {
        prisma: fake.prisma,
        admitHost: admit.host,
        sdnHost: sdn.host,
        shouldStop: () => false,
        log,
        now: () => live.now,
        ...o.deps,
        ...deps,
      },
      { trigger },
    );
  const prompts = () => fake.tables.medSecondaryPrompt as MedSecondaryPromptRow[];
  const obs = () => fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
  const checks = () =>
    fake.tables.medSecondaryCheck as {
      schoolId: string;
      source: string;
      status: string;
      promptCount: number;
      checkedAt: Date;
    }[];
  const runs = () =>
    fake.tables.medSourceRun as {
      source: string;
      job: string;
      status: string;
      trigger: string;
      stats: Record<string, unknown>;
      error: string | null;
    }[];
  return { ...fake, live, admit, sdn, logs, log, run, prompts, obs, checks, runs };
}

describe('runSecondaries', () => {
  it('a first run reads each school once per source, stores prompts and observations and a check per school and source', async () => {
    const t = setup();
    const s = await t.run();
    expect(s.status).toBe('OK');
    expect(s.outcome).toBe('ran');
    expect(t.admit.requested.sort()).toEqual([ADMIT_URL, ADMIT_SECONDARY_URL('columbia-university-vagelos')].sort());
    expect(t.sdn.requested.sort()).toEqual([essayQuestionsUrl('HMS', 'harvard'), COLUMBIA_URL].sort());
    expect(s.admit).toMatchObject({
      schools: 2,
      fetched: 2,
      fresh: 0,
      unavailable: 0,
      empty: 0,
      failed: 0,
      requests: 2,
    });
    expect(s.sdn).toMatchObject({ schools: 2, fetched: 2, failed: 0, requests: 2 });

    expect(t.checks()).toHaveLength(4);
    expect(t.checks().every((c) => c.status === 'OK')).toBe(true);
    // Admit's page: five distinct wordings over seven cycle observations; every observation carries the page URL.
    const harvardPrompts = t.prompts().filter((p) => p.schoolId === 's1');
    expect(new Set(harvardPrompts.map((p) => `${p.program}/${p.key}`)).size).toBe(harvardPrompts.length);
    const admitObs = t.obs().filter((o) => o.source === 'ADMIT');
    expect(
      admitObs.every(
        (o) => o.sourceRef === ADMIT_URL || o.sourceRef === ADMIT_SECONDARY_URL('columbia-university-vagelos'),
      ),
    ).toBe(true);
    expect(
      t
        .obs()
        .filter((o) => o.source === 'SDN')
        .every((o) => o.sourceRef?.startsWith('https://www.studentdoctor.net/')),
    ).toBe(true);
    // Two rows per source in the ledger, job 'secondaries'.
    expect(
      t
        .runs()
        .map((r) => `${r.source}/${r.job}/${r.status}`)
        .sort(),
    ).toEqual(['ADMIT/secondaries/OK', 'SDN/secondaries/OK']);
  });

  it('a second manual run the same day is all fresh (no request); three days later it reads again and changes nothing', async () => {
    const t = setup();
    await t.run();
    const before = { prompts: t.prompts().length, obs: t.obs().length };
    const again = await t.run();
    expect(again.admit).toMatchObject({ fresh: 2, fetched: 0 });
    expect(again.sdn).toMatchObject({ fresh: 2, fetched: 0 });
    expect(t.admit.requested).toHaveLength(2);

    t.live.now = new Date(NOW.getTime() + 3 * DAY);
    const later = await t.run();
    expect(later.admit).toMatchObject({ fresh: 0, fetched: 2 });
    expect(t.admit.requested).toHaveLength(4);
    expect(t.prompts()).toHaveLength(before.prompts);
    expect(t.obs()).toHaveLength(before.obs);
    expect(t.checks().every((c) => c.checkedAt.getTime() === t.live.now.getTime())).toBe(true);
  });

  it('walks the stalest school first, never-checked before any, one request at a time on the right hosts at 3 s plus jitter', async () => {
    const t = setup({
      schools: ['s1', 's2', 's3'].map((id) => ({ id, slug: id, active: true })),
      admitAliases: { s1: 'one', s2: 'two', s3: 'three' },
      sdnAliases: {},
    });
    t.tables.medSecondaryCheck!.push(
      {
        id: 'c1',
        schoolId: 's1',
        source: 'ADMIT',
        checkedAt: new Date(NOW.getTime() - 20 * DAY),
        status: 'OK',
        promptCount: 1,
      },
      {
        id: 'c2',
        schoolId: 's2',
        source: 'ADMIT',
        checkedAt: new Date(NOW.getTime() - 40 * DAY),
        status: 'OK',
        promptCount: 1,
      },
    );
    await t.run();
    // s3 was never checked, then s2 (oldest), then s1.
    expect(t.admit.requested).toEqual([
      ADMIT_SECONDARY_URL('three'),
      ADMIT_SECONDARY_URL('two'),
      ADMIT_SECONDARY_URL('one'),
    ]);
    // The Admit pass uses the host's own 3 s plus 0-1 s of jitter; the SDN pass is held to the same owner rule.
    expect(t.admit.sessions).toEqual([
      { spacingMs: SOURCES.ADMIT_WEB.spacingMs, jitterMs: SOURCES.ADMIT_WEB.jitterMs },
    ]);
    expect(SOURCES.ADMIT_WEB.spacingMs).toBeGreaterThanOrEqual(3000);
    expect(t.sdn.sessions).toEqual([{ spacingMs: SECONDARIES_SDN_SPACING_MS, jitterMs: SECONDARIES_SDN_JITTER_MS }]);
    expect(SECONDARIES_SDN_SPACING_MS).toBeGreaterThanOrEqual(3000);
    expect(SECONDARIES_SDN_JITTER_MS).toBeGreaterThan(0);
  });

  it('skips an inactive school and takes one key per school', async () => {
    const t = setup({
      schools: [
        { id: 's1', slug: 'a', active: true },
        { id: 's2', slug: 'b', active: false },
      ],
      admitAliases: { s1: 'alpha', s2: 'beta' },
      sdnAliases: {},
    });
    const s = await t.run();
    expect(s.admit.schools).toBe(1);
    expect(t.admit.requested).toEqual([ADMIT_SECONDARY_URL('alpha')]);
  });

  it('a malformed alias key is skipped and makes the run partial, never a request', async () => {
    const t = setup({ admitAliases: { s1: 'good-one', s2: 'bad/../key' }, sdnAliases: {} });
    const s = await t.run();
    expect(t.admit.requested).toEqual([ADMIT_SECONDARY_URL('good-one')]);
    expect(s.admit.failed).toBe(1);
    expect(s.status).toBe('PARTIAL');
  });

  it('three Cloudflare pages halt the Admit pass (PARTIAL) and the SDN pass still runs', async () => {
    const t = setup({
      schools: ['s1', 's2', 's3', 's4', 's5'].map((id) => ({ id, slug: id, active: true })),
      admitAliases: { s1: 'one', s2: 'two', s3: 'three', s4: 'four', s5: 'five' },
      sdnAliases: { s1: 'summary:A/one' },
      admitRoutes: () => CLOUDFLARE,
    });
    const s = await t.run();
    expect(s.status).toBe('PARTIAL');
    expect(s.admit.failed).toBe(3);
    expect(s.admit.fetched).toBe(0);
    expect(t.admit.requested).toHaveLength(3);
    expect(s.sdn).toMatchObject({ fetched: 1, failed: 0 });
    expect(t.runs().find((r) => r.source === 'ADMIT')).toMatchObject({ status: 'PARTIAL' });
    expect(t.runs().find((r) => r.source === 'SDN')).toMatchObject({ status: 'OK' });
    // Nothing was stored for the halted source.
    expect(t.obs().filter((o) => o.source === 'ADMIT')).toHaveLength(0);
  });

  it('a spent daily budget stops the pass as PARTIAL without counting a failure', async () => {
    const t = setup();
    const exhausted: PoliteHost = {
      session: () =>
        ({
          get: async () => {
            throw new BudgetExhaustedError();
          },
          post: async () => {
            throw new BudgetExhaustedError();
          },
          noteSuccess: () => undefined,
          noteFailure: () => undefined,
          halted: true,
          requests: 0,
          lastFailure: 'daily request budget spent',
        }) satisfies PoliteClient,
    };
    const s = await t.run('MANUAL', { admitHost: exhausted });
    expect(s.status).toBe('PARTIAL');
    expect(s.admit).toMatchObject({ failed: 0, fetched: 0 });
    expect(s.sdn.fetched).toBe(2);
  });

  it.each([
    ['the markup changed', 'secondary-essays-changed.html'],
    ['the page says it has no prompts', 'secondary-essays-empty.html'],
    ['the page has too many prompts', 'secondary-essays-toomany.html'],
  ])('when %s, stored rows are untouched and the check is UNAVAILABLE; the run is OK', async (_name, fixture) => {
    const one = {
      schools: [{ id: 's1', slug: 'harvard', active: true }],
      admitAliases: { s1: HARVARD },
      sdnAliases: {},
    };
    // A good run leaves rows behind...
    const good = setup(one);
    await good.run();
    expect(good.obs().length).toBeGreaterThan(0);
    // ...then the same school reads a page that gives nothing recognisable.
    const t = setup({ ...one, admitRoutes: () => readAdmitFixture(fixture) });
    t.tables.medSecondaryPrompt!.push(...good.prompts().map((r) => ({ ...r })));
    t.tables.medSecondaryObservation!.push(...good.obs().map((r) => ({ ...r })));
    const frozen = JSON.stringify([t.prompts(), t.obs()]);
    const s = await t.run();
    expect(s.status).toBe('OK');
    expect(s.admit).toMatchObject({ unavailable: 1, failed: 0, fetched: 0 });
    expect(t.checks()[0]).toMatchObject({ source: 'ADMIT', status: 'UNAVAILABLE', promptCount: 0 });
    expect(JSON.stringify([t.prompts(), t.obs()])).toBe(frozen);
  });

  it('an empty page for a school with nothing stored is EMPTY, and a 404 is unavailable, never a failure', async () => {
    const empty = setup({
      admitAliases: { s1: HARVARD, s2: 'other' },
      sdnAliases: {},
      admitRoutes: () => readAdmitFixture('secondary-essays-empty.html'),
    });
    const a = await empty.run();
    expect(a.admit).toMatchObject({ empty: 2, unavailable: 0, failed: 0 });
    expect(empty.checks().every((c) => c.status === 'EMPTY')).toBe(true);

    const missing = setup({ admitAliases: { s1: HARVARD, s2: 'other' }, sdnAliases: {}, admitRoutes: () => null });
    const b = await missing.run();
    expect(b.status).toBe('OK');
    expect(b.admit).toMatchObject({ empty: 2, failed: 0 });
    expect(missing.runs()[0]?.status).toBe('OK');
  });

  it('a robots refusal or transport failure (status 0) is a failed page, not an empty one', async () => {
    const t = setup({ admitAliases: { s1: HARVARD }, sdnAliases: {}, admitRoutes: () => httpStatusRoute(0) });
    const s = await t.run();
    expect(s.admit).toMatchObject({ failed: 1, empty: 0, unavailable: 0 });
    expect(s.status).toBe('PARTIAL');
    expect(t.checks()).toHaveLength(0);
  });

  it('stops the pass when five pages in a row are unreadable (the markup changed everywhere)', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `s${i + 1}`);
    const t = setup({
      schools: ids.map((id) => ({ id, slug: id, active: true })),
      admitAliases: Object.fromEntries(ids.map((id) => [id, `slug-${id}`])),
      sdnAliases: {},
      admitRoutes: () => readAdmitFixture('secondary-essays-changed.html'),
    });
    const s = await t.run();
    expect(t.admit.requested).toHaveLength(5);
    expect(s.status).toBe('PARTIAL');
    expect(s.admit.unavailable + s.admit.empty).toBe(5);
  });

  describe('the persisted minimum interval', () => {
    it('a CRON run within 60 h of a real one is skipped with zero requests; MANUAL bypasses it', async () => {
      const t = setup();
      expect((await t.run('CRON')).outcome).toBe('ran');
      const requests = t.admit.requested.length + t.sdn.requested.length;
      t.live.now = new Date(NOW.getTime() + 24 * HOUR);
      const skipped = await t.run('CRON');
      expect(skipped.outcome).toBe('skipped-min-interval');
      expect(skipped.status).toBe('OK');
      expect(t.admit.requested.length + t.sdn.requested.length).toBe(requests);
      // The zero-work rows do not extend the window: 60 h after the REAL run a cron runs again.
      t.live.now = new Date(NOW.getTime() + SECONDARIES_MIN_INTERVAL_MS + HOUR);
      expect((await t.run('CRON')).outcome).toBe('ran');
      // MANUAL inside the window runs (the schools are fresh, so it reads nothing, but it is not skipped).
      expect((await t.run('MANUAL')).outcome).toBe('ran');
    });

    it('a ledger read error fails closed: the run is skipped', async () => {
      const t = setup();
      const broken = {
        ...t.prisma,
        medSourceRun: {
          ...t.prisma.medSourceRun,
          findMany: async () => {
            throw new Error('ledger down');
          },
        },
      };
      const s = await t.run('CRON', { prisma: broken });
      expect(s.outcome).toBe('skipped-min-interval');
      expect(t.admit.requested).toHaveLength(0);
    });

    it('records the zero-work outcome so it never extends the window', async () => {
      const t = setup();
      await t.run('CRON');
      t.live.now = new Date(NOW.getTime() + HOUR);
      await t.run('CRON');
      const skippedRows = t.runs().filter((r) => r.stats.outcome === 'skipped-min-interval');
      expect(skippedRows).toHaveLength(2);
      expect(skippedRows.every((r) => r.stats.requests === 0)).toBe(true);
    });
  });

  describe('limits', () => {
    it('shouldStop after the first school ends PARTIAL and leaves the rest', async () => {
      const t = setup();
      const s = await t.run('MANUAL', { shouldStop: () => t.admit.requested.length >= 1 });
      expect(s.status).toBe('PARTIAL');
      expect(t.admit.requested).toHaveLength(1);
      expect(t.sdn.requested).toHaveLength(0);
    });

    it('maxRequestsPerPass is a hard cap', async () => {
      const t = setup();
      const s = await t.run('MANUAL', { maxRequestsPerPass: 1 });
      expect(t.admit.requested).toHaveLength(1);
      expect(t.sdn.requested).toHaveLength(1);
      expect(s.status).toBe('PARTIAL');
    });

    it('the deadline is honoured', async () => {
      const t = setup({
        admitRoutes: () => {
          t.live.now = new Date(t.live.now.getTime() + 20 * 60_000);
          return admitPage;
        },
      });
      const s = await t.run('MANUAL', { deadlineMs: 10 * 60_000 });
      expect(t.admit.requested).toHaveLength(1);
      expect(s.status).toBe('PARTIAL');
    });

    it('a pass can be switched off', async () => {
      const t = setup();
      await t.run('MANUAL', { passes: { admit: false, sdn: true } });
      expect(t.admit.requested).toHaveLength(0);
      expect(t.runs().map((r) => r.source)).toEqual(['SDN']);
    });
  });

  describe('anonymization', () => {
    it('with hostile pages served for every school, no write, log line or stat holds a needle', async () => {
      const t = setup({
        admitRoutes: () => readAdmitFixture('secondary-essays-hostile.html'),
        sdnRoutes: () => readSdnFixture('essays-hostile.html'),
      });
      const s = await t.run();
      expect(s.status).toBe('OK');
      expect(t.prompts().length).toBeGreaterThan(0);
      const needles = [...NEEDLES, 'MentionedUserZQ', '@handle_ad77', 'ad.person@example.com', 'grandmother'];
      assertNoLeak(t.writes, needles);
      assertNoLeak(t.logs, needles);
      assertNoLeak(t.runs(), needles);
      // The stats are counters and a label only.
      for (const r of t.runs()) {
        for (const v of Object.values(r.stats)) expect(['number', 'string']).toContain(typeof v);
      }
    });
  });

  describe('source pins', () => {
    const src = readFileSync(join(__dirname, 'run-secondaries.ts'), 'utf8');
    it('imports no model code, makes no direct request and needs no secret', () => {
      expect(src).not.toMatch(/lib\/ai/);
      expect(src).not.toContain('fetch(');
      expect(src).not.toContain('dedupeHash');
    });
    it('keeps its constants', () => {
      expect(SECONDARIES_CRON).toBe('35 5 * * 0,3');
      expect(SECONDARIES_MIN_INTERVAL_MS).toBe(60 * HOUR);
      expect(SECONDARIES_FRESH_MS).toBe(SECONDARIES_MIN_INTERVAL_MS);
    });
  });
});
