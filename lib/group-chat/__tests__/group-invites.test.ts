import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Invite links for group chats (s06-09) against an in-memory database whose advisory lock really serialises the
 * transactions that take it and whose every read yields first, so a missing lock shows up as an overshot link.
 */

interface Row {
  [k: string]: unknown;
}

const h = vi.hoisted(() => {
  const s = {
    chats: [] as Row[],
    members: [] as Row[],
    users: [] as Row[],
    blocks: [] as {
      blockerId: string;
      blockedId: string;
    }[],
    invites: [] as Row[],
    removals: [] as {
      chatId: string;
      userId: string;
    }[],
    seq: 0,
    lockLog: [] as string[],
  };
  const locks = new Map<string, Promise<void>>();
  const yieldTurn = () => new Promise<void>((r) => setImmediate(r));
  return {
    s,
    locks,
    yieldTurn,
    post: vi.fn(async () => ({})),
  };
});

function matchUses(where: Row, r: Row): boolean {
  const u = where.uses;
  if (u === undefined) return true;
  if (typeof u === 'number') return r.uses === u;
  const o = u as {
    lt?: number;
    equals?: number;
  };
  return (o.lt === undefined || (r.uses as number) < o.lt) && (o.equals === undefined || r.uses === o.equals);
}

function makeDb(release: Array<() => void>) {
  const { s, locks, yieldTurn } = h;
  const y = async <T>(v: T): Promise<T> => {
    await yieldTurn();
    return v;
  };
  const userSel = (id: string) => s.users.find((u) => u.id === id) ?? null;
  return {
    $executeRaw: async (_t: TemplateStringsArray, key: string) => {
      s.lockLog.push(key);
      const prev = locks.get(key) ?? Promise.resolve();
      let done!: () => void;
      locks.set(key, new Promise<void>((r) => (done = r)));
      release.push(done);
      await prev;
    },
    chat: {
      findFirst: async ({ where }: { where: Row }) =>
        y(s.chats.find((c) => c.id === where.id && c.kind === where.kind) ?? null),
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const c = s.chats.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return y(c);
      },
      delete: async () => y({}),
    },
    chatMember: {
      findUnique: async ({
        where,
      }: {
        where: {
          chatId_userId: {
            chatId: string;
            userId: string;
          };
        };
      }) => {
        const k = where.chatId_userId;
        const m = s.members.find((x) => x.chatId === k.chatId && x.userId === k.userId);
        return y(
          m
            ? {
                id: m.id,
                role: m.role,
                user: userSel(k.userId),
              }
            : null,
        );
      },
      findMany: async ({ where }: { where: Row }) =>
        y(
          s.members
            .filter((m) => m.chatId === where.chatId)
            .map((m) => ({
              ...m,
            })),
        ),
      findFirst: async ({ where }: { where: Row }) => y(s.members.find((m) => m.chatId === where.chatId) ?? null),
      create: async ({ data }: { data: Row }) => {
        s.members.push({
          id: `m${++s.seq}`,
          joinedAt: new Date(),
          ...data,
        });
        return y({});
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const d of data)
          s.members.push({
            id: `m${++s.seq}`,
            joinedAt: new Date(),
            ...d,
          });
        return y({});
      },
      delete: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        s.members = s.members.filter((m) => m.id !== where.id);
        return y({});
      },
    },
    chatInvite: {
      findMany: async ({ where }: { where: Row }) =>
        y(s.invites.filter((i) => i.chatId === where.chatId && (where.revokedAt === null ? !i.revokedAt : true))),
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: `i${++s.seq}`,
          uses: 0,
          revokedAt: null,
          createdAt: new Date(),
          ...data,
        };
        s.invites.push(row);
        return y(row);
      },
      findUnique: async ({
        where,
      }: {
        where: {
          code: string;
        };
      }) => {
        const i = s.invites.find((x) => x.code === where.code);
        if (!i) return y(null);
        const chat = s.chats.find((c) => c.id === i.chatId)!;
        return y({
          ...i,
          chat: {
            ...chat,
            members: s.members
              .filter((m) => m.chatId === chat.id)
              .map((m) => ({
                userId: m.userId,
                user: userSel(m.userId as string),
              })),
          },
        });
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hits = s.invites.filter(
          (i) =>
            (where.id === undefined || i.id === where.id) &&
            (where.chatId === undefined || i.chatId === where.chatId) &&
            (where.createdById === undefined || i.createdById === where.createdById) &&
            (where.revokedAt !== null || !i.revokedAt) &&
            matchUses(where, i) &&
            (!where.OR ||
              !i.expiresAt ||
              (i.expiresAt as Date).getTime() >
                (
                  where.OR as {
                    expiresAt?: {
                      gt: Date;
                    };
                  }[]
                )[1]!.expiresAt!.gt.getTime()),
        );
        for (const i of hits) {
          if (data.revokedAt) i.revokedAt = data.revokedAt;
          if (data.uses) i.uses = (i.uses as number) + 1;
        }
        return y({
          count: hits.length,
        });
      },
    },
    chatRemoval: {
      findUnique: async ({
        where,
      }: {
        where: {
          chatId_userId: {
            chatId: string;
            userId: string;
          };
        };
      }) =>
        y(
          s.removals.find((r) => r.chatId === where.chatId_userId.chatId && r.userId === where.chatId_userId.userId) ??
            null,
        ),
      upsert: async ({
        create,
      }: {
        create: {
          chatId: string;
          userId: string;
        };
      }) => {
        if (!s.removals.some((r) => r.chatId === create.chatId && r.userId === create.userId)) s.removals.push(create);
        return y({});
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          chatId: string;
          userId: {
            in: string[];
          };
        };
      }) => {
        s.removals = s.removals.filter((r) => !(r.chatId === where.chatId && where.userId.in.includes(r.userId)));
        return y({
          count: 0,
        });
      },
    },
    user: {
      findMany: async ({
        where,
      }: {
        where: {
          OR: {
            id?: string;
            handle?: string;
          }[];
        };
      }) => y(s.users.filter((u) => where.OR.some((o) => o.id === u.id || (o.handle && o.handle === u.handle)))),
      findUnique: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => y(userSel(where.id)),
    },
    userBlock: {
      findMany: async ({
        where,
      }: {
        where: {
          OR: {
            blockerId: unknown;
            blockedId: unknown;
          }[];
        };
      }) => {
        const [mine] = where.OR as [
          {
            blockerId: string;
            blockedId: {
              in: string[];
            };
          },
        ];
        return y(
          s.blocks.filter(
            (b) =>
              (b.blockerId === mine.blockerId && mine.blockedId.in.includes(b.blockedId)) ||
              (b.blockedId === mine.blockerId && mine.blockedId.in.includes(b.blockerId)),
          ),
        );
      },
      findFirst: async ({
        where,
      }: {
        where: {
          OR: {
            blockerId?: unknown;
            blockedId?: unknown;
          }[];
        };
      }) => {
        const [a, b] = where.OR as [
          {
            blockerId: string;
            blockedId: {
              in: string[];
            };
          },
          {
            blockedId: string;
            blockerId: {
              in: string[];
            };
          },
        ];
        return y(
          s.blocks.find(
            (x) =>
              (x.blockerId === a.blockerId && a.blockedId.in.includes(x.blockedId)) ||
              (x.blockedId === b.blockedId && b.blockerId.in.includes(x.blockerId)),
          ) ?? null,
        );
      },
    },
  };
}

