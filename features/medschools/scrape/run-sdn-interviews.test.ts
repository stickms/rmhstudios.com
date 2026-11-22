import { describe, expect, it } from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import { normalizeQuestion } from '../engine/sdn-rules';
import { readFixture } from './adapters/sdn/test-fixtures';
import { summaryPageUrl } from './adapters/sdn';
import { runSdnInterviews, type SdnInterviewsDeps } from './run-sdn-interviews';
import { NEEDLES, assertNoLeak, createFakeHost, createFakePrisma, httpStatusRoute } from './test-support';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = new Date('2026-11-20T18:00:00.000Z');
const DAY = 86_400_000;
const COLUMBIA = 'summary:COL/columbia';
const url = (key: string) => {
  const [code, slug] = key.slice('summary:'.length).split('/');
  return summaryPageUrl(code!, slug!);
};
const COL_URL = url(COLUMBIA);
const columbia = readFixture('summary-columbia.html');
const small = readFixture('summary-small.html');

/** A summary page whose inline report array is replaced by `reports`. */
function pageWith(reports: unknown[]): string {
  return columbia.replace(
    /(<script[^>]*\bid="interview-feedback-data"[^>]*>)[\s\S]*?(<\/script>)/,
    (_m, a: string, b: string) => `${a}${JSON.stringify(reports)}${b}`,
  );
}
const report = (questionsAsked: string, over: Record<string, unknown> = {}) => ({
  format: '',
  interviewType: 'Open file',
  interviewStyle: 'One-on-one',
  interviewLength: '30 minutes',
  stress: '5 / 10',
  impression: 'Positively',
  questionsAsked,
  comments: 'comment-zq-secret',
  ...over,
});

function setup(routes: Record<string, string | null>, deps: Partial<SdnInterviewsDeps> = {}, maxFailures = 3) {
  const fake = createFakePrisma();
  fake.tables.medSchool!.push(
    {
      id: 's1',
      slug: 'columbia',
      active: true,
    },
    {
      id: 's2',
      slug: 'other',
      active: true,
    },
    {
      id: 's3',
      slug: 'closed',
      active: false,
    },
  );
  fake.tables.medSchoolAlias!.push({
    id: 'a1',
    schoolId: 's1',
    source: 'SDN',
    sourceKey: COLUMBIA,
  });
  const live = {
    routes,
    now: NOW,
  };
  const host = createFakeHost((p) => live.routes[p] ?? null, maxFailures);
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  const run = () =>
    runSdnInterviews(
      {
        prisma: fake.prisma,
        host: host.host,
        secret: SECRET,
        shouldStop: () => false,
        log,
        now: () => live.now,
        ...deps,
      },
      {
        trigger: 'MANUAL',
      },
    );
  const table = (n: string) => (fake.tables[n] ?? []) as Array<Record<string, unknown>>;
  const alias = (id: string, schoolId: string, sourceKey: string) =>
    fake.tables.medSchoolAlias!.push({
      id,
      schoolId,
      source: 'SDN',
      sourceKey,
    });
  return {
    ...fake,
    ...host,
    live,
    run,
    logs,
    table,
    alias,
  };
}

