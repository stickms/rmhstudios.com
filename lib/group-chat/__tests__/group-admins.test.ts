import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Group chat admins (s07-04) against an in-memory database whose advisory lock really serialises the transactions
 * that take it and whose every read yields first, so a role read made outside the lock shows up as a wrong answer.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const s = {
    chats: [] as Row[],
    members: [] as Row[],
    users: [] as Row[],
    invites: [] as Row[],
    removals: [] as {
      chatId: string;
      userId: string;
    }[],
    seq: 0,
  };
  return {
    s,
    locks: new Map<string, Promise<void>>(),
    lines: [] as {
      actor: string;
      line: Row;
    }[],
    yieldTurn: () => new Promise<void>((r) => setImmediate(r)),
  };
});

function makeDb(release: Array<() => void>) {
  const { s, locks } = h;
  const y = async <T>(v: T): Promise<T> => {
    await h.yieldTurn();
    return v;
  };
  const user = (id: string) => s.users.find((u) => u.id === id) ?? null;
  const memberKey = (w: {
    chatId_userId: {
      chatId: string;
      userId: string;
    };
  }) => s.members.find((m) => m.chatId === w.chatId_userId.chatId && m.userId === w.chatId_userId.userId);
  return {
    $executeRaw: async (_t: TemplateStringsArray, key: string) => {
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
        Object.assign(
          s.chats.find((c) => c.id === where.id)!,
          data,
        );
        return y({});
      },
      delete: async ({ where }: { where: Row }) => {
        s.chats = s.chats.filter((c) => c.id !== where.id);
        s.members = s.members.filter((m) => m.chatId !== where.id);
        return y({});
      },
    },
    chatMember: {
      findUnique: async ({
        where,
        select,
      }: {
        where: {
          chatId_userId: {
            chatId: string;
            userId: string;
          };
        };
        select?: Row;
      }) => {
        const m = memberKey(where);
        if (!m) return y(null);
        return y({
          id: m.id,
          role: m.role,
          ...(select?.user
            ? {
                user: user(m.userId as string),
              }
            : {}),
        });
      },
      findMany: async ({ where }: { where: Row }) =>
        y(
          s.members
            .filter(
              (m) =>
                (where.chatId === undefined || m.chatId === where.chatId) &&
                (where.userId === undefined || m.userId === where.userId),
            )
            .map((m) => ({
              ...m,
            })),
        ),
      findFirst: async ({ where }: { where: Row }) => y(s.members.find((m) => m.chatId === where.chatId) ?? null),
      count: async ({ where }: { where: Row }) =>
        y(s.members.filter((m) => m.chatId === where.chatId && m.role === where.role).length),
      update: async ({
        where,
        data,
      }: {
        where: {
          chatId_userId: {
            chatId: string;
            userId: string;
          };
        };
        data: Row;
      }) => {
        Object.assign(memberKey(where)!, data);
        return y({});
      },
      create: async ({ data }: { data: Row }) => {
        s.members.push({
          id: `m${++s.seq}`,
          role: 'member',
          joinedAt: new Date(2027, 0, 1, 0, 0, s.seq),
          ...data,
        });
        return y({});
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const d of data)
          s.members.push({
            id: `m${++s.seq}`,
            role: 'member',
            joinedAt: new Date(2027, 0, 1, 0, 0, s.seq),
            ...d,
          });
        return y({
          count: data.length,
        });
      },
      delete: async ({ where }: { where: Row }) => {
        s.members = s.members.filter((m) => m.id !== where.id);
        return y({});
      },
    },
    chatInvite: {
      findMany: async ({ where }: { where: Row }) =>
        y(
          s.invites
            .filter((i) => i.chatId === where.chatId && (where.revokedAt !== null || !i.revokedAt))
            .map((i) => ({
              ...i,
              createdBy: user(i.createdById as string),
            })),
        ),
      findUnique: async ({
        where,
      }: {
        where: {
          code: string;
        };
      }) => y(s.invites.find((i) => i.code === where.code) ?? null),
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
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hits = s.invites.filter(
          (i) =>
            (where.id === undefined || i.id === where.id) &&
            (where.chatId === undefined || i.chatId === where.chatId) &&
            (where.createdById === undefined || i.createdById === where.createdById) &&
            !i.revokedAt,
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
      deleteMany: async () =>
        y({
          count: 0,
        }),
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
      }) => y(user(where.id)),
    },
    userBlock: {
      findMany: async () => y([]),
      findFirst: async () => y(null),
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
  postSystemLine: async (_a: unknown, actor: string, line: Row) => {
    h.lines.push({
      actor,
      line,
    });
    return {};
  },
}));
vi.mock('@/lib/notify/dispatch.server', () => ({
  dispatch: vi.fn(async () => {}),
}));
vi.mock('@/lib/social/follow-list-privacy.server', () => ({
  canSeeFollowLists: async () => true,
}));
vi.mock('@/lib/rate-limit.server', () => ({
  checkRateLimit: async () => ({
    allowed: true,
  }),
  getClientIp: () => '1.1.1.1',
}));

