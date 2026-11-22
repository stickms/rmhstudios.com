/**
 * s03-13 community rules: who may write them, the 15-rule cap, the join
 * agreement, reports to a community's own moderators (one queue item, counted
 * reporters, never named), the rate limit, site reasons still reaching
 * `ContentReport`, and the rule cited on a removal. Prisma is stood in for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  community: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  rule: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  member: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  post: {
    findUnique: vi.fn(),
  },
  item: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contentReport: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  executeRaw: vi.fn(),
  notify: vi.fn(),
  resolveModItem: vi.fn(),
  handlerOptions: [] as {
    label?: string;
    rateLimit?: unknown;
  }[],
}));

vi.mock('@/lib/prisma.server', () => {
  const client = () => ({
    community: h.community,
    communityRule: h.rule,
    communityModAction: {
      create: async () => ({
        id: 1n,
      }),
    },
    communityMember: h.member,
    communityMemberEvent: {
      create: async () => ({
        id: 1n,
      }),
    },
    rMHark: h.post,
    communityModItem: h.item,
    contentReport: h.contentReport,
    // s06-01: nobody is banned in these scenarios.
    communityBan: {
      findFirst: async () => null,
    },
    $executeRaw: h.executeRaw,
  });
  return {
    prisma: {
      ...client(),
      $transaction: async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(client()),
    },
  };
});
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (
    o: {
      label?: string;
      rateLimit?: unknown;
    },
    fn: (c: unknown) => unknown,
  ) => {
    h.handlerOptions.push(o);
    return fn;
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: h.notify,
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canViewPost: async () => true,
}));
vi.mock('@/lib/admin-review.server', () => ({
  notifyAdminsOfReview: vi.fn(),
}));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({
  musicReportOwner: vi.fn(),
}));
vi.mock('@/lib/communities/automod.server', () => ({
  resolveModItem: h.resolveModItem,
  AutomodError: class AutomodError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

import { RULES_MAX } from '@/lib/communities/rules';
import { reporterCount, citedRule } from '@/lib/communities/rules.server';
import { saveRulesBody } from '@/lib/communities/rules-schema';

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
const load = async (mod: string, method: string): Promise<Handler> =>
  handlersOfModule<Handler>(await import(/* @vite-ignore */ mod))[method]!;

const RULES = '@/lib/communities/api/communities.$slug.rules.server';
const REPORT = '@/lib/communities/api/communities.$slug.report.server';
const JOIN = '@/lib/communities/api/communities.$slug.join.server';
const DECIDE = '@/lib/communities/api/communities.$slug.modqueue.$itemId.server';

const asRole = (role: string | null, over: Record<string, unknown> = {}) =>
  h.community.findUnique.mockResolvedValue({
    id: 'c1',
    slug: 'club',
    name: 'The Club',
    isPrivate: false,
    createdById: 'owner',
    rulesRequireAgreement: false,
    members: role
      ? [
          {
            role,
          },
        ]
      : [],
    ...over,
  });

beforeEach(() => {
  for (const group of [h.community, h.rule, h.member, h.post, h.item, h.contentReport]) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  h.executeRaw.mockReset().mockResolvedValue(1);
  h.notify.mockReset().mockResolvedValue(undefined);
  h.resolveModItem.mockReset().mockResolvedValue({
    status: 'REMOVED',
  });
  h.rule.findMany.mockResolvedValue([]);
});

