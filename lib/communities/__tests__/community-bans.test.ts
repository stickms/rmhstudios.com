/**
 * s06-01 community bans and timeouts. Prisma is faked; the fake evaluates the one `where` shape
 * `activeSanction` sends (not lifted, `endsAt` null or in the future), so "expired no longer applies" is the real query
 * semantics. Time is the application clock (`endsAt > now`), as bans.server.ts states; no raw SQL is written here.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

interface Row {
  id: string;
  communityId: string;
  userId: string;
  kind: string;
  endsAt: Date | null;
  ruleId:
    | string
    | null;
  reason:
    | string
    | null;
  createdById:
    | string
    | null;
  createdAt: Date;
  liftedAt: Date | null;
  liftedById:
    | string
    | null;
}

const h =
  vi.hoisted(
    () => ({
      calls:
        [] as string[],
      rows: [] as Row[],
      member:
        null as null | {
          id: string;
          role: string;
        },
      userExists: true,
      rule: null as null | {
        id: string;
        position: number;
        title: string;
      },
      notifications:
        [] as Array<{
          userId: string;
          preview:
            | string
            | null;
          entityType?:
            | string
            | null;
        }>,
      logged:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
      seq: 0,
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => {
    const matches =
      (
        r: Row,
        where: Record<
          string,
          unknown
        >,
      ) => {
        if (
          where.communityId &&
          r.communityId !==
            where.communityId
        )
          return false;
        if (
          where.userId &&
          r.userId !==
            where.userId
        )
          return false;
        if (
          where.id &&
          r.id !==
            where.id
        )
          return false;
        if (
          'liftedAt' in
            where &&
          where.liftedAt ===
            null &&
          r.liftedAt !==
            null
        )
          return false;
        const or =
          where.OR as
            | Array<{
                endsAt: null | {
                  gt: Date;
                };
              }>
            | undefined;
        if (
          or
        ) {
          const ok =
            or.some(
              (
                c,
              ) =>
                c.endsAt ===
                null
                  ? r.endsAt ===
                    null
                  : r.endsAt !==
                      null &&
                    r.endsAt >
                      c
                        .endsAt
                        .gt,
            );
          if (
            !ok
          )
            return false;
        }
        return true;
      };
    const prisma =
      {
        communityMember:
          {
            findUnique:
              async () =>
                h.member,
            delete:
              async () => {
                h.calls.push(
                  'member.delete',
                );
                return {};
              },
          },
        community:
          {
            update:
              async () => {
                h.calls.push(
                  'community.update',
                );
                return {};
              },
          },
        user: {
          findUnique:
            async () =>
              h.userExists
                ? {
                    id: 'x',
                  }
                : null,
          findMany:
            async () => [],
        },
        communityRule:
          {
            findMany:
              async () => [],
          },
        communityBan:
          {
            findFirst:
              async (a: {
                where: Record<
                  string,
                  unknown
                >;
              }) =>
                h.rows.find(
                  (
                    r,
                  ) =>
                    matches(
                      r,
                      a.where,
                    ),
                ) ??
                null,
            findMany:
              async () => [],
            updateMany:
              async (a: {
                where: Record<
                  string,
                  unknown
                >;
                data: Partial<Row>;
              }) => {
                h.calls.push(
                  'ban.updateMany',
                );
                const hit =
                  h.rows.filter(
                    (
                      r,
                    ) =>
                      matches(
                        r,
                        a.where,
                      ),
                  );
                hit.forEach(
                  (
                    r,
                  ) =>
                    Object.assign(
                      r,
                      a.data,
                    ),
                );
                return {
                  count:
                    hit.length,
                };
              },
            create:
              async (a: {
                data: Partial<Row>;
              }) => {
                h.calls.push(
                  'ban.create',
                );
                const row =
                  {
                    id: `b${++h.seq}`,
                    ruleId:
                      null,
                    reason:
                      null,
                    liftedAt:
                      null,
                    liftedById:
                      null,
                    createdAt:
                      new Date(),
                    ...a.data,
                  } as Row;
                h.rows.push(
                  row,
                );
                return {
                  id: row.id,
                };
              },
          },
        $transaction:
          async (
            cb: (
              tx: unknown,
            ) => unknown,
          ) =>
            cb(
              prisma,
            ),
      };
    return {
      prisma,
    };
  },
);
vi.mock(
  '@/lib/db/advisory-lock.server',
  () => ({
    lockKey:
      async (
        _tx: unknown,
        key: string,
      ) => {
        h.calls.push(
          `lock:${key}`,
        );
      },
  }),
);
vi.mock(
  '@/lib/communities/modlog.server',
  () => ({
    logModAction:
      async (
        _tx: unknown,
        input: Record<
          string,
          unknown
        >,
      ) => {
        h.calls.push(
          `log:${String(input.action)}`,
        );
        h.logged.push(
          input,
        );
        return 1n;
      },
  }),
);
vi.mock(
  '@/lib/communities/join-requests.server',
  () => ({
    markRemoved:
      async () => {
        h.calls.push(
          'markRemoved',
        );
      },
  }),
);
vi.mock(
  '@/lib/communities/member-events.server',
  () => ({
    recordMemberEvent:
      async (
        _tx: unknown,
        _c: string,
        _u: string,
        kind: string,
      ) => {
        h.calls.push(
          `event:${kind}`,
        );
      },
  }),
);
vi.mock(
  '@/lib/communities/rules.server',
  () => ({
    getRule:
      async () =>
        h.rule,
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification:
      async (n: {
        userId: string;
        preview?:
          | string
          | null;
        entityType?:
          | string
          | null;
      }) => {
        h.notifications.push(
          {
            userId:
              n.userId,
            preview:
              n.preview ??
              null,
            entityType:
              n.entityType ??
              null,
          },
        );
      },
  }),
);
// The gate's other inputs: this test is about the first check only.
vi.mock(
  '@/lib/communities/settings.server',
  () => ({
    getCommunitySettings:
      async () => ({
        flairRequired: false,
        verification:
          {
            level:
              'none',
            value: 0,
          },
      }),
  }),
);
vi.mock(
  '@/lib/communities/flairs.server',
  () => ({
    flairBelongsTo:
      async () =>
        true,
  }),
);
vi.mock(
  '@/lib/communities/automod.server',
  () => ({
    getAutomodRules:
      async () => [],
    recordModItem:
      async () => {},
  }),
);

const {
  activeSanction,
  sanction,
  lift,
} =
  await import('@/lib/communities/bans.server');
const {
  acceptInvite,
} =
  await import('@/lib/communities/invites.server');
const {
  gateCommunityContent,
} =
  await import('@/lib/communities/gate.server');

const HOUR = 3_600_000;
const community =
  {
    id: 'c1',
    name: 'Chess',
    createdById:
      'owner',
  };
const row =
  (
    over: Partial<Row>,
  ): Row => ({
    id: `r${++h.seq}`,
    communityId:
      'c1',
    userId:
      'u1',
    kind: 'ban',
    endsAt:
      new Date(
        Date.now() +
          HOUR,
      ),
    ruleId:
      null,
    reason:
      'private note',
    createdById:
      'mod1',
    createdAt:
      new Date(),
    liftedAt:
      null,
    liftedById:
      null,
    ...over,
  });

beforeEach(
  () => {
    h.calls.length = 0;
    h.rows.length = 0;
    h.notifications.length = 0;
    h.logged.length = 0;
    h.member =
      {
        id: 'm1',
        role: 'MEMBER',
      };
    h.userExists = true;
    h.rule =
      null;
  },
);

describe('activeSanction', () => {
  it('finds a live sanction, and an expired or lifted one no longer applies', async () => {
    h.rows.push(
      row(
        {
          endsAt:
            new Date(
              Date.now() +
                HOUR,
            ),
        },
      ),
    );
    expect(
      (
        await activeSanction(
          'c1',
          'u1',
        )
      )
        ?.kind,
    ).toBe(
      'ban',
    );
    h.rows.length = 0;
    h.rows.push(
      row(
        {
          endsAt:
            new Date(
              Date.now() -
                1000,
            ),
        },
      ),
    );
    expect(
      await activeSanction(
        'c1',
        'u1',
      ),
    ).toBeNull();
    h.rows.length = 0;
    h.rows.push(
      row(
        {
          endsAt:
            null,
          liftedAt:
            new Date(),
        },
      ),
    );
    expect(
      await activeSanction(
        'c1',
        'u1',
      ),
    ).toBeNull();
    h.rows.length = 0;
    h.rows.push(
      row(
        {
          endsAt:
            null,
        },
      ),
    );
    expect(
      (
        await activeSanction(
          'c1',
          'u1',
        )
      )
        ?.endsAt,
    ).toBeNull();
  });

  it('never selects the private reason', async () => {
    const src = (await import('node:fs')).readFileSync('lib/communities/bans.server.ts', 'utf8');
    const flat = src.replace(/\s+/g, ' ');
    const start = flat.indexOf('export async function activeSanction');
    const body = flat.slice(start, flat.indexOf('export type SanctionResult'));
    expect(body).toMatch(/select: \{ id: true, kind: true, endsAt: true, ruleId: true,? \}/);
    expect(body).not.toContain('reason');
  });
});

describe('enforcement', () => {
  it('a banned member cannot accept an invite', async () => {
    h.member =
      null;
    h.rows.push(
      row(
        {
          endsAt:
            null,
        },
      ),
    );
    const res =
      await acceptInvite(
        'c1',
        'u1',
        'code',
      );
    expect(
      res,
    ).toMatchObject(
      {
        ok: false,
        reason:
          'banned',
        kind: 'ban',
      },
    );
  });

  it('the gate refuses a timed-out member first, with the end date', async () => {
    const ends =
      new Date(
        Date.now() +
          HOUR,
      );
    h.rows.push(
      row(
        {
          kind: 'timeout',
          endsAt:
            ends,
        },
      ),
    );
    const out =
      await gateCommunityContent(
        {
          communityId:
            'c1',
          userId:
            'u1',
          target:
            'comment',
          content:
            'hi',
          postKind:
            'text' as never,
        },
      );
    expect(
      out,
    ).toMatchObject(
      {
        kind: 'deny',
        status: 403,
        code: 'community_timed_out',
        endsAt:
          ends.toISOString(),
      },
    );
    h.rows[0]!.kind =
      'ban';
    const out2 =
      await gateCommunityContent(
        {
          communityId:
            'c1',
          userId:
            'u1',
          target:
            'post',
          content:
            'hi',
          postKind:
            'text' as never,
        },
      );
    expect(
      out2,
    ).toMatchObject(
      {
        kind: 'deny',
        code: 'community_banned',
      },
    );
    expect(
      JSON.stringify(
        out2,
      ),
    ).not.toContain(
      'private note',
    );
  });
});

describe('sanction', () => {
  const base =
    {
      community,
      actorId:
        'mod1',
      actorRole:
        'MOD' as const,
      targetUserId:
        'u1',
    };

  it('bans: removes the member in the same transaction, after the lock', async () => {
    const res =
      await sanction(
        {
          ...base,
          kind: 'ban',
          duration:
            '7d',
          reason:
            'secret',
        },
      );
    expect(
      res.ok,
    ).toBe(
      true,
    );
    expect(
      h
        .calls[0],
    ).toBe(
      'lock:community-ban:c1:u1',
    );
    expect(
      h.calls.indexOf(
        'lock:community-ban:c1:u1',
      ),
    ).toBeLessThan(
      h.calls.indexOf(
        'ban.create',
      ),
    );
    for (const c of [
      'member.delete',
      'community.update',
      'markRemoved',
      'event:removed',
      'log:member_banned',
    ]) {
      expect(
        h.calls,
      ).toContain(
        c,
      );
    }
  });

  it('a timeout keeps the membership', async () => {
    const res =
      await sanction(
        {
          ...base,
          kind: 'timeout',
          duration:
            '1h',
        },
      );
    expect(
      res.ok,
    ).toBe(
      true,
    );
    expect(
      h.calls,
    ).not.toContain(
      'member.delete',
    );
    expect(
      h.calls,
    ).toContain(
      'log:member_timed_out',
    );
  });

  it('a replacement marks the old row lifted before inserting the new one', async () => {
    const old =
      row(
        {
          endsAt:
            null,
        },
      );
    h.rows.push(
      old,
    );
    await sanction(
      {
        ...base,
        kind: 'ban',
        duration:
          '30d',
      },
    );
    expect(
      h.calls.indexOf(
        'ban.updateMany',
      ),
    ).toBeLessThan(
      h.calls.indexOf(
        'ban.create',
      ),
    );
    expect(
      old.liftedAt,
    ).toBeInstanceOf(
      Date,
    );
    expect(
      old.liftedById,
    ).toBe(
      'mod1',
    );
    expect(
      h.rows.filter(
        (
          r,
        ) =>
          !r.liftedAt,
      ),
    ).toHaveLength(
      1,
    );
  });

  it('a mod cannot sanction a mod or admin; the owner can sanction a mod', async () => {
    h.member =
      {
        id: 'm2',
        role: 'MOD',
      };
    expect(
      await sanction(
        {
          ...base,
          kind: 'ban',
          duration:
            '1d',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
    expect(
      await sanction(
        {
          ...base,
          actorRole:
            'ADMIN',
          actorId:
            'owner',
          kind: 'ban',
          duration:
            '1d',
        },
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
    h.member =
      {
        id: 'm3',
        role: 'ADMIN',
      };
    expect(
      await sanction(
        {
          ...base,
          kind: 'timeout',
          duration:
            '1d',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
  });

  it('nobody sanctions the creator or themselves (400); a plain member cannot sanction', async () => {
    expect(
      await sanction(
        {
          ...base,
          targetUserId:
            'owner',
          actorRole:
            'ADMIN',
          kind: 'ban',
          duration:
            '1d',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      await sanction(
        {
          ...base,
          targetUserId:
            'mod1',
          kind: 'ban',
          duration:
            '1d',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      await sanction(
        {
          ...base,
          actorRole:
            'MEMBER',
          kind: 'ban',
          duration:
            '1d',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
    expect(
      h.calls,
    ).not.toContain(
      'ban.create',
    );
  });

  it('the notification names kind, end and rule but never the private reason', async () => {
    h.rule =
      {
        id: 'rule1',
        position: 2,
        title:
          'Be kind',
      };
    await sanction(
      {
        ...base,
        kind: 'timeout',
        duration:
          '1d',
        ruleId:
          'rule1',
        reason:
          'secret grudge',
      },
    );
    expect(
      h.notifications,
    ).toHaveLength(
      1,
    );
    const n =
      h
        .notifications[0]!;
    expect(
      n.entityType,
    ).toBe(
      'community_ban',
    );
    expect(
      n.preview,
    ).toContain(
      'timed out',
    );
    expect(
      n.preview,
    ).toContain(
      'Be kind',
    );
    expect(
      n.preview,
    ).not.toContain(
      'secret grudge',
    );
    expect(
      h
        .logged[0],
    ).toMatchObject(
      {
        action:
          'member_timed_out',
        reason:
          'secret grudge',
      },
    );
  });

  it('lifting early takes effect at once, logs and notifies', async () => {
    const live =
      row(
        {
          endsAt:
            null,
        },
      );
    h.rows.push(
      live,
    );
    const res =
      await lift(
        {
          community,
          banId:
            live.id,
          actorId:
            'mod1',
        },
      );
    expect(
      res.ok,
    ).toBe(
      true,
    );
    expect(
      await activeSanction(
        'c1',
        'u1',
      ),
    ).toBeNull();
    expect(
      h.calls,
    ).toContain(
      'log:ban_lifted',
    );
    expect(
      h
        .notifications[0]!
        .preview,
    ).toContain(
      'lifted',
    );
    expect(
      await lift(
        {
          community,
          banId:
            live.id,
          actorId:
            'mod1',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
  });
});

describe('my-standing', () => {
  it('returns the kind and end only: the module never reads the reason', async () => {
    const src =
      (
        await import('node:fs')
      ).readFileSync(
        'lib/communities/api/communities.$slug.my-standing.server.ts',
        'utf8',
      );
    expect(
      src,
    ).not.toMatch(
      /reason|createdById|liftedById/,
    );
    expect(
      src,
    ).toContain(
      'activeSanction',
    );
  });
});