describe('runSdnInterviews', () => {
  it('summary-columbia creates one SDN profile with the fixture modes and means and empty feedback arrays', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    const s = await t.run();
    expect(s).toMatchObject({
      status: 'OK',
      schools: 1,
      fetched: 1,
      profiles: 1,
      failed: 0,
      unavailable: 0,
    });
    const rows = t.table('medInterviewProfile');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      schoolId: 's1',
      source: 'SDN',
      fileType: 'Open file',
      interviewStyle: 'One-on-one',
      interviewCount: 12,
      feedbackPositive: [],
      feedbackNegative: [],
      feedbackBefore: [],
      fetchedAt: NOW,
    });
    expect(rows[0]!.avgStress).toBeGreaterThan(0);
    expect(rows[0]!.avgImpression).toBeGreaterThanOrEqual(-1);
    expect(rows[0]).toHaveProperty('inStateCount');
    expect(rows[0]).toHaveProperty('outOfStateCount');
    expect(t.table('medInterviewQuestion').length).toBeGreaterThan(0);
  });

  it('a second run writes no new questions and updates fetchedAt only', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    await t.run();
    const questions = JSON.stringify(t.table('medInterviewQuestion'));
    const first = {
      ...t.table('medInterviewProfile')[0]!,
    };
    t.live.now = new Date(NOW.getTime() + 7 * DAY);
    const s = await t.run();
    expect(s.questionsCreated).toBe(0);
    expect(s.fetched).toBe(1);
    expect(JSON.stringify(t.table('medInterviewQuestion'))).toBe(questions);
    expect(t.table('medInterviewProfile')).toHaveLength(1);
    expect(t.table('medInterviewProfile')[0]).toMatchObject({
      ...first,
      fetchedAt: t.live.now,
    });
  });

  it('skips a school whose stored SDN profile is fresher than 6 days', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    await t.run();
    t.live.now = new Date(NOW.getTime() + 5 * DAY);
    const before = t.requested.length;
    const s = await t.run();
    expect(s.skipped).toBe(1);
    expect(t.requested.length).toBe(before);
  });

  it('questions with an email, URL, @handle, honorific + name or phone are rejected and counted; clean ones stored once per school', async () => {
    const page = pageWith([
      report(
        [
          'Why do you want to be a doctor?',
          'Email me at zq.person@example.com about why medicine?',
          'Did you read https://example.org/zq before you came?',
          'What did @handle_zq77 ask you about research?',
          'Did Dr. Smith ask why you chose this school?',
          'Why not call 617-555-0142 to ask about your goals?',
        ].join('\n'),
      ),
      report('Why do you want to be a doctor?\nWhat is your biggest weakness?'),
    ]);
    const t = setup({
      [COL_URL]: page,
    });
    const s = await t.run();
    expect(s.questionsRejected).toBe(5);
    expect(s.questionsCreated).toBe(2);
    const texts = t.table('medInterviewQuestion').map((q) => q.text);
    expect(texts.sort()).toEqual(['What is your biggest weakness?', 'Why do you want to be a doctor?']);
    expect(t.table('medInterviewQuestion')[0]).toMatchObject({
      source: 'SDN',
      votes: null,
      cycleYear: null,
      schoolId: 's1',
    });
    assertNoLeak(t.writes, [...NEEDLES, '617-555-0142', 'example.org/zq', 'Dr. Smith']);
  });

  it('questions never contain comments text', async () => {
    const page = pageWith([
      report('Why do you want to be a doctor?', {
        comments: 'comment-zq-secret',
        searchText: 'search-zq',
      }),
    ]);
    const t = setup({
      [COL_URL]: page,
    });
    await t.run();
    assertNoLeak(t.writes, ['comment-zq-secret', 'search-zq']);
    const cols = t.table('medInterviewQuestion');
    expect(cols).toHaveLength(1);
    const fix = setup({
      [COL_URL]: columbia,
    });
    await fix.run();
    assertNoLeak(fix.writes, [
      'comment-001',
      'search-text-001',
      'studentdoctor.net/schools-database/medical-school/survey',
    ]);
  });

  it('forum-derived SDN questions already stored are not deleted, and the same question is stored once', async () => {
    const t = setup({
      [COL_URL]: pageWith([report('Why do you want to be a doctor?')]),
    });
    t.table('medInterviewQuestion').push(
      {
        id: 'q-forum',
        schoolId: 's1',
        text: 'Tell me about a failure.',
        source: 'SDN',
        votes: null,
        cycleYear: 2027,
        dedupeHash: dedupeHash(SECRET, 'SDN', `q:s1:${normalizeQuestion('Tell me about a failure.')}`),
      },
      {
        id: 'q-same',
        schoolId: 's1',
        text: 'Why do you want to be a doctor?',
        source: 'SDN',
        votes: null,
        cycleYear: 2027,
        dedupeHash: dedupeHash(SECRET, 'SDN', `q:s1:${normalizeQuestion('Why do you want to be a doctor?')}`),
      },
    );
    const s = await t.run();
    expect(s.questionsCreated).toBe(0);
    expect(
      t
        .table('medInterviewQuestion')
        .map((q) => q.id)
        .sort(),
    ).toEqual(['q-forum', 'q-same']);
  });

  it('a school without a summary alias, or an inactive school, is not requested', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    t.alias('a2', 's2', 'thread:other-stem');
    t.alias('a3', 's3', 'summary:CLS/closed');
    const s = await t.run();
    expect(s.schools).toBe(1);
    expect(t.requested).toEqual([COL_URL]);
  });

  it('two summary keys on one school: only the first is walked, the other reported', async () => {
    const t = setup({
      [COL_URL]: columbia,
      [url('summary:ZZZ/zzz')]: small,
    });
    t.alias('a9', 's1', 'summary:ZZZ/zzz');
    const s = await t.run();
    expect(t.requested).toEqual([COL_URL]);
    expect(s.schools).toBe(1);
    expect(s.duplicateKeys).toBe(1);
  });

  it('404 is unavailable, not a failure, and leaves stored rows untouched', async () => {
    const t = setup({});
    t.table('medInterviewQuestion').push({
      id: 'q1',
      schoolId: 's1',
      text: 'keep me?',
      source: 'SDN',
      dedupeHash: 'h1',
    });
    const s = await t.run();
    expect(s).toMatchObject({
      unavailable: 1,
      failed: 0,
      status: 'PARTIAL',
    });
    expect(t.table('medInterviewProfile')).toHaveLength(0);
    expect(t.table('medInterviewQuestion')).toHaveLength(1);
  });

  it('an empty report array is unavailable and overwrites nothing', async () => {
    const t = setup({
      [COL_URL]: pageWith([]),
    });
    t.table('medInterviewProfile').push({
      id: 'p1',
      schoolId: 's1',
      source: 'SDN',
      interviewCount: 12,
      fetchedAt: new Date(NOW.getTime() - 30 * DAY),
    });
    const s = await t.run();
    expect(s).toMatchObject({
      unavailable: 1,
      failed: 0,
      profiles: 0,
    });
    expect(t.table('medInterviewProfile')[0]).toMatchObject({
      interviewCount: 12,
    });
  });

  it('challenge page is a failure', async () => {
    const t = setup({
      [COL_URL]: readFixture('thread-challenge.html'),
    });
    const s = await t.run();
    expect(s).toMatchObject({
      failed: 1,
      unavailable: 0,
      profiles: 0,
    });
  });

  it('three failures halt the run FAILED', async () => {
    const t = setup({});
    const challenge = readFixture('thread-challenge.html');
    for (const n of [1, 2, 3, 4]) {
      t.table('medSchool').push({
        id: `x${n}`,
        slug: `x${n}`,
        active: true,
      });
      t.alias(`ax${n}`, `x${n}`, `summary:X${n}/x${n}`);
      t.live.routes[url(`summary:X${n}/x${n}`)] = challenge;
    }
    t.live.routes[COL_URL] = challenge;
    const s = await t.run();
    expect(s.status).toBe('FAILED');
    expect(t.requested).toHaveLength(3);
    expect(t.table('medSourceRun')[0]).toMatchObject({
      status: 'FAILED',
    });
  });

  it('three 403s with no challenge text halt the run FAILED; a 404 does not count', async () => {
    const t = setup({});
    for (const n of [1, 2, 3, 4]) {
      t.table('medSchool').push({ id: `x${n}`, slug: `x${n}`, active: true });
      t.alias(`ax${n}`, `x${n}`, `summary:X${n}/x${n}`);
      t.live.routes[url(`summary:X${n}/x${n}`)] = httpStatusRoute(403);
    }
    const s = await t.run();
    expect(s.status).toBe('FAILED');
    // Columbia's own alias answers 404 first (uncounted); the three 403s that follow halt the run.
    expect(t.requested.filter((p) => p !== COL_URL)).toHaveLength(3);
  });

  it('a failed question write leaves no profile, so it retries next run', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    const real = t.prisma.medInterviewQuestion.createMany;
    t.prisma.medInterviewQuestion.createMany = async () => {
      throw new Error('db down');
    };
    const s = await t.run();
    expect(s).toMatchObject({
      failed: 1,
      profiles: 0,
    });
    expect(t.table('medInterviewProfile')).toHaveLength(0);
    t.prisma.medInterviewQuestion.createMany = real;
    expect((await t.run()).profiles).toBe(1);
  });

  it('uses the www host session at a spacing of at least 2 s', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    await t.run();
    expect(t.sessions).toHaveLength(1);
    expect(t.sessions[0]!.spacingMs).toBeGreaterThanOrEqual(2000);
  });

  it('stats hold counters only', async () => {
    const t = setup({
      [COL_URL]: columbia,
    });
    await t.run();
    const run = t.table('medSourceRun')[0]!;
    for (const v of Object.values(run.stats as Record<string, unknown>)) expect(typeof v).toBe('number');
    assertNoLeak([run], [...NEEDLES, 'comment-001', 'Why Columbia']);
  });

  it('missing secret refuses the run', async () => {
    const t = setup(
      {
        [COL_URL]: columbia,
      },
      {
        secret: 'short',
      },
    );
    const s = await t.run();
    expect(s.status).toBe('FAILED');
    expect(t.requested).toHaveLength(0);
    expect(t.table('medSourceRun')).toHaveLength(0);
  });
});
