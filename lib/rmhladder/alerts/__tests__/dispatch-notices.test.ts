import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RMHLadder alerts as keys (sprint 12, feature 19): each alert kind stores `text` (English, for e-mail and Discord)
 * plus a notice key and params; the in-app channel sends the key; an alert queued before the change, with no key,
 * still arrives as its stored text. Prisma and the network are stand-ins.
 */

const h = vi.hoisted(() => ({
  events: [] as Array<{ type: string; payload: Record<string, unknown> }>,
  notices: [] as Record<string, unknown>[],
  deliveries: [] as unknown[],
  updates: [] as Array<{ id: string; status: string }>,
  prefs: [] as unknown[],
  jobs: [] as unknown[],
  savedSearches: [] as unknown[],
  applications: [] as unknown[],
  mails: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    h.notices.push(input);
  }),
}));
vi.mock('../../server/queries', () => ({
  listJobs: vi.fn(async () => ({ rows: h.jobs })),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    ladderUserPrefs: {
      findMany: vi.fn(async () => h.prefs),
      findUnique: vi.fn(async () => h.prefs[0] ?? null),
    },
    ladderJobMatch: { findFirst: vi.fn(async () => null) },
    ladderSavedSearch: { findMany: vi.fn(async () => h.savedSearches) },
    ladderApplication: { findMany: vi.fn(async () => h.applications) },
    account: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ emailVerified: true })) },
    ladderAlertEvent: {
      upsert: vi.fn(async (a: { create: { type: string; payload: Record<string, unknown> } }) => {
        h.events.push({ type: a.create.type, payload: a.create.payload });
        return { id: `e${h.events.length}` };
      }),
    },
    ladderAlertDelivery: {
      upsert: vi.fn(async () => ({})),
      findMany: vi.fn(async () => h.deliveries),
      update: vi.fn(async (a: { where: { id: string }; data: { status: string } }) => {
        h.updates.push({ id: a.where.id, status: a.data.status });
        return {};
      }),
    },
  },
}));

import {
  deliverPendingLadderAlerts,
  generateLadderMatchAlerts,
  generateLadderPipelineReminders,
} from '@/lib/rmhladder/alerts/dispatch.server';
import { NOTICE_TEMPLATES, noticeParamNames, isNoticeKey } from '@/lib/notifications/notice-keys';

const NOW = new Date('2026-11-25T14:00:00Z');
const basePrefs = {
  userId: 'u1',
  timezone: 'America/New_York',
  digestFrequency: 'immediate',
  relevanceThreshold: 0,
  resumeMatchThreshold: null,
  quietHoursStart: null,
  quietHoursEnd: null,
  channelInApp: true,
  channelEmail: true,
  channelDiscord: false,
  user: { id: 'u1', email: 'a@example.com', emailVerified: true, accounts: [] },
};
const job = { id: 'j1', title: 'Analyst', company: { name: 'Acme' }, finalRelevance: 87, discoveredAt: NOW };

function payloadOf(type: string, i = 0) {
  return h.events.filter((e) => e.type === type)[i]!.payload;
}
function expectFilled(payload: Record<string, unknown>, key: string) {
  expect(isNoticeKey(key)).toBe(true);
  expect(payload.noticeKey).toBe(key);
  const params = payload.noticeParams as Record<string, unknown>;
  for (const name of noticeParamNames(NOTICE_TEMPLATES[key as keyof typeof NOTICE_TEMPLATES])) {
    expect(['string', 'number']).toContain(typeof params[name]);
  }
}

beforeEach(() => {
  h.events = [];
  h.notices = [];
  h.deliveries = [];
  h.updates = [];
  h.prefs = [{ ...basePrefs }];
  h.jobs = [job];
  h.savedSearches = [];
  h.applications = [];
  h.mails = [];
});

