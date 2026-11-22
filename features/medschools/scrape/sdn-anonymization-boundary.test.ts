import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import { parseThreadTitle } from '../engine/sdn-title';
import { scrubQuestion } from '../engine/sdn-rules';
import { summaryPageUrl } from './adapters/sdn';
import { readFixture } from './adapters/sdn/test-fixtures';
import { runSdnBackfill, type SdnBackfillSummary } from './run-sdn-backfill';
import { runSdnInterviews } from './run-sdn-interviews';
import { runSdnLive, type SdnForumsFile, type SdnLiveSummary } from './run-sdn-live';
import type { SdnAi } from './sdn/extract';
import { assertNoLeak, createFakeHost, createFakePrisma, NEEDLES, SDN_HOSTILE_NEEDLES } from './test-support';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = new Date('2026-11-20T18:00:00.000Z');
const RAW_POST_ID = '8000001';
const POST_HASH = dedupeHash(SECRET, 'SDN', `post:${RAW_POST_ID}`);
/** The needles plus the raw post id in each form it appears in on the page, and the permalink shapes. */
const ALL = [...new Set([...NEEDLES, ...SDN_HOSTILE_NEEDLES, RAW_POST_ID, `post-${RAW_POST_ID}`])];
const EVENT_KEYS = ['cycleYear', 'dedupeHash', 'eventType', 'inState', 'occurredAt', 'program', 'schoolId', 'source'];
const QUESTION_KEYS = ['cycleYear', 'dedupeHash', 'schoolId', 'source', 'text', 'votes'];
const HOSTILE_TITLE = '2026-2027 Hostile Test School';
const STEM = parseThreadTitle(HOSTILE_TITLE)!.stem;
const THREAD_PATH = '/threads/2026-2027-hostile-school.9990001/';
const LEAKY_QUESTION = 'What did hostile_author_zq ask you? Write @handle_zq77 or zq.person@example.com';

const FORUMS: SdnForumsFile = {
  generatedAt: NOW.toISOString(),
  current: [
    { node: 1198, slug: 'md', degree: 'MD', cycleYear: 2027 },
    { node: 1199, slug: 'do', degree: 'DO', cycleYear: 2027 },
  ],
  archive: [{ node: 962, slug: 'md-prior', degree: 'MD', cycleYear: null }],
};

type Variant = 'leaky-question' | 'extra-author-key';

/** A compliant-looking but leaky model: an event per post, a question carrying a handle and an email. */
function leakyAi(variant: Variant, payloads: string[]): SdnAi {
  return {
    configured: () => true,
    run: async (system, user) => {
      payloads.push(system, user);
      const reqs = JSON.parse(user.slice(user.indexOf('['), user.lastIndexOf(']') + 1)) as Array<{ ref: number }>;
      return JSON.stringify({
        posts: reqs.map((r) => ({
          postRef: r.ref,
          events: [{ type: 'INTERVIEW', date: '2026-10-20' }],
          questions: variant === 'leaky-question' ? [LEAKY_QUESTION, 'Why do you want to be a surgeon?'] : [],
          ...(variant === 'extra-author-key' ? { author: 'hostile_author_zq' } : {}),
        })),
      });
    },
  };
}

function seed(fake: ReturnType<typeof createFakePrisma>, aliasKey: string, source = 'SDN') {
  fake.tables.medSchool!.push({ id: 's1', slug: 'hostile', active: true, degree: 'MD' });
  fake.tables.medSchoolAlias!.push({ id: 'a1', schoolId: 's1', source, sourceKey: aliasKey });
}

function collector() {
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  return { logs, log };
}

type Table = Array<Record<string, unknown>>;

