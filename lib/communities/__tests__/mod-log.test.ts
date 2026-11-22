/**
 * s03-14 community moderation log: every moderation endpoint writes exactly one row (table-driven),
 * a failed or no-op action writes none, the full log and the export are for moderators, and the
 * public log shows only the allow-listed fields of content decisions. Prisma is stood in for.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();
  const fn = (key: string) => {
    let f = fns.get(key);
    if (!f) {
      f = vi.fn();
      fns.set(key, f);
    }
    return f;
  };
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => fn(`${name}.${method}`),
      },
    );
  const db: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        if (key === 'then') return undefined;
        if (key === '$transaction') {
          return async (arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db);
        }
        return model(key);
      },
    },
  );
  return {
    fns,
    fn,
    db,
  };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: h.db,
}));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _t: number, load: () => unknown) => load(),
  invalidateCached: vi.fn(),
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(),
}));
vi.mock('@/lib/social/engagement.server', () => ({
  createComment: vi.fn(),
}));
vi.mock('@/lib/tags-extract.server', () => ({
  linkPostHashtags: vi.fn(),
  unlinkPostHashtags: vi.fn(),
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canViewPost: async () => true,
}));
vi.mock('@/lib/hash-ip.server', () => ({
  hashScoped: () => 'hash',
}));
vi.mock('@/lib/admin-review.server', () => ({
  notifyAdminsOfReview: vi.fn(),
}));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({
  musicReportOwner: vi.fn(),
}));

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
const load = async (file: string, method: string): Promise<Handler> =>
  handlersOfModule<Handler>(await import(/* @vite-ignore */ `@/lib/communities/api/communities.$slug.${file}.server`))[
    method
  ]!;

const mock = (key: string) => h.fn(key);
const created = () =>
  mock('communityModAction.create').mock.calls.map(
    (c) =>
      (
        c[0] as {
          data: Record<string, unknown>;
        }
      ).data,
  );

/** The community row every guard reads, whatever fields it selects. */
const community = (role: string | null, over: Record<string, unknown> = {}) =>
  mock('community.findUnique').mockResolvedValue({
    id: 'c1',
    slug: 'club',
    name: 'The Club',
    isPrivate: false,
    createdById: 'owner',
    members: role
      ? [
          {
            role,
          },
        ]
      : [],
    verificationLevel: 'none',
    verificationValue: 0,
    flairRequired: false,
    starThreshold: 5,
    publicModLog: false,
    rulesRequireAgreement: false,
    ...over,
  });

const ctx = (over: Record<string, unknown> = {}) => ({
  params: {
    slug: 'club',
  },
  userId: 'mod1',
  session: {
    user: {
      id: 'mod1',
    },
  },
  ...over,
});
const jsonRequest = (body: unknown) =>
  new Request('http://localhost/x', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  for (const f of h.fns.values()) f.mockReset();
  mock('communityModAction.create').mockResolvedValue({
    id: 99n,
  });
});

interface Case {
  name: string;
  file: string;
  method: string;
  arrange: () => void;
  ctx: Record<string, unknown>;
  action: string;
  expectRow?: Record<string, unknown>;
}

const flairRow = {
  id: 'f1',
  name: 'Art',
  color: 'accent',
};
const automodRow = {
  id: 'a1',
  name: 'No links',
  enabled: true,
  appliesTo: 'both',
  action: 'flag',
  position: 0,
};