describe('writing the rules', () => {
  const body = (n: number) => ({
    requireAgreement: false,
    rules: Array.from(
      {
        length: n,
      },
      (_, i) => ({
        title: `Rule ${i + 1}`,
      }),
    ),
  });

  it('refuses anyone who is not a moderator, and writes nothing', async () => {
    const PUT = await load(RULES, 'PUT');
    for (const role of [null, 'MEMBER']) {
      asRole(role);
      const res = await PUT({
        params: {
          slug: 'club',
        },
        userId: 'u1',
        body: body(2),
      });
      expect(res.status).toBe(403);
    }
    expect(h.rule.create).not.toHaveBeenCalled();
    expect(h.rule.deleteMany).not.toHaveBeenCalled();
    expect(h.community.update).not.toHaveBeenCalled();
  });

  it('lets a moderator replace the ordered list and the agreement switch', async () => {
    asRole('MOD');
    h.rule.findMany.mockResolvedValue([
      {
        id: 'keep',
      },
      {
        id: 'gone',
      },
    ]);
    const PUT = await load(RULES, 'PUT');
    const res = await PUT({
      params: {
        slug: 'club',
      },
      userId: 'mod',
      body: {
        requireAgreement: true,
        rules: [
          {
            title: 'New first',
          },
          {
            id: 'keep',
            title: 'Kept',
            description: ' why ',
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(h.rule.deleteMany).toHaveBeenCalledWith({
      where: {
        communityId: 'c1',
        id: {
          notIn: ['keep'],
        },
      },
    });
    expect(h.rule.create).toHaveBeenCalledWith({
      data: {
        communityId: 'c1',
        position: 0,
        title: 'New first',
        description: null,
      },
    });
    expect(h.rule.update).toHaveBeenCalledWith({
      where: {
        id: 'keep',
      },
      data: {
        position: 1,
        title: 'Kept',
        description: 'why',
      },
    });
    expect(h.community.update).toHaveBeenCalledWith({
      where: {
        id: 'c1',
      },
      data: {
        rulesRequireAgreement: true,
      },
    });
  });

  it('refuses a rule id that belongs to another community', async () => {
    asRole('ADMIN');
    h.rule.findMany.mockResolvedValue([
      {
        id: 'mine',
      },
    ]);
    const PUT = await load(RULES, 'PUT');
    const res = await PUT({
      params: {
        slug: 'club',
      },
      userId: 'mod',
      body: {
        requireAgreement: false,
        rules: [
          {
            id: 'theirs',
            title: 'x',
          },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(h.rule.update).not.toHaveBeenCalled();
  });

  it('refuses a 16th rule, in the schema and again in the writer', async () => {
    expect(saveRulesBody.safeParse(body(RULES_MAX)).success).toBe(true);
    expect(saveRulesBody.safeParse(body(RULES_MAX + 1)).success).toBe(false);
    asRole('MOD');
    const PUT = await load(RULES, 'PUT');
    const res = await PUT({
      params: {
        slug: 'club',
      },
      userId: 'mod',
      body: body(RULES_MAX + 1),
    });
    expect(res.status).toBe(400);
    expect(h.rule.create).not.toHaveBeenCalled();
  });

  it('keeps titles and descriptions inside their limits', () => {
    const rule = (title: string, description?: string) =>
      saveRulesBody.safeParse({
        requireAgreement: false,
        rules: [
          {
            title,
            description,
          },
        ],
      }).success;
    expect(rule('a'.repeat(60), 'b'.repeat(500))).toBe(true);
    expect(rule('a'.repeat(61))).toBe(false);
    expect(rule('ok', 'b'.repeat(501))).toBe(false);
    expect(rule('   ')).toBe(false);
  });

  it('a private community does not show its rules to a non-member', async () => {
    asRole(null, {
      isPrivate: true,
    });
    const GET = await load(RULES, 'GET');
    expect(
      (
        await GET({
          params: {
            slug: 'club',
          },
          userId: null,
        })
      ).status,
    ).toBe(404);
  });
});

describe('joining with "Require agreement"', () => {
  const join = async (body: Record<string, unknown> | undefined) =>
    (await load(JOIN, 'POST'))({
      params: {
        slug: 'club',
      },
      session: {
        user: {
          id: 'new',
        },
      },
      body,
    });

  beforeEach(() => {
    asRole(null, {
      rulesRequireAgreement: true,
    });
    h.member.findUnique.mockResolvedValue(null);
    h.rule.count.mockResolvedValue(3);
    h.member.create.mockResolvedValue({});
    h.community.update.mockResolvedValue({});
  });

  it('is refused without the tick', async () => {
    const res = await join({});
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: 'rules-agreement-required',
    });
    expect(h.member.create).not.toHaveBeenCalled();
  });

  it('completes with the tick and records when it was given', async () => {
    const res = await join({
      acceptRules: true,
    });
    expect(res.status).toBe(200);
    const data = h.member.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      communityId: 'c1',
      userId: 'new',
    });
    expect(data.rulesAcceptedAt).toBeInstanceOf(Date);
  });

  it('needs no tick when the switch is off, or when there are no rules to read', async () => {
    asRole(null, {
      rulesRequireAgreement: false,
    });
    expect((await join({})).status).toBe(200);
    asRole(null, {
      rulesRequireAgreement: true,
    });
    h.rule.count.mockResolvedValue(0);
    expect((await join({})).status).toBe(200);
    expect(h.member.create.mock.calls.at(-1)![0].data.rulesAcceptedAt).toBeUndefined();
  });
});

describe('reporting a post to the community moderators', () => {
  const POST = {
    id: 'p1',
    userId: 'author',
    content: 'a post',
    audience: 'PUBLIC',
    communityId: 'c1',
    deletedAt: null,
  };
  const report = async (
    userId: string,
    body = {
      postId: 'p1',
      ruleId: 'r2',
    },
  ) =>
    (await load(REPORT, 'POST'))({
      params: {
        slug: 'club',
      },
      userId,
      body,
    });

  beforeEach(() => {
    asRole('MEMBER');
    h.rule.findFirst.mockResolvedValue({
      id: 'r2',
      position: 1,
      title: 'Stay on topic',
      description: null,
    });
    h.post.findUnique.mockResolvedValue(POST);
    h.item.findFirst.mockResolvedValue(null);
    h.item.create.mockResolvedValue({});
    h.item.update.mockResolvedValue({});
  });

  it('creates one queue item labelled with the rule, to the post author', async () => {
    const res = await report('rep1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      alreadyReported: false,
    });
    const data = h.item.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      communityId: 'c1',
      entityType: 'rmhark',
      entityId: 'p1',
      postId: 'p1',
      authorId: 'author',
      action: 'report',
      ruleName: 'Stay on topic',
      snapshot: 'a post',
    });
    expect(data.payload).toMatchObject({
      ruleId: 'r2',
      position: 2,
      reporters: 1,
    });
    expect(h.contentReport.create).not.toHaveBeenCalled();
    // The lock that makes count-or-create safe is taken before the lookup.
    expect(String(h.executeRaw.mock.calls[0]![0])).toContain('pg_advisory_xact_lock');
  });

  it('a second reporter raises the count on the same item; a repeat changes nothing', async () => {
    await report('rep1');
    const payload = h.item.create.mock.calls[0]![0].data.payload;
    h.item.findFirst.mockResolvedValue({
      id: 'item1',
      payload,
    });

    const second = await report('rep2');
    expect(await second.json()).toMatchObject({
      alreadyReported: false,
    });
    expect(h.item.create).toHaveBeenCalledTimes(1);
    const next = h.item.update.mock.calls[0]![0].data.payload;
    expect(next.reporters).toBe(2);

    h.item.findFirst.mockResolvedValue({
      id: 'item1',
      payload: next,
    });
    h.item.update.mockClear();
    const repeat = await report('rep2');
    expect(await repeat.json()).toMatchObject({
      alreadyReported: true,
    });
    expect(h.item.update).not.toHaveBeenCalled();
    expect(reporterCount(next)).toBe(2);
  });

  it('never stores or exposes a reporter id', async () => {
    await report('rep-secret-id');
    const stored = JSON.stringify(h.item.create.mock.calls[0]![0].data);
    expect(stored).not.toContain('rep-secret-id');
  });

  it('refuses a rule of another community, a post of another community, and a deleted post', async () => {
    h.rule.findFirst.mockResolvedValue(null);
    expect((await report('rep1')).status).toBe(404);
    h.rule.findFirst.mockResolvedValue({
      id: 'r2',
      position: 1,
      title: 't',
      description: null,
    });
    h.post.findUnique.mockResolvedValue({
      ...POST,
      communityId: 'other',
    });
    expect((await report('rep1')).status).toBe(404);
    h.post.findUnique.mockResolvedValue({
      ...POST,
      deletedAt: new Date(),
    });
    expect((await report('rep1')).status).toBe(404);
    expect(h.item.create).not.toHaveBeenCalled();
  });

  it('needs membership of a private community', async () => {
    asRole(null, {
      isPrivate: true,
    });
    expect((await report('stranger')).status).toBe(404);
    expect(h.item.create).not.toHaveBeenCalled();
  });

  it('is limited to 10 an hour per member', async () => {
    await import(/* @vite-ignore */ REPORT);
    const opts = h.handlerOptions.find((o) => o.label === 'POST /api/communities/$slug/report');
    expect(opts?.rateLimit).toMatchObject({
      limit: 10,
      windowMs: 60 * 60_000,
    });
  });
});

describe('site-level reasons', () => {
  it('still create a ContentReport for the site moderators', async () => {
    h.contentReport.findFirst.mockResolvedValue(null);
    h.contentReport.create.mockResolvedValue({});
    h.post.findUnique.mockResolvedValue({
      userId: 'author',
    });
    const POST = await load('@/lib/moderation/api/moderation.report.server', 'POST');
    const res = await POST({
      session: {
        user: {
          id: 'rep1',
        },
      },
      body: {
        entityType: 'rmhark',
        entityId: 'p1',
        reason: 'ILLEGAL',
      },
    });
    expect(res.status).toBe(200);
    expect(h.contentReport.create.mock.calls[0]![0].data).toMatchObject({
      reporterId: 'rep1',
      entityType: 'rmhark',
      entityId: 'p1',
      reason: 'ILLEGAL',
      targetUserId: 'author',
    });
    expect(h.item.create).not.toHaveBeenCalled();
  });
});

describe('citing a rule on a removal', () => {
  const decide = async (body: Record<string, unknown>) =>
    (await load(DECIDE, 'POST'))({
      params: {
        slug: 'club',
        itemId: 'item1',
      },
      userId: 'mod',
      body,
    });

  beforeEach(() => {
    asRole('MOD');
    h.item.findUnique.mockResolvedValue({
      authorId: 'author',
      payload: {
        ruleId: 'r3',
        reporters: 2,
        keys: ['k'],
      },
    });
    h.item.update.mockResolvedValue({});
    h.notify.mockResolvedValue(undefined);
  });

  it("names the rule in the author's notice and keeps its text on the item", async () => {
    h.rule.findFirst.mockResolvedValue({
      id: 'r3',
      position: 2,
      title: 'No spam',
      description: null,
    });
    const res = await decide({
      decision: 'remove',
      ruleId: 'r3',
    });
    expect(res.status).toBe(200);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({
      userId: 'author',
      preview: 'Removed from The Club for breaking rule 3: No spam',
    });
    const saved = h.item.update.mock.calls[0]![0].data.payload;
    expect(citedRule(saved)).toEqual({
      position: 3,
      title: 'No spam',
    });
    expect(saved.reporters).toBe(2); // the report data survives the citation
  });

  it('a moderator message follows the citation', async () => {
    h.rule.findFirst.mockResolvedValue({
      id: 'r3',
      position: 0,
      title: 'No spam',
      description: null,
    });
    await decide({
      decision: 'remove',
      ruleId: 'r3',
      message: 'Please read it again.',
    });
    expect(h.notify.mock.calls[0]![0].preview).toBe(
      'Removed from The Club for breaking rule 1: No spam. Please read it again.',
    );
  });

  it('refuses a rule this community does not have, before resolving anything', async () => {
    h.rule.findFirst.mockResolvedValue(null);
    const res = await decide({
      decision: 'remove',
      ruleId: 'nope',
    });
    expect(res.status).toBe(400);
    expect(h.resolveModItem).not.toHaveBeenCalled();
  });

  it('keeps the old behaviour without a rule: only a message notifies', async () => {
    await decide({
      decision: 'remove',
    });
    expect(h.notify).not.toHaveBeenCalled();
    await decide({
      decision: 'remove',
      message: 'Gone.',
    });
    expect(h.notify.mock.calls[0]![0].preview).toBe('Gone.');
  });

  it('only a removal cites: an approval ignores a rule id', async () => {
    await decide({
      decision: 'approve',
      ruleId: 'r3',
    });
    expect(h.rule.findFirst).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('is for moderators only', async () => {
    asRole('MEMBER');
    expect(
      (
        await decide({
          decision: 'remove',
          ruleId: 'r3',
        })
      ).status,
    ).toBe(403);
    expect(h.resolveModItem).not.toHaveBeenCalled();
  });
});

describe('reporter key privacy (review)', () => {
  it('is scoped per community and is not the bare digest of the dedupe key', async () => {
    const { createHash } = await import('node:crypto');
    const { hashReporterKey } = await import('../rules.server');
    const a = hashReporterKey('c1', 'u1', 'p1', 'r1');
    expect(a).toBe(hashReporterKey('c1', 'u1', 'p1', 'r1'));
    expect(a).not.toBe(hashReporterKey('c2', 'u1', 'p1', 'r1'));
    expect(a).not.toBe(createHash('sha256').update('u1\u0000p1\u0000r1').digest('hex').slice(0, 32));
  });
});