describe('generated alerts keep their English text and gain a key', () => {
  it('an immediate match: ladder-match with title, company and the relevance', async () => {
    await generateLadderMatchAlerts(NOW);
    const p = payloadOf('immediate');
    expect(p.text).toBe('Analyst at Acme is a 87% preference match.');
    expectFilled(p, 'ladder-match');
    expect(p.noticeParams).toEqual({ title: 'Analyst', company: 'Acme', relevance: 87 });
  });

  it('a digest: ladder-matches with the count', async () => {
    h.prefs = [{ ...basePrefs, digestFrequency: 'daily', timezone: 'UTC' }];
    await generateLadderMatchAlerts(new Date('2026-11-25T09:00:00Z'));
    const p = payloadOf('daily_digest');
    expect(p.text).toBe('1 new verified role match your preferences.');
    expectFilled(p, 'ladder-matches-one');
    expect(p.noticeParams).toEqual({});
  });

  it('a saved search: one role, and many in a digest', async () => {
    h.savedSearches = [{ id: 's1', name: 'NYC finance', filters: {} }];
    await generateLadderMatchAlerts(NOW);
    const one = payloadOf('saved_search');
    expect(one.text).toBe('Analyst at Acme matches your saved search “NYC finance”.');
    expectFilled(one, 'ladder-search-match');
    expect(one.noticeParams).toEqual({ title: 'Analyst', company: 'Acme', search: 'NYC finance' });

    h.events = [];
    h.prefs = [{ ...basePrefs, digestFrequency: 'daily', timezone: 'UTC' }];
    await generateLadderMatchAlerts(new Date('2026-11-25T09:00:00Z'));
    const many = payloadOf('saved_search');
    expect(many.text).toBe('1 new verified role match your saved search “NYC finance”.');
    expectFilled(many, 'ladder-search-matches-one');
    expect(many.noticeParams).toEqual({ search: 'NYC finance' });
  });

  it('several roles use the counted keys', async () => {
    h.jobs = [job, { ...job, id: 'j2' }];
    h.prefs = [{ ...basePrefs, digestFrequency: 'daily', timezone: 'UTC' }];
    h.savedSearches = [{ id: 's1', name: 'NYC finance', filters: {} }];
    await generateLadderMatchAlerts(new Date('2026-11-25T09:00:00Z'));
    const digest = payloadOf('daily_digest');
    expectFilled(digest, 'ladder-matches');
    expect(digest.noticeParams).toEqual({ count: 2 });
    const search = payloadOf('saved_search');
    expectFilled(search, 'ladder-search-matches');
    expect(search.noticeParams).toEqual({ search: 'NYC finance', count: 2 });
  });

  it('a follow-up, an interview time (ISO) and a closing deadline', async () => {
    h.applications = [
      {
        id: 'a1',
        userId: 'u1',
        jobId: 'j1',
        followUpDate: new Date(NOW.getTime() + 60 * 60 * 1000),
        interviewDates: [new Date(NOW.getTime() + 24 * 60 * 60 * 1000)],
        job: {
          title: 'Analyst',
          company: { name: 'Acme' },
          applicationDeadline: new Date(NOW.getTime() + 2 * 86_400_000),
        },
      },
    ];
    await generateLadderPipelineReminders(NOW);

    const followUp = payloadOf('follow_up');
    expect(followUp.text).toBe('Follow up on Analyst at Acme.');
    expectFilled(followUp, 'ladder-follow-up');
    expect(followUp.noticeParams).toEqual({ title: 'Analyst', company: 'Acme' });

    const interview = payloadOf('interview');
    expect(interview.text).toMatch(/^Interview for Analyst at Acme is Nov 26, 2026/);
    expectFilled(interview, 'ladder-interview');
    expect((interview.noticeParams as Record<string, unknown>).interviewAt).toBe('2026-11-26T14:00:00.000Z');

    const closing = payloadOf('deadline');
    expect(closing.text).toBe('Analyst at Acme closes in 2 days.');
    expectFilled(closing, 'ladder-closing');
    expect((closing.noticeParams as Record<string, unknown>).count).toBe(2);
  });

  it('a deadline one day away uses the singular key', async () => {
    h.applications = [
      {
        id: 'a2',
        userId: 'u1',
        jobId: 'j1',
        followUpDate: null,
        interviewDates: [],
        job: { title: 'Analyst', company: { name: 'Acme' }, applicationDeadline: new Date(NOW.getTime() + 86_400_000) },
      },
    ];
    await generateLadderPipelineReminders(NOW);
    const closing = payloadOf('deadline');
    expect(closing.text).toBe('Analyst at Acme closes in 1 day.');
    expectFilled(closing, 'ladder-closing-one');
    expect(closing.noticeParams).toEqual({ title: 'Analyst', company: 'Acme' });
  });
});

function delivery(channel: string, payload: Record<string, unknown>) {
  return {
    id: `d-${channel}`,
    channel,
    alert: {
      userId: 'u1',
      jobId: 'j1',
      payload,
      job: null,
      user: { email: 'a@example.com', emailVerified: true },
    },
  };
}

describe('delivery', () => {
  const keyed = {
    title: 'Analyst',
    company: 'Acme',
    text: 'Follow up on Analyst at Acme.',
    link: '/rmhladder/jobs/j1',
    noticeKey: 'ladder-follow-up',
    noticeParams: { title: 'Analyst', company: 'Acme' },
  };

  it('the in-app channel sends the notice; e-mail still gets the English text', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key-1');
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@example.com');
    const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
      h.mails.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);
    h.deliveries = [delivery('in_app', keyed), delivery('email', keyed)];

    const totals = await deliverPendingLadderAlerts();
    expect(totals).toEqual({ sent: 2, failed: 0, skipped: 0 });

    const preview = h.notices[0]!.preview as { key: string; params: unknown; fallback: string };
    expect(preview.key).toBe('ladder-follow-up');
    expect(preview.params).toEqual({ title: 'Analyst', company: 'Acme' });
    expect(preview.fallback).toBe('Follow up on Analyst at Acme.');
    expect(h.notices[0]).toMatchObject({ type: 'SYSTEM', entityType: 'ladder_job', dedupeUnread: true });

    expect(h.mails).toHaveLength(1);
    expect(String(h.mails[0]!.body.text)).toContain('Follow up on Analyst at Acme.');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('an alert queued before the change, with no key, still arrives as its stored text', async () => {
    const old = {
      title: 'Analyst',
      company: 'Acme',
      text: 'Analyst at Acme closes in 2 days.',
      link: '/rmhladder/jobs/j1',
    };
    h.deliveries = [delivery('in_app', old)];
    const totals = await deliverPendingLadderAlerts();
    expect(totals.sent).toBe(1);
    expect(h.notices[0]!.preview).toBe('Analyst at Acme closes in 2 days.');
  });

  it('a payload whose params do not fill the template falls back to the text', async () => {
    h.deliveries = [delivery('in_app', { ...keyed, noticeParams: { title: 'Analyst' } })];
    await deliverPendingLadderAlerts();
    expect(h.notices[0]!.preview).toBe('Follow up on Analyst at Acme.');
  });

  it('an unknown key falls back to the text', async () => {
    h.deliveries = [delivery('in_app', { ...keyed, noticeKey: 'not-a-key' })];
    await deliverPendingLadderAlerts();
    expect(h.notices[0]!.preview).toBe('Follow up on Analyst at Acme.');
  });
});