async function hostileRun(variant: Variant) {
  const consoleLines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void consoleLines.push(a.map(String).join(' '))),
  );
  try {
    const fake = createFakePrisma();
    seed(fake, STEM);
    const payloads: string[] = [];
    const ai = leakyAi(variant, payloads);
    const { logs, log } = collector();

    const liveHost = createFakeHost({
      '/forums/1198/index.rss': readFixture('rss-hostile.xml'),
      '/forums/1199/index.rss': '<?xml version="1.0"?><rss><channel><title>x</title></channel></rss>',
      '/forums/1198/': readFixture('listing-hostile.html'),
      '/forums/1199/': '<html><body>There are no threads</body></html>',
      [THREAD_PATH]: readFixture('thread-hostile.html'),
    });
    const live: SdnLiveSummary = await runSdnLive(
      {
        prisma: fake.prisma,
        host: liveHost.host,
        ai,
        budget: { allow: async () => true },
        secret: SECRET,
        forums: FORUMS,
        shouldStop: () => false,
        log,
        now: () => NOW,
      },
      { trigger: 'MANUAL' },
    );

    // Backfill walks a second school/thread of its own so it exercises the listing and the thread page again.
    const bfake = createFakePrisma();
    seed(bfake, STEM);
    const bHost = createFakeHost({
      '/forums/962/': readFixture('listing-hostile.html'),
      [THREAD_PATH]: readFixture('thread-hostile.html'),
    });
    const backfill: SdnBackfillSummary = await runSdnBackfill(
      {
        prisma: bfake.prisma,
        host: bHost.host,
        ai,
        budget: { allow: async () => true },
        secret: SECRET,
        forums: { ...FORUMS, current: [] },
        shouldStop: () => false,
        log,
        now: () => NOW,
      },
      { trigger: 'MANUAL' },
    );

    const ifake = createFakePrisma();
    ifake.tables.medSchool!.push({ id: 's1', slug: 'columbia', active: true });
    ifake.tables.medSchoolAlias!.push({
      id: 'a1',
      schoolId: 's1',
      source: 'SDN',
      sourceKey: 'summary:COL/columbia',
    });
    const iHost = createFakeHost({ [summaryPageUrl('COL', 'columbia')]: readFixture('summary-hostile.html') });
    const interviews = await runSdnInterviews(
      {
        prisma: ifake.prisma,
        host: iHost.host,
        secret: SECRET,
        shouldStop: () => false,
        log,
        now: () => NOW,
      },
      { trigger: 'MANUAL' },
    );

    return { fake, bfake, ifake, payloads, logs, consoleLines, live, backfill, interviews };
  } finally {
    for (const s of spies) s.mockRestore();
  }
}

type Run = Awaited<ReturnType<typeof hostileRun>>;
const stores = (r: Run) => [r.fake, r.bfake, r.ifake];
const allTables = (r: Run) => stores(r).map((f) => f.tables);
const allWrites = (r: Run) => stores(r).flatMap((f) => f.writes);
const rows = (r: Run, name: string) => stores(r).flatMap((f) => (f.tables[name] ?? []) as Table);