const CASES: Case[] = [
  {
    name: 'a role change',
    file: 'members.$userId',
    method: 'PATCH',
    arrange: () => {
      community('MOD');
      mock('communityMember.findUnique')
        .mockResolvedValueOnce({
          role: 'MOD',
        })
        .mockResolvedValueOnce({
          id: 'm9',
          role: 'MEMBER',
        });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        userId: 'u9',
      },
      request: jsonRequest({
        role: 'MOD',
      }),
    }),
    action: 'member_role_changed',
    expectRow: {
      targetUserId: 'u9',
      targetType: 'member',
      detail: {
        role: 'MOD',
      },
    },
  },
  {
    name: 'removing a member',
    file: 'members.$userId',
    method: 'DELETE',
    arrange: () => {
      community('MOD');
      mock('communityMember.findUnique')
        .mockResolvedValueOnce({
          role: 'MOD',
        })
        .mockResolvedValueOnce({
          id: 'm9',
          role: 'MEMBER',
        });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        userId: 'u9',
      },
    }),
    action: 'member_removed',
    expectRow: {
      targetUserId: 'u9',
      targetType: 'member',
    },
  },
  {
    name: 'removing a queued comment, citing a rule',
    file: 'modqueue.$itemId',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityRule.findFirst').mockResolvedValue({
        id: 'r1',
        position: 2,
        title: 'Be kind',
        description: null,
      });
      mock('communityModItem.findFirst').mockResolvedValue({
        id: 'q1',
        status: 'PENDING',
        entityType: 'comment',
        entityId: 'cm1',
        action: 'flag',
        authorId: 'author1',
        postId: 'p1',
        payload: null,
      });
      mock('communityModItem.updateMany').mockResolvedValue({
        count: 1,
      });
      mock('communityModItem.findUnique').mockResolvedValue({
        authorId: 'author1',
        payload: null,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        itemId: 'q1',
      },
      body: {
        decision: 'remove',
        ruleId: 'r1',
        message: 'Please keep it civil',
      },
    }),
    action: 'content_removed',
    expectRow: {
      targetUserId: 'author1',
      targetType: 'comment',
      targetId: 'cm1',
      ruleId: 'r1',
      ruleTitle: 'Be kind',
      reason: 'Please keep it civil',
    },
  },
  {
    name: 'approving a queued post',
    file: 'modqueue.$itemId',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityModItem.findFirst').mockResolvedValue({
        id: 'q2',
        status: 'PENDING',
        entityType: 'rmhark',
        entityId: 'p7',
        action: 'flag',
        authorId: 'author2',
        postId: 'p7',
        payload: null,
      });
      mock('communityModItem.updateMany').mockResolvedValue({
        count: 1,
      });
      mock('rMHark.findUnique').mockResolvedValue({
        id: 'p7',
        userId: 'author2',
        content: 'hi',
        deletedAt: null,
        deletedBy: null,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        itemId: 'q2',
      },
      body: {
        decision: 'approve',
      },
    }),
    action: 'content_approved',
    expectRow: {
      targetType: 'post',
      targetId: 'p7',
      ruleId: null,
      reason: null,
    },
  },
  {
    name: 'a settings change',
    file: 'settings',
    method: 'PATCH',
    arrange: () => community('MOD'),
    ctx: ctx({
      body: {
        flairRequired: true,
        publicModLog: true,
      },
    }),
    action: 'settings_changed',
    expectRow: {
      detail: {
        fields: ['flairRequired', 'publicModLog'],
      },
    },
  },
  {
    name: 'deciding a join request',
    file: 'join-requests.$id',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityJoinRequest.findFirst').mockResolvedValue({
        userId: 'u5',
      });
      mock('communityJoinRequest.updateMany').mockResolvedValue({
        count: 1,
      });
      mock('communityMember.createMany').mockResolvedValue({
        count: 1,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        id: '7',
      },
      body: {
        decision: 'approve',
      },
    }),
    action: 'join_request_approved',
    expectRow: {
      targetUserId: 'u5',
      targetType: 'request',
      targetId: '7',
    },
  },
  {
    name: 'minting an invite',
    file: 'invites',
    method: 'POST',
    arrange: () => {
      community('MOD', {
        isPrivate: true,
      });
      mock('communityInvite.count').mockResolvedValue(0);
      mock('communityInvite.create').mockResolvedValue({
        id: 3n,
        code: 'abc',
        maxUses: 5,
        uses: 0,
        expiresAt: null,
        createdAt: new Date(),
        createdBy: {
          id: 'mod1',
          name: 'M',
          handle: 'm',
        },
      });
    },
    ctx: ctx({
      body: {
        maxUses: 5,
      },
    }),
    action: 'invite_created',
    expectRow: {
      targetType: 'invite',
      targetId: '3',
      detail: {
        maxUses: 5,
        expiresInDays: null,
      },
    },
  },
  {
    name: 'revoking an invite',
    file: 'invites.$id',
    method: 'DELETE',
    arrange: () => {
      community('MOD');
      mock('communityInvite.updateMany').mockResolvedValue({
        count: 1,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        id: '3',
      },
    }),
    action: 'invite_revoked',
    expectRow: {
      targetType: 'invite',
      targetId: '3',
    },
  },
  {
    name: 'creating a flair',
    file: 'flairs',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityFlair.count').mockResolvedValue(0);
      mock('communityFlair.create').mockResolvedValue(flairRow);
    },
    ctx: ctx({
      body: {
        name: 'Art',
        color: 'accent',
      },
    }),
    action: 'flair_created',
    expectRow: {
      targetType: 'flair',
      targetId: 'f1',
      detail: {
        name: 'Art',
      },
    },
  },
  {
    name: 'editing a flair',
    file: 'flairs.$flairId',
    method: 'PATCH',
    arrange: () => {
      community('MOD');
      mock('communityFlair.findFirst').mockResolvedValue({
        id: 'f1',
      });
      mock('communityFlair.update').mockResolvedValue(flairRow);
    },
    ctx: ctx({
      params: {
        slug: 'club',
        flairId: 'f1',
      },
      body: {
        name: 'Art',
        color: 'accent',
      },
    }),
    action: 'flair_updated',
    expectRow: {
      targetType: 'flair',
      targetId: 'f1',
    },
  },
  {
    name: 'deleting a flair',
    file: 'flairs.$flairId',
    method: 'DELETE',
    arrange: () => {
      community('MOD');
      mock('communityFlair.findFirst').mockResolvedValue({
        id: 'f1',
        name: 'Art',
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        flairId: 'f1',
      },
    }),
    action: 'flair_deleted',
    expectRow: {
      targetType: 'flair',
      targetId: 'f1',
      detail: {
        name: 'Art',
      },
    },
  },
  {
    name: 'adding an AutoMod rule',
    file: 'automod',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityAutomodRule.count').mockResolvedValue(0);
      mock('communityAutomodRule.create').mockResolvedValue(automodRow);
    },
    ctx: ctx({
      body: {
        name: 'No links',
        enabled: true,
        appliesTo: 'both',
        action: 'flag',
        conditions: {},
      },
    }),
    action: 'automod_created',
    expectRow: {
      targetType: 'automod',
      targetId: 'a1',
      detail: {
        name: 'No links',
      },
    },
  },
  {
    name: 'toggling an AutoMod rule',
    file: 'automod.$ruleId',
    method: 'PATCH',
    arrange: () => {
      community('MOD');
      mock('communityAutomodRule.updateMany').mockResolvedValue({
        count: 1,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        ruleId: 'a1',
      },
      body: {
        enabled: false,
      },
    }),
    action: 'automod_updated',
    expectRow: {
      targetType: 'automod',
      targetId: 'a1',
      detail: {
        fields: ['enabled'],
      },
    },
  },
  {
    name: 'deleting an AutoMod rule',
    file: 'automod.$ruleId',
    method: 'DELETE',
    arrange: () => {
      community('MOD');
      mock('communityAutomodRule.findFirst').mockResolvedValue({
        id: 'a1',
        name: 'No links',
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        ruleId: 'a1',
      },
    }),
    action: 'automod_deleted',
    expectRow: {
      targetType: 'automod',
      targetId: 'a1',
    },
  },
  {
    name: 'posting an announcement',
    file: 'announcements',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityMember.findUnique').mockResolvedValue({
        role: 'MOD',
      });
      mock('communityAnnouncement.create').mockResolvedValue({
        id: 'n1',
        body: 'Hello',
        createdAt: new Date(),
        author: {
          name: 'M',
          handle: 'm',
          image: null,
        },
      });
    },
    ctx: ctx({
      body: {
        body: 'Hello',
      },
    }),
    action: 'announcement_posted',
    expectRow: {
      targetType: 'announcement',
      targetId: 'n1',
    },
  },
  {
    name: 'removing an announcement',
    file: 'announcements.$id',
    method: 'DELETE',
    arrange: () => {
      community('MOD');
      mock('communityMember.findUnique').mockResolvedValue({
        role: 'MOD',
      });
      mock('communityAnnouncement.findUnique').mockResolvedValue({
        id: 'n1',
        communityId: 'c1',
        authorId: 'someone',
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        id: 'n1',
      },
    }),
    action: 'announcement_removed',
    expectRow: {
      targetUserId: 'someone',
      targetType: 'announcement',
      targetId: 'n1',
    },
  },
  {
    name: 'replacing the onboarding questions',
    file: 'onboarding',
    method: 'PUT',
    arrange: () => {
      community('MOD');
      mock('communityFlair.findMany').mockResolvedValue([]);
      mock('communityOnboardingQuestion.findMany').mockResolvedValue([]);
    },
    ctx: ctx({
      body: {
        questions: [
          {
            prompt: 'Q',
            options: [
              {
                label: 'A',
                flairIds: [],
              },
              {
                label: 'B',
                flairIds: [],
              },
            ],
          },
        ],
      },
    }),
    action: 'onboarding_changed',
    expectRow: {
      detail: {
        questions: 1,
      },
    },
  },
  {
    name: 'linking related communities',
    file: 'sisters',
    method: 'PUT',
    arrange: () => {
      community('MOD');
      mock('communitySister.findMany').mockResolvedValue([]);
    },
    ctx: ctx({
      body: {
        slugs: [],
      },
    }),
    action: 'sisters_changed',
    expectRow: {
      detail: {
        slugs: [],
      },
    },
  },
  {
    name: 'saving the rules',
    file: 'rules',
    method: 'PUT',
    arrange: () => {
      community('MOD');
      mock('communityRule.findMany').mockResolvedValue([]);
    },
    ctx: ctx({
      body: {
        rules: [
          {
            title: 'Be kind',
          },
        ],
        requireAgreement: true,
      },
    }),
    action: 'rules_changed',
    expectRow: {
      detail: {
        rules: 1,
        requireAgreement: true,
      },
    },
  },
  {
    name: 'closing a census',
    file: 'census.$id.close',
    method: 'POST',
    arrange: () => {
      community('MOD');
      mock('communityCensus.updateMany').mockResolvedValue({
        count: 1,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        id: 'z1',
      },
    }),
    action: 'census_closed',
    expectRow: {
      targetType: 'census',
      targetId: 'z1',
    },
  },
  {
    name: 'cancelling a challenge',
    file: 'challenge.$id',
    method: 'DELETE',
    arrange: () => {
      community('MOD');
      mock('communityChallenge.deleteMany').mockResolvedValue({
        count: 1,
      });
    },
    ctx: ctx({
      params: {
        slug: 'club',
        id: 'ch1',
      },
    }),
    action: 'challenge_cancelled',
    expectRow: {
      targetType: 'challenge',
      targetId: 'ch1',
    },
  },
];