import { createInvite, joinByInvite, listInvites, revokeInvite } from '@/lib/group-chat/invites.server';
import {
  addMembers,
  leaveAllGroups,
  leaveGroup,
  removeMember,
  renameGroup,
  transferOwnership,
} from '@/lib/group-chat/manage.server';
import { setAdmin } from '@/lib/group-chat/roles.server';
import { serializeGroupMembers } from '@/lib/group-chat/serialize.server';

const CHAT = 'c1';

/** Joined in the order given; roles by id. */
function seed(members: string[], admins: string[], extra: string[] = []) {
  const s = h.s;
  s.chats = [
    {
      id: CHAT,
      kind: 'group',
      name: 'Study group',
      ownerId: 'o',
    },
  ];
  s.users = [...members, ...extra].map((id) => ({
    id,
    name: id,
    handle: id,
    bannedUntil: null,
  }));
  s.members = members.map((id, i) => ({
    id: `seed${i}`,
    chatId: CHAT,
    userId: id,
    role: admins.includes(id) ? 'admin' : 'member',
    joinedAt: new Date(2026, 0, i + 1),
  }));
  s.invites = [];
  s.removals = [];
  h.locks.clear();
  h.lines.length = 0;
}

const roleOf = (id: string) => h.s.members.find((m) => m.userId === id)?.role;
const owner = () => h.s.chats[0]!.ownerId;
const memberIds = () => h.s.members.map((m) => m.userId);
const link = async (who: string) => {
  const r = await createInvite(who, CHAT, {
    expiresInDays: 7,
    maxUses: 10,
  });
  if (!r.ok) throw new Error('create failed');
  return r.value;
};

beforeEach(() => seed(['o', 'a1', 'a2', 'm1', 'm2'], ['a1', 'a2'], ['x1', 'x2']));