vi.mock('@/lib/prisma.server', () => {
  const root = makeDb([]);
  return {
    prisma: {
      ...root,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const release: Array<() => void> = [];
        try {
          return await fn(makeDb(release));
        } finally {
          for (const r of release) r();
        }
      },
    },
  };
});
vi.mock('@/lib/chat-plus/access.server', () => ({
  getChatAccess: async (_k: string, id: string, userId: string) =>
    h.s.members.some((m) => m.chatId === id && m.userId === userId)
      ? {
          chatId: id,
        }
      : null,
  publishChatUpdate: vi.fn(),
}));
vi.mock('@/lib/chat-plus/post.server', () => ({
  postSystemLine: h.post,
}));
vi.mock('@/lib/notify/dispatch.server', () => ({
  dispatch: vi.fn(async () => {}),
}));
const hiddenProfiles = vi.hoisted(() => new Set<string>());
vi.mock('@/lib/social/follow-list-privacy.server', () => ({
  canSeeFollowLists: async (_viewer: string | null, ownerId: string) => !hiddenProfiles.has(ownerId),
}));
vi.mock('@/lib/rate-limit.server', () => ({
  checkRateLimit: async () => ({
    allowed: true,
  }),
  getClientIp: () => '1.1.1.1',
}));

import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { createInvite, joinByInvite, listInvites, previewInvite, revokeInvite } from '@/lib/group-chat/invites.server';
import { addMembers, removeMember, leaveGroup, transferOwnership } from '@/lib/group-chat/manage.server';