describe('every moderation endpoint writes exactly one row', () => {
  it.each(CASES)('$name', async (c) => {
    c.arrange();
    const res = await (await load(c.file, c.method))(c.ctx);
    expect(res.status).toBeLessThan(300);
    const rows = created();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      communityId: 'c1',
      actorId: 'mod1',
      action: c.action,
      ...c.expectRow,
    });
  });
});

describe('a failed or empty action writes no row', () => {
  const none = () => expect(mock('communityModAction.create')).not.toHaveBeenCalled();

  it('refuses to remove the owner', async () => {
    community('MOD');
    mock('communityMember.findUnique').mockResolvedValue({
      role: 'MOD',
    });
    const res = await (
      await load('members.$userId', 'DELETE')
    )(
      ctx({
        params: {
          slug: 'club',
          userId: 'owner',
        },
      }),
    );
    expect(res.status).toBe(400);
    none();
  });

  it('does not log when the action itself throws (the log is the last statement of the transaction)', async () => {
    community('MOD');
    mock('communityMember.findUnique')
      .mockResolvedValueOnce({
        role: 'MOD',
      })
      .mockResolvedValueOnce({
        id: 'm9',
        role: 'MEMBER',
      });
    mock('community.update').mockRejectedValue(new Error('db down'));
    await expect(
      (await load('members.$userId', 'DELETE'))(
        ctx({
          params: {
            slug: 'club',
            userId: 'u9',
          },
        }),
      ),
    ).rejects.toThrow('db down');
    none();
  });

  it('does not log a flair that is not there', async () => {
    community('MOD');
    mock('communityFlair.findFirst').mockResolvedValue(null);
    const res = await (
      await load('flairs.$flairId', 'DELETE')
    )(
      ctx({
        params: {
          slug: 'club',
          flairId: 'nope',
        },
      }),
    );
    expect(res.status).toBe(404);
    none();
  });

  it('does not log an AutoMod edit of a rule that is not there, or an already-closed census', async () => {
    community('MOD');
    mock('communityAutomodRule.updateMany').mockResolvedValue({
      count: 0,
    });
    expect(
      (
        await (
          await load('automod.$ruleId', 'PATCH')
        )(
          ctx({
            params: {
              slug: 'club',
              ruleId: 'x',
            },
            body: {
              enabled: true,
            },
          }),
        )
      ).status,
    ).toBe(404);
    mock('communityCensus.updateMany').mockResolvedValue({
      count: 0,
    });
    expect(
      (
        await (
          await load('census.$id.close', 'POST')
        )(
          ctx({
            params: {
              slug: 'club',
              id: 'z',
            },
          }),
        )
      ).status,
    ).toBe(404);
    none();
  });

  it('does not log a request or invite someone else already decided', async () => {
    community('MOD');
    mock('communityJoinRequest.findFirst').mockResolvedValue(null);
    expect(
      (
        await (
          await load('join-requests.$id', 'POST')
        )(
          ctx({
            params: {
              slug: 'club',
              id: '7',
            },
            body: {
              decision: 'deny',
            },
          }),
        )
      ).status,
    ).toBe(404);
    mock('communityInvite.updateMany').mockResolvedValue({
      count: 0,
    });
    await (
      await load('invites.$id', 'DELETE')
    )(
      ctx({
        params: {
          slug: 'club',
          id: '3',
        },
      }),
    );
    none();
  });

  it('does not log a settings save that changes nothing', async () => {
    community('MOD');
    const res = await (
      await load('settings', 'PATCH')
    )(
      ctx({
        body: {
          flairRequired: false,
          starThreshold: 5,
          verificationLevel: 'none',
          verificationValue: 0,
        },
      }),
    );
    expect(res.status).toBe(200);
    none();
    expect(mock('community.update')).not.toHaveBeenCalled();
  });

  it('does not log a decision on an item that was already resolved', async () => {
    community('MOD');
    mock('communityModItem.findFirst').mockResolvedValue({
      id: 'q1',
      status: 'PENDING',
      entityType: 'comment',
      entityId: 'cm1',
      action: 'flag',
      authorId: 'a',
      payload: null,
    });
    mock('communityModItem.updateMany').mockResolvedValue({
      count: 0,
    });
    const res = await (
      await load('modqueue.$itemId', 'POST')
    )(
      ctx({
        params: {
          slug: 'club',
          itemId: 'q1',
        },
        body: {
          decision: 'remove',
        },
      }),
    );
    expect(res.status).toBe(409);
    none();
  });

  it('takes the row back when taking the content down fails after the claim', async () => {
    community('MOD');
    mock('communityModItem.findFirst').mockResolvedValue({
      id: 'q1',
      status: 'PENDING',
      entityType: 'comment',
      entityId: 'cm1',
      action: 'flag',
      authorId: 'a',
      payload: null,
    });
    mock('communityModItem.updateMany').mockResolvedValue({
      count: 1,
    });
    mock('rMHarkComment.updateMany').mockRejectedValue(new Error('boom'));
    await expect(
      (await load('modqueue.$itemId', 'POST'))(
        ctx({
          params: {
            slug: 'club',
            itemId: 'q1',
          },
          body: {
            decision: 'remove',
          },
        }),
      ),
    ).rejects.toThrow('boom');
    expect(mock('communityModAction.deleteMany')).toHaveBeenCalledWith({
      where: {
        id: 99n,
      },
    });
  });

  it('does not log anything for a member who is not a moderator', async () => {
    community('MEMBER');
    const res = await (
      await load('flairs', 'POST')
    )(
      ctx({
        body: {
          name: 'A',
          color: 'accent',
        },
      }),
    );
    expect(res.status).toBe(403);
    none();
  });
});