describe('making and unmaking admins', () => {
  it('the owner makes and unmakes an admin, each with a system line naming the target', async () => {
    expect(await setAdmin(CHAT, 'o', 'm1', true)).toEqual({
      ok: true,
      admin: true,
      changed: true,
    });
    expect(roleOf('m1')).toBe('admin');
    expect(h.lines.at(-1)).toMatchObject({
      actor: 'o',
      line: {
        action: 'admin-added',
        actorId: 'o',
        targetId: 'm1',
        targetName: 'm1',
      },
    });
    expect(await setAdmin(CHAT, 'o', 'm1', false)).toMatchObject({
      ok: true,
      admin: false,
      changed: true,
    });
    expect(roleOf('m1')).toBe('member');
    expect(h.lines.at(-1)?.line).toMatchObject({
      action: 'admin-removed',
      targetId: 'm1',
    });
  });

  it('is idempotent: no change, no line', async () => {
    h.lines.length = 0;
    expect(await setAdmin(CHAT, 'o', 'a1', true)).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(await setAdmin(CHAT, 'o', 'm1', false)).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(h.lines).toHaveLength(0);
  });

  it('refuses a sixth admin with 409 ADMIN_LIMIT, and a freed seat takes one again', async () => {
    seed(['o', 'a1', 'a2', 'a3', 'a4', 'a5', 'm1'], ['a1', 'a2', 'a3', 'a4', 'a5']);
    expect(await setAdmin(CHAT, 'o', 'm1', true)).toMatchObject({
      ok: false,
      status: 409,
      code: 'ADMIN_LIMIT',
    });
    expect(roleOf('m1')).toBe('member');
    await setAdmin(CHAT, 'o', 'a5', false);
    expect(await setAdmin(CHAT, 'o', 'm1', true)).toMatchObject({
      ok: true,
    });
  });

  it('counts the cap under the lock: two promotions racing for the last seat make one admin', async () => {
    seed(['o', 'a1', 'a2', 'a3', 'a4', 'm1', 'm2'], ['a1', 'a2', 'a3', 'a4']);
    const [r1, r2] = await Promise.all([setAdmin(CHAT, 'o', 'm1', true), setAdmin(CHAT, 'o', 'm2', true)]);
    expect([r1.ok, r2.ok].sort()).toEqual([false, true]);
    expect(h.s.members.filter((m) => m.role === 'admin')).toHaveLength(5);
  });

  it('an admin cannot set any role, their own included; a stranger is told nothing exists', async () => {
    expect(await setAdmin(CHAT, 'a1', 'm1', true)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await setAdmin(CHAT, 'a1', 'a1', true)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await setAdmin(CHAT, 'a1', 'a2', false)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await setAdmin(CHAT, 'm1', 'm2', true)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await setAdmin(CHAT, 'x1', 'm2', true)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(roleOf('a2')).toBe('admin');
    expect(roleOf('m1')).toBe('member');
  });

  it('a target who is not a member is 404, and the owner is never an admin row', async () => {
    expect(await setAdmin(CHAT, 'o', 'x1', true)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await setAdmin(CHAT, 'o', 'o', true)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(roleOf('o')).toBe('member');
  });

  it('demotion revokes the live links the admin made, says how many, and leaves the owner’s alone', async () => {
    await link('a1');
    await link('a1');
    const owners = await link('o');
    await setAdmin(CHAT, 'o', 'a1', false);
    const live = h.s.invites.filter((i) => !i.revokedAt);
    expect(live.map((i) => i.id)).toEqual([owners.id]);
    expect(h.lines.at(-1)?.line).toMatchObject({
      action: 'admin-removed',
      revokedLinks: 2,
    });
  });
});

describe('what an admin may do', () => {
  it('adds a member, removes a member, renames, and creates, lists and revokes links', async () => {
    expect(await addMembers('a1', CHAT, ['x1'])).toMatchObject({
      ok: true,
      value: {
        added: 1,
      },
    });
    expect(memberIds()).toContain('x1');
    expect(await removeMember('a1', CHAT, 'm1')).toMatchObject({
      ok: true,
    });
    expect(memberIds()).not.toContain('m1');
    expect(await renameGroup('a1', CHAT, 'New name')).toMatchObject({
      ok: true,
    });
    expect(h.s.chats[0]!.name).toBe('New name');
    const mine = await link('a1');
    const owners = await link('o');
    const listed = await listInvites('a1', CHAT);
    expect(listed.ok && listed.value.map((r) => r.createdByName).sort()).toEqual(['a1', 'o']);
    // any admin or the owner may revoke any link
    expect(await revokeInvite('a2', CHAT, owners.id)).toMatchObject({
      ok: true,
    });
    expect(await revokeInvite('o', CHAT, mine.id)).toMatchObject({
      ok: true,
    });
    expect(h.s.invites.every((i) => i.revokedAt)).toBe(true);
  });

  it('members see none of it', async () => {
    expect(await addMembers('m1', CHAT, ['x1'])).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await removeMember('m1', CHAT, 'm2')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await renameGroup('m1', CHAT, 'Nope')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(
      await createInvite('m1', CHAT, {
        expiresInDays: 7,
        maxUses: 5,
      }),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await listInvites('m1', CHAT)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await revokeInvite('m1', CHAT, 'i1')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await addMembers('x1', CHAT, ['x2'])).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('cannot remove the owner or another admin, and cannot transfer', async () => {
    expect(await removeMember('a1', CHAT, 'o')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await removeMember('a1', CHAT, 'a2')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await transferOwnership('a1', CHAT, 'a2')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(memberIds()).toEqual(['o', 'a1', 'a2', 'm1', 'm2']);
    expect(owner()).toBe('o');
  });

  it('the owner removes an admin: the row goes with its role, their links are revoked, the removal is recorded', async () => {
    await link('a2');
    expect(await removeMember('o', CHAT, 'a2')).toMatchObject({
      ok: true,
    });
    expect(memberIds()).not.toContain('a2');
    expect(h.s.invites.every((i) => i.revokedAt)).toBe(true);
    expect(h.s.removals).toContainEqual({
      chatId: CHAT,
      userId: 'a2',
    });
  });

  it('a member an admin removed is refused through a live link; another person is not', async () => {
    const owners = await link('o');
    await removeMember('a1', CHAT, 'm1');
    expect(h.s.removals).toContainEqual({
      chatId: CHAT,
      userId: 'm1',
    });
    expect(await joinByInvite('m1', owners.code)).toEqual({
      ok: false,
    });
    expect(await joinByInvite('x1', owners.code)).toMatchObject({
      ok: true,
      alreadyMember: false,
    });
  });

  it('a demoted admin’s in-flight remove is refused: the role is read inside the lock', async () => {
    const demote = setAdmin(CHAT, 'o', 'a1', false);
    const remove = removeMember('a1', CHAT, 'm1');
    const [d, r] = await Promise.all([demote, remove]);
    expect(d).toMatchObject({
      ok: true,
    });
    expect(r).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(memberIds()).toContain('m1');
  });
});

describe('transfer', () => {
  it('to an admin keeps the old owner as an admin and the admin count unchanged', async () => {
    expect(await transferOwnership('o', CHAT, 'a1')).toMatchObject({
      ok: true,
    });
    expect(owner()).toBe('a1');
    expect(roleOf('a1')).toBe('member');
    expect(roleOf('o')).toBe('admin');
    expect(h.s.members.filter((m) => m.role === 'admin')).toHaveLength(2);
  });

  it('to a member leaves the admin list unchanged and the old owner an ordinary member', async () => {
    await link('o');
    expect(await transferOwnership('o', CHAT, 'm1')).toMatchObject({
      ok: true,
    });
    expect(owner()).toBe('m1');
    expect(roleOf('o')).toBe('member');
    expect(h.s.members.filter((m) => m.role === 'admin').map((m) => m.userId)).toEqual(['a1', 'a2']);
    expect(h.s.invites.every((i) => i.revokedAt)).toBe(true);
  });

  it('re-checks under the lock that the target is still a member', async () => {
    const leave = leaveGroup('m1', CHAT);
    const transfer = transferOwnership('o', CHAT, 'm1');
    const [, t] = await Promise.all([leave, transfer]);
    expect(t).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(owner()).toBe('o');
  });
});

describe('succession', () => {
  it('prefers the earliest-joined admin over an earlier-joined member, and resets the new owner’s role', async () => {
    seed(['o', 'm1', 'a2', 'a1'], ['a1', 'a2']);
    const r = await leaveGroup('o', CHAT);
    expect(r).toMatchObject({
      ok: true,
      value: {
        newOwnerId: 'a2',
      },
    });
    expect(owner()).toBe('a2');
    expect(roleOf('a2')).toBe('member');
    expect(roleOf('a1')).toBe('admin');
  });

  it('with no admins the earliest-joined member inherits, as before', async () => {
    seed(['o', 'm1', 'm2'], []);
    expect(await leaveGroup('o', CHAT)).toMatchObject({
      ok: true,
      value: {
        newOwnerId: 'm1',
      },
    });
  });

  it('reaches account deletion unchanged: leaveAllGroups passes the group to the admin', async () => {
    await leaveAllGroups('o');
    expect(owner()).toBe('a1');
    expect(memberIds()).not.toContain('o');
  });

  it('racing an admin’s leave never picks the leaver', async () => {
    seed(['o', 'a1', 'a2', 'm1'], ['a1', 'a2']);
    await Promise.all([leaveGroup('o', CHAT), leaveGroup('a1', CHAT)]);
    expect(memberIds()).not.toContain('a1');
    expect(memberIds()).toContain(owner() as string);
    expect(owner()).toBe('a2');

    seed(['o', 'a1', 'a2', 'm1'], ['a1', 'a2']);
    await Promise.all([leaveGroup('a1', CHAT), leaveGroup('o', CHAT)]);
    expect(memberIds()).toContain(owner() as string);
    expect(owner()).toBe('a2');
  });

  it('racing a demotion does not hand the group to the demoted member', async () => {
    seed(['o', 'a1', 'a2', 'm1'], ['a1', 'a2']);
    await Promise.all([setAdmin(CHAT, 'o', 'a1', false), leaveGroup('o', CHAT)]);
    expect(owner()).toBe('a2');
  });

  it('an admin who leaves takes their live links with them', async () => {
    await link('a1');
    const owners = await link('o');
    await leaveGroup('a1', CHAT);
    expect(h.s.invites.filter((i) => !i.revokedAt).map((i) => i.id)).toEqual([owners.id]);
  });
});

describe('the payload and the call sites', () => {
  it('serializes each member’s role, anything but admin being member', () => {
    const user = {
      id: 'u1',
      name: 'U',
      handle: 'u',
      image: null,
    };
    const rows = [
      {
        role: 'admin',
        user,
      },
      {
        role: null,
        user,
      },
      {
        user,
      },
    ] as unknown as Parameters<typeof serializeGroupMembers>[0];
    expect(serializeGroupMembers(rows).map((m) => m.role)).toEqual(['admin', 'member', 'member']);
  });

  it('keeps owner-only for transfer and uses the manager check for everything an admin may do', () => {
    const manage = readFileSync('lib/group-chat/manage.server.ts', 'utf8');
    const invites = readFileSync('lib/group-chat/invites.server.ts', 'utf8');
    expect(manage.match(/await refuseUnlessOwner\(/g)).toHaveLength(1);
    expect(manage.match(/await refuseUnlessManager\(/g)).toHaveLength(3);
    expect(invites).not.toMatch(/await refuseUnlessOwner\(/);
    expect(invites.match(/await refuseUnlessManager\(/g)).toHaveLength(3);
  });
});