const CHAT = 'c1';
const user = (id: string, extra: Row = {}) => ({
  id,
  name: id,
  handle: id,
  bannedUntil: null,
  ...extra,
});

function seed(memberIds: string[], others: string[] = []) {
  const s = h.s;
  s.chats = [
    {
      id: CHAT,
      kind: 'group',
      name: 'Study group',
      ownerId: 'owner',
    },
  ];
  s.users = [...memberIds, ...others].map((id) => user(id));
  s.members = memberIds.map((id, i) => ({
    id: `seed${i}`,
    chatId: CHAT,
    userId: id,
    joinedAt: new Date(2026, 0, i + 1),
  }));
  s.blocks = [];
  s.invites = [];
  s.removals = [];
  s.lockLog = [];
  h.locks.clear();
}

async function mk(maxUses: 1 | 5 | 10 | 25 | null = 10, days: 1 | 7 | 30 | null = 7) {
  const r = await createInvite('owner', CHAT, {
    expiresInDays: days,
    maxUses,
  });
  if (!r.ok) throw new Error('create failed');
  return r.value;
}

beforeEach(() => {
  seed(['owner', 'm1'], ['x1', 'x2', 'x3']);
  h.post.mockClear();
});

describe('who manages links', () => {
  it('only the owner or an admin creates, lists and revokes; a plain member is told no, a stranger that nothing exists', async () => {
    const link = await mk();
    for (const [who, status] of [
      ['m1', 403],
      ['x1', 404],
    ] as const) {
      const c = await createInvite(who, CHAT, {
        expiresInDays: 7,
        maxUses: 5,
      });
      const l = await listInvites(who, CHAT);
      const r = await revokeInvite(who, CHAT, link.id);
      expect([c.ok, l.ok, r.ok]).toEqual([false, false, false]);
      expect([c, l, r].map((x) => (x.ok ? 0 : x.status))).toEqual([status, status, status]);
    }
    expect(h.s.invites).toHaveLength(1);
    expect(h.s.invites[0]!.revokedAt).toBeNull();
  });

  it('an admin creates, lists and revokes, any link including the owner’s; a demoted one is told no', async () => {
    h.s.users.push(user('adm'));
    h.s.members.push({
      id: 'adm1',
      chatId: CHAT,
      userId: 'adm',
      role: 'admin',
      joinedAt: new Date(2026, 0, 9),
    });
    const owners = await mk();
    const made = await createInvite('adm', CHAT, { expiresInDays: 7, maxUses: 5 });
    expect(made).toMatchObject({ ok: true });
    const listed = await listInvites('adm', CHAT);
    expect(listed.ok && listed.value).toHaveLength(2);
    expect(await revokeInvite('adm', CHAT, owners.id)).toMatchObject({ ok: true });
    expect(h.s.invites.find((i) => i.id === owners.id)!.revokedAt).toBeTruthy();
    h.s.members.find((m) => m.userId === 'adm')!.role = 'member';
    expect(await createInvite('adm', CHAT, { expiresInDays: 7, maxUses: 5 })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await listInvites('adm', CHAT)).toMatchObject({ ok: false, status: 403 });
  });

  it('holds a group to five live links, and a revoked one frees a place', async () => {
    const made = [];
    for (let i = 0; i < 5; i++) made.push(await mk());
    const sixth = await createInvite('owner', CHAT, {
      expiresInDays: 7,
      maxUses: 5,
    });
    expect(sixth.ok).toBe(false);
    expect(await revokeInvite('owner', CHAT, made[0]!.id)).toMatchObject({
      ok: true,
    });
    expect(
      await createInvite('owner', CHAT, {
        expiresInDays: 7,
        maxUses: 5,
      }),
    ).toMatchObject({
      ok: true,
    });
    const listed = await listInvites('owner', CHAT);
    expect(listed.ok && listed.value).toHaveLength(5);
  });

  it('does not count expired or used-up links against the five', async () => {
    for (let i = 0; i < 5; i++) await mk();
    for (const i of h.s.invites.slice(0, 2)) i.expiresAt = new Date(Date.now() - 1000);
    expect(
      await createInvite('owner', CHAT, {
        expiresInDays: 7,
        maxUses: 5,
      }),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('joining', () => {
  it('joins, counts the use, records the link and posts the add line', async () => {
    const link = await mk();
    const res = await joinByInvite('x1', link.code);
    expect(res).toEqual({
      ok: true,
      chatId: CHAT,
      alreadyMember: false,
    });
    expect(h.s.invites[0]!.uses).toBe(1);
    expect(h.s.members.find((m) => m.userId === 'x1')!.joinedViaInviteId).toBe(link.id);
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.s.lockLog).toContain(`group-members:${CHAT}`);
  });

  it('refuses expired, revoked, used-up, unknown and malformed links with the same result', async () => {
    const expired = await mk();
    h.s.invites.find((i) => i.id === expired.id)!.expiresAt = new Date(Date.now() - 1);
    const revoked = await mk();
    await revokeInvite('owner', CHAT, revoked.id);
    const once = await mk(1);
    expect(await joinByInvite('x1', once.code)).toMatchObject({
      ok: true,
    });
    const results = [
      await joinByInvite('x2', expired.code),
      await joinByInvite('x2', revoked.code),
      await joinByInvite('x2', once.code),
      await joinByInvite('x2', 'ZZZZZZZZZZ'),
      await joinByInvite('x2', 'short'),
    ];
    for (const r of results)
      expect(r).toEqual({
        ok: false,
      });
    expect(h.s.members.some((m) => m.userId === 'x2')).toBe(false);
  });

  it('refuses when the group is full (51), the same way', async () => {
    seed(
      [
        'owner',
        ...Array.from(
          {
            length: 50,
          },
          (_, i) => `f${i}`,
        ),
      ],
      ['x1'],
    );
    const link = await mk(null, null);
    expect(h.s.members).toHaveLength(51);
    expect(await joinByInvite('x1', link.code)).toEqual({
      ok: false,
    });
    expect(h.s.invites[0]!.uses).toBe(0);
  });

  it('refuses someone in a block with ANY member (either direction), banned people and the tombstone, the same way', async () => {
    const link = await mk();
    h.s.blocks.push(
      {
        blockerId: 'x1',
        blockedId: 'm1',
      },
      {
        blockerId: 'm1',
        blockedId: 'x2',
      },
    );
    h.s.users.push(
      user('banned', {
        bannedUntil: new Date(Date.now() + 1e9),
      }),
      user(DELETED_USER_ID),
    );
    const refused = [
      await joinByInvite('x1', link.code),
      await joinByInvite('x2', link.code),
      await joinByInvite('banned', link.code),
      await joinByInvite(DELETED_USER_ID, link.code),
    ];
    for (const r of refused)
      expect(r).toEqual({
        ok: false,
      });
    expect(await joinByInvite('x3', link.code)).toMatchObject({
      ok: true,
    });
    expect(h.s.invites[0]!.uses).toBe(1);
  });

  it('never exceeds maxUses under concurrent joins: the lock is taken first', async () => {
    const link = await mk(1);
    const [a, b, c] = await Promise.all([
      joinByInvite('x1', link.code),
      joinByInvite('x2', link.code),
      joinByInvite('x3', link.code),
    ]);
    expect([a, b, c].filter((r) => r.ok)).toHaveLength(1);
    expect(h.s.invites[0]!.uses).toBe(1);
    expect(h.s.members.filter((m) => ['x1', 'x2', 'x3'].includes(m.userId as string))).toHaveLength(1);
  });

  it('is a no-op for someone already in the group: no use counted, no line', async () => {
    const link = await mk();
    expect(await joinByInvite('m1', link.code)).toEqual({
      ok: true,
      chatId: CHAT,
      alreadyMember: true,
    });
    expect(h.s.invites[0]!.uses).toBe(0);
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe('removed members and leavers', () => {
  it('a member the owner removed is refused through a live link, and can join after the owner adds them back', async () => {
    const link = await mk();
    expect(await joinByInvite('x1', link.code)).toMatchObject({
      ok: true,
    });
    expect(await removeMember('owner', CHAT, 'x1')).toMatchObject({
      ok: true,
    });
    expect(h.s.removals).toEqual([
      {
        chatId: CHAT,
        userId: 'x1',
      },
    ]);
    expect(await joinByInvite('x1', link.code)).toEqual({
      ok: false,
    });
    expect(await previewInvite(link.code, 'x1')).toEqual({
      state: 'invalid',
    });
    expect(await addMembers('owner', CHAT, ['x1'])).toMatchObject({
      ok: true,
      value: {
        added: 1,
      },
    });
    expect(h.s.removals).toEqual([]);
    expect(await leaveGroup('x1', CHAT)).toMatchObject({
      ok: true,
    });
    expect(await joinByInvite('x1', link.code)).toMatchObject({
      ok: true,
    });
  });

  it('a member who left can rejoin through the link (leaving writes no removal)', async () => {
    const link = await mk();
    expect(await joinByInvite('x2', link.code)).toMatchObject({
      ok: true,
    });
    expect(await leaveGroup('x2', CHAT)).toMatchObject({
      ok: true,
    });
    expect(h.s.removals).toEqual([]);
    expect(await joinByInvite('x2', link.code)).toMatchObject({
      ok: true,
    });
  });
});

describe('revoking and transferring', () => {
  it('revoking stops joins and removes nobody', async () => {
    const link = await mk();
    await joinByInvite('x1', link.code);
    await revokeInvite('owner', CHAT, link.id);
    expect(await joinByInvite('x2', link.code)).toEqual({
      ok: false,
    });
    expect(h.s.members.some((m) => m.userId === 'x1')).toBe(true);
  });

  it('transferring ownership revokes the old owner’s links', async () => {
    const link = await mk();
    expect(await transferOwnership('owner', CHAT, 'm1')).toMatchObject({
      ok: true,
    });
    expect(h.s.invites.find((i) => i.id === link.id)!.revokedAt).toBeInstanceOf(Date);
    expect(await joinByInvite('x1', link.code)).toEqual({
      ok: false,
    });
    const listed = await listInvites('m1', CHAT);
    expect(listed.ok && listed.value).toEqual([]);
  });
});

describe('the preview', () => {
  it('returns no group data for an invalid, revoked or malformed code', async () => {
    const link = await mk();
    await revokeInvite('owner', CHAT, link.id);
    for (const code of [link.code, 'ZZZZZZZZZZ', 'x']) {
      const p = await previewInvite(code, null);
      expect(p).toEqual({
        state: 'invalid',
      });
      expect(JSON.stringify(p)).not.toContain('Study group');
    }
  });

  it('shows a signed-out visitor only the name, and a signed-in one the count and up to five names', async () => {
    const link = await mk();
    expect(await previewInvite(link.code, null)).toEqual({
      state: 'signed-out',
      name: 'Study group',
    });
    expect(await previewInvite(link.code, 'x1')).toEqual({
      state: 'valid',
      name: 'Study group',
      memberCount: 2,
      memberNames: ['owner', 'm1'],
    });
    expect(await previewInvite(link.code, 'm1')).toEqual({
      state: 'member',
      chatId: CHAT,
    });
  });

  it('names only members whose profile privacy lets the viewer see them', async () => {
    const link = await mk();
    hiddenProfiles.add('m1');
    try {
      expect(await previewInvite(link.code, 'x1')).toMatchObject({
        state: 'valid',
        memberCount: 2,
        memberNames: ['owner'],
      });
    } finally {
      hiddenProfiles.clear();
    }
  });

  it('is invalid, not different, for someone the link would refuse', async () => {
    const link = await mk();
    h.s.blocks.push({
      blockerId: 'x1',
      blockedId: 'm1',
    });
    expect(await previewInvite(link.code, 'x1')).toEqual({
      state: 'invalid',
    });
  });
});