describe('the full log and the export are for moderators', () => {
  it.each([
    ['a member', 'MEMBER', 403],
    ['a signed-in non-member', null, 403],
  ] as const)('answers %s with 403', async (_n, role, status) => {
    community(role);
    const log = await load('modlog', 'GET');
    expect(
      (
        await log(
          ctx({
            query: {
              scope: 'full',
            },
          }),
        )
      ).status,
    ).toBe(status);
    expect(
      (
        await log(
          ctx({
            query: {},
          }),
        )
      ).status,
    ).toBe(status);
    expect((await (await load('modlog.export', 'GET'))(ctx())).status).toBe(status);
    expect(mock('communityModAction.findMany')).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in, and a missing community is 404', async () => {
    community(null);
    expect(
      (
        await (
          await load('modlog', 'GET')
        )(
          ctx({
            userId: null,
            query: {},
          }),
        )
      ).status,
    ).toBe(401);
    mock('community.findUnique').mockResolvedValue(null);
    expect(
      (
        await (
          await load('modlog', 'GET')
        )(
          ctx({
            query: {},
          }),
        )
      ).status,
    ).toBe(404);
  });

  const row = (id: bigint, over: Record<string, unknown> = {}) => ({
    id,
    communityId: 'c1',
    actorId: 'mod1',
    action: 'content_removed',
    targetUserId: 'u2',
    targetType: 'post',
    targetId: 'p1',
    ruleId: 'r1',
    ruleTitle: 'Be kind',
    reason: 'Insulting',
    detail: null,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    ...over,
  });

  it('lists newest first with the moderator named, 50 a page, and filters in the query', async () => {
    community('MOD');
    const rows = Array.from(
      {
        length: 51,
      },
      (_v, i) => row(BigInt(200 - i)),
    );
    mock('communityModAction.findMany').mockResolvedValue(rows);
    mock('user.findMany').mockResolvedValue([
      {
        id: 'mod1',
        name: 'Mod One',
        handle: 'modone',
        image: null,
      },
      {
        id: 'u2',
        name: 'Member',
        handle: 'member',
        image: null,
      },
    ]);
    mock('communityMember.findMany').mockResolvedValue([
      {
        user: {
          id: 'mod1',
          name: 'Mod One',
          handle: 'modone',
          image: null,
        },
      },
    ]);
    const res = await (
      await load('modlog', 'GET')
    )(
      ctx({
        query: {
          group: 'members',
          actor: 'mod1',
          cursor: undefined,
        },
      }),
    );
    const body = (await res.json()) as {
      scope: string;
      entries: {
        actor: {
          name: string;
        };
        targetUser: {
          handle: string;
        };
      }[];
      nextCursor: string;
      moderators: unknown[];
    };
    expect(body.scope).toBe('full');
    expect(body.entries).toHaveLength(50);
    expect(body.entries[0]!.actor.name).toBe('Mod One');
    expect(body.nextCursor).toBe('151');
    expect(body.moderators).toHaveLength(1);
    const args = mock('communityModAction.findMany').mock.calls[0]![0] as {
      take: number;
      where: {
        communityId: string;
        actorId: string;
        action: {
          in: string[];
        };
      };
      orderBy: unknown;
    };
    expect(args.take).toBe(51);
    expect(args.where).toMatchObject({
      communityId: 'c1',
      actorId: 'mod1',
    });
    expect(args.where.action.in).toContain('member_removed');
    expect(args.where.action.in).not.toContain('content_removed');
    expect(args.orderBy).toEqual([
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ]);
  });

  it('shows a deleted member as no one and skips rows with a code it does not know', async () => {
    community('ADMIN');
    mock('communityModAction.findMany').mockResolvedValue([
      row(2n, {
        actorId: null,
        targetUserId: null,
      }),
      row(1n, {
        action: 'from_the_future',
      }),
    ]);
    mock('user.findMany').mockResolvedValue([]);
    mock('communityMember.findMany').mockResolvedValue([]);
    const body = (await (
      await (
        await load('modlog', 'GET')
      )(
        ctx({
          query: {},
        }),
      )
    ).json()) as {
      entries: {
        id: string;
        actor: unknown;
        targetUser: unknown;
      }[];
      nextCursor: unknown;
    };
    expect(body.entries).toEqual([
      expect.objectContaining({
        id: '2',
        actor: null,
        targetUser: null,
      }),
    ]);
    expect(body.nextCursor).toBeNull();
  });

  it('exports the last 365 days as a CSV for a moderator', async () => {
    community('MOD');
    mock('communityModAction.findMany').mockResolvedValue([
      row(2n),
      row(1n, {
        action: 'member_removed',
        reason: '=SUM(A1)',
      }),
    ]);
    mock('user.findMany').mockResolvedValue([
      {
        id: 'mod1',
        name: 'Mod One',
        handle: 'modone',
        image: null,
      },
      {
        id: 'u2',
        name: 'Member',
        handle: 'member',
        image: null,
      },
    ]);
    const res = await (await load('modlog.export', 'GET'))(ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('club-moderation-log.csv');
    const lines = (await res.text()).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(',modone,content_removed,member,post,p1,Be kind,Insulting');
    expect(lines[2]).toContain(`'=SUM(A1)`);
    const where = (
      mock('communityModAction.findMany').mock.calls[0]![0] as {
        where: {
          communityId: string;
          createdAt: {
            gte: Date;
          };
        };
      }
    ).where;
    const days = (Date.now() - where.createdAt.gte.getTime()) / 86_400_000;
    expect(where.communityId).toBe('c1');
    expect(days).toBeGreaterThan(364.9);
    expect(days).toBeLessThan(365.1);
  });
});

describe('the public log', () => {
  const publicRows = [
    {
      id: 5n,
      action: 'content_removed',
      targetType: 'post',
      ruleTitle: 'Be kind',
      reason: 'Insulting',
      createdAt: new Date('2026-11-20T10:00:00Z'),
      // Not selected by the query, but even if a row carried them they must not leave.
      actorId: 'mod1',
      targetUserId: 'u2',
      detail: {
        role: 'MOD',
      },
    },
  ];

  it('is a 404 until a moderator turns it on, even for a moderator', async () => {
    community('MOD', {
      publicModLog: false,
    });
    expect(
      (
        await (
          await load('modlog', 'GET')
        )(
          ctx({
            query: {
              scope: 'public',
            },
          }),
        )
      ).status,
    ).toBe(404);
    expect(mock('communityModAction.findMany')).not.toHaveBeenCalled();
  });

  it('shows members the content decisions and nothing about who or whom', async () => {
    community('MEMBER', {
      publicModLog: true,
    });
    mock('communityModAction.findMany').mockResolvedValue(publicRows);
    const res = await (
      await load('modlog', 'GET')
    )(
      ctx({
        userId: 'member1',
        query: {
          scope: 'public',
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      scope: 'public',
      entries: [
        {
          id: '5',
          action: 'content_removed',
          targetType: 'post',
          ruleTitle: 'Be kind',
          reason: 'Insulting',
          createdAt: '2026-11-20T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('mod1');
    expect(text).not.toContain('u2');
    const args = mock('communityModAction.findMany').mock.calls[0]![0] as {
      where: {
        action: {
          in: string[];
        };
      };
      select: Record<string, boolean>;
    };
    expect(args.where.action.in).toEqual([
      'content_removed',
      'content_approved',
      'post_pinned',
      'post_unpinned',
      'pins_reordered',
    ]);
    expect(Object.keys(args.select).sort()).toEqual(
      ['action', 'createdAt', 'id', 'reason', 'ruleTitle', 'targetType'].sort(),
    );
    expect(mock('user.findMany')).not.toHaveBeenCalled();
  });

  it('can be read signed out on a public community, and not on a private one', async () => {
    community(null, {
      publicModLog: true,
    });
    mock('communityModAction.findMany').mockResolvedValue([]);
    expect(
      (
        await (
          await load('modlog', 'GET')
        )(
          ctx({
            userId: null,
            query: {
              scope: 'public',
            },
          }),
        )
      ).status,
    ).toBe(200);
    community(null, {
      publicModLog: true,
      isPrivate: true,
    });
    expect(
      (
        await (
          await load('modlog', 'GET')
        )(
          ctx({
            userId: null,
            query: {
              scope: 'public',
            },
          }),
        )
      ).status,
    ).toBe(404);
  });
});

describe('retention', () => {
  it('prunes rows older than 365 days in batches until none are left', async () => {
    const { pruneModLog, MOD_LOG_PRUNE_BATCH } = await import('@/lib/communities/modlog.server');
    const ids = (n: number) =>
      Array.from(
        {
          length: n,
        },
        (_v, i) => ({
          id: BigInt(i + 1),
        }),
      );
    mock('communityModAction.findMany').mockResolvedValueOnce(ids(MOD_LOG_PRUNE_BATCH)).mockResolvedValueOnce(ids(3));
    mock('communityModAction.deleteMany').mockImplementation(
      async (a: {
        where: {
          id: {
            in: bigint[];
          };
        };
      }) => ({
        count: a.where.id.in.length,
      }),
    );
    const now = new Date('2026-12-01T00:00:00Z');
    expect(await pruneModLog(now)).toBe(MOD_LOG_PRUNE_BATCH + 3);
    const first = mock('communityModAction.findMany').mock.calls[0]![0] as {
      where: {
        createdAt: {
          lt: Date;
        };
      };
      take: number;
    };
    expect(first.where.createdAt.lt.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(first.take).toBe(MOD_LOG_PRUNE_BATCH);
    expect(mock('communityModAction.deleteMany')).toHaveBeenCalledTimes(2);
  });

  it('is scheduled monthly on its own queue', async () => {
    const { registerCommunityCrons, MODLOG_PRUNE_QUEUE, MODLOG_PRUNE_CRON } =
      await import('@/lib/communities/jobs.server');
    const boss = {
      createQueue: vi.fn(),
      schedule: vi.fn(),
      work: vi.fn(),
    };
    await registerCommunityCrons(boss as never);
    expect(boss.schedule).toHaveBeenCalledWith(
      MODLOG_PRUNE_QUEUE,
      MODLOG_PRUNE_CRON,
      {},
      {
        tz: 'UTC',
      },
    );
    expect(MODLOG_PRUNE_CRON).toMatch(/^\d+ \d+ 1 \* \*$/);
    expect(boss.work).toHaveBeenCalledWith(MODLOG_PRUNE_QUEUE, expect.any(Function));
  });
});

describe('schema and migration agree', () => {
  it('names the real table, columns and indexes', () => {
    const schema = readFileSync('prisma/schema/communities.prisma', 'utf8');
    const sql = readFileSync('prisma/migrations/20261123020000_s03_community_mod_log/migration.sql', 'utf8');
    expect(schema).toContain('@@map("community_mod_action")');
    expect(schema).toContain('@@index([communityId, createdAt(sort: Desc)])');
    expect(schema).toContain('@@index([communityId, actorId, createdAt])');
    for (const col of ['actorId', 'targetUserId', 'ruleTitle', 'reason', 'detail', 'createdAt']) {
      expect(sql).toContain(`"${col}"`);
    }
    expect(sql).toContain('CREATE TABLE "community_mod_action"');
    expect(sql).toContain('"publicModLog" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).not.toMatch(/DROP|DELETE FROM/i);
  });
});