describe('SDN anonymization boundary (live, backfill, interviews, model payload)', () => {
  let leaky: Run;
  let strict: Run;
  beforeAll(async () => {
    leaky = await hostileRun('leaky-question');
    strict = await hostileRun('extra-author-key');
  });
  afterAll(() => vi.restoreAllMocks());

  it('the hostile runs really ran: events and questions were considered', () => {
    expect(leaky.live.status).toBe('OK');
    expect(leaky.live.eventsCreated).toBeGreaterThan(0);
    expect(leaky.backfill.eventsCreated).toBeGreaterThan(0);
    expect(leaky.interviews.profiles).toBe(1);
    expect(leaky.payloads.length).toBeGreaterThan(0);
  });

  it('no author, username, handle, email, avatar, signature, post id or permalink reaches any write or table', () => {
    for (const r of [leaky, strict]) {
      assertNoLeak(allWrites(r), ALL);
      assertNoLeak(allTables(r), ALL);
    }
  });

  it('neither the raw post id nor its keyed hash is an event key; the cursor holds only an HMAC', () => {
    for (const r of [leaky, strict]) {
      for (const name of ['medCycleEvent', 'medInterviewQuestion']) {
        const dump = JSON.stringify(rows(r, name));
        expect(dump, name).not.toContain(POST_HASH);
        expect(dump, name).not.toContain(RAW_POST_ID);
      }
      const cursors = rows(r, 'medSdnThread').map((t) => t.cursorPostHash);
      expect(cursors.length).toBeGreaterThan(0);
      for (const c of cursors) expect(c === null || /^[0-9a-f]{64}$/.test(String(c))).toBe(true);
      expect(cursors).toContain(dedupeHash(SECRET, 'SDN', 'post:8000004'));
    }
  });

  it('created event rows have exactly the anonymous keys, in tables and in every createMany payload', () => {
    const events = rows(leaky, 'medCycleEvent');
    expect(events.length).toBeGreaterThan(0);
    for (const e of events)
      expect(
        Object.keys(e)
          .filter((k) => k !== 'id')
          .sort(),
      ).toEqual(EVENT_KEYS);
    for (const w of allWrites(leaky) as Array<{ data?: unknown }>) {
      if (!Array.isArray(w.data)) continue;
      for (const d of w.data as Array<Record<string, unknown>>) {
        if ('dedupeHash' in d && 'eventType' in d) expect(Object.keys(d).sort()).toEqual(EVENT_KEYS);
      }
    }
  });

  it('question rows have exactly the anonymous keys, passed scrubQuestion, and the leaky question is dropped and counted', () => {
    const qs = rows(leaky, 'medInterviewQuestion');
    expect(qs.some((q) => String(q.text).toLowerCase().includes('surgeon'))).toBe(true);
    for (const q of qs) {
      expect(
        Object.keys(q)
          .filter((k) => k !== 'id')
          .sort(),
      ).toEqual(QUESTION_KEYS);
      expect(scrubQuestion(String(q.text), { containsHandle: () => false })).not.toBeNull();
    }
    expect(qs.some((q) => /hostile_author|handle_zq|zq\.person/.test(String(q.text)))).toBe(false);
    expect(leaky.live.questionsCreated).toBeGreaterThan(0);
    const rejected = (leaky.live as unknown as { rejected: number }).rejected;
    expect(rejected).toBeGreaterThan(0);
  });

  it('no event or question row carries a post permalink; attribution is thread-level only', () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(allTables(leaky));
    expect(strings.length).toBeGreaterThan(0);
    for (const s of strings) {
      expect(s.startsWith('http'), s).toBe(false);
      expect(s, s).not.toContain('/posts/');
      expect(s, s).not.toContain('#post-');
      expect(s, s).not.toContain('/goto/post');
    }
    for (const row of [...rows(leaky, 'medCycleEvent'), ...rows(leaky, 'medInterviewQuestion')]) {
      expect(JSON.stringify(row)).not.toMatch(/permalink|url|href/i);
    }
    const threads = rows(leaky, 'medSdnThread');
    expect(threads.length).toBeGreaterThan(0);
    expect(threads[0]).toMatchObject({ threadId: 9990001 });
  });

  it('the model payload carries no author, post id, hash, username, email or avatar, and the post text is redacted', () => {
    for (const r of [leaky, strict]) {
      assertNoLeak(r.payloads, ALL);
      const dump = r.payloads.join('\n');
      expect(dump).not.toContain(POST_HASH);
      expect(dump).not.toMatch(/data-author|data-content|\/members\//);
      expect(dump).toContain('[email]');
      expect(dump).toMatch(/\[user\]/);
      expect(dump).toContain('[link]');
    }
  });

  it('the quoted reply produced no event and its words never reached the model', () => {
    const dump = leaky.payloads.join('\n');
    for (const w of ['quotedonlywords', 'outerquotedwords', 'innerquotedwords']) expect(dump).not.toContain(w);
    const events = rows(leaky, 'medCycleEvent');
    // Only the original post (and the unquoted "Accepted" post) can yield events: never one per quoting post.
    expect(events.every((e) => e.eventType === 'INTERVIEW')).toBe(true);
    expect(leaky.payloads.join('')).not.toContain('"ref":1,"postedOn":"2026-11-02"');
  });

  it("the extra author key in the model's JSON is rejected by the strict schema and nothing from that batch is stored", () => {
    // The summary run (ifake) is model-free and legitimately stores its published questions; judge the forum runs.
    for (const f of [strict.fake, strict.bfake]) {
      expect((f.tables.medCycleEvent ?? []) as Table).toHaveLength(0);
      expect((f.tables.medInterviewQuestion ?? []) as Table).toHaveLength(0);
    }
    expect(strict.backfill.eventsCreated).toBe(0);
    expect(strict.live.eventsCreated).toBe(0);
    expect(strict.live.extractFailed).toBeGreaterThan(0);
    assertNoLeak([strict.logs, strict.consoleLines], ALL);
  });

  it('log lines, console output, run stats and medSourceRun contain no needle', () => {
    for (const r of [leaky, strict]) {
      assertNoLeak(r.logs, ALL);
      assertNoLeak(r.consoleLines, ALL);
      assertNoLeak([r.live, r.backfill, r.interviews], ALL);
      for (const f of stores(r)) assertNoLeak((f.tables.medSourceRun ?? []) as Table, ALL);
      expect(r.logs.length).toBeGreaterThan(0);
    }
  });

  it("summary: the report's userName and comments never reach a write; the profile has empty feedback arrays", () => {
    const profiles = (leaky.ifake.tables.medInterviewProfile ?? []) as Table;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ feedbackPositive: [], feedbackNegative: [], feedbackBefore: [] });
    const dump = JSON.stringify([leaky.ifake.writes, leaky.ifake.tables]);
    for (const w of ['zq.person', 'hostile_author_zq', 'handle_zq77', 'sigzq-contact-line', '9000001', '/survey/']) {
      expect(dump, w).not.toContain(w);
    }
  });

  it('negative control: a planted needle is caught', () => {
    for (const needle of [...SDN_HOSTILE_NEEDLES, RAW_POST_ID]) {
      expect(() => assertNoLeak([...leaky.fake.writes, { data: { note: `x ${needle} y` } }], ALL)).toThrow(/Leak/);
      expect(() => assertNoLeak([...leaky.payloads, `seen ${needle}`], ALL)).toThrow(/Leak/);
    }
  });
});
