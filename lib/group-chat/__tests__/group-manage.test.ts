import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Managing a group chat (s04-10) against an in-memory database whose advisory lock really serialises the
 * transactions that take it, and whose every read yields first, so a missing lock shows up as a broken cap.
 */

interface Member {
  id: string;
  chatId: string;
  userId: string;
  joinedAt: Date;
}
interface Chat {
  id: string;
  kind: string;
  name: string | null;
  ownerId: string | null;
}
interface UserRow {
  id: string;
  name: string | null;
  handle: string | null;
  bannedUntil: Date | null;
}

const h = vi.hoisted(() => {
  const state = {
    chats: [] as Chat[],
    members: [] as Member[],
    users: [] as UserRow[],
    blocks: [] as {
      blockerId: string;
      blockedId: string;
    }[],
    lockOrder: [] as string[],
    seq: 0,
  };
  const locks = new Map<string, Promise<void>>();
  const yieldTurn = () => new Promise<void>((r) => setImmediate(r));
  const post = vi.fn(async (_a: unknown, _actor: string, _line: unknown) => ({}));
  const publish = vi.fn();
  const dispatch = vi.fn(async (_n: unknown) => {});
  return {
    state,
    locks,
    yieldTurn,
    post,
    publish,
    dispatch,
  };
});

function makeTx(release: Array<() => void>, log: string[]) {
  const { state, locks, yieldTurn } = h;
  const y = async <T>(v: T): Promise<T> => {
    await yieldTurn();
    return v;
  };
  const pick = <T extends object>(row: T | undefined, select?: Record<string, unknown>) => {
    if (!row) return null;
    if (!select) return row;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(select)) out[k] = (row as Record<string, unknown>)[k];
    return out;
  };
  const userFor = (
    id: string,
    select:
      | {
          user?: unknown;
        }
      | undefined,
  ) => {
    if (!select?.user) return {};
    const u = state.users.find((x) => x.id === id);
    return {
      user: u
        ? {
            name: u.name,
            handle: u.handle,
          }
        : null,
    };
  };
  return {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      log.push(`lock:${key}`);
      state.lockOrder.push(`lock:${key}`);
      const prev = locks.get(key) ?? Promise.resolve();
      let done!: () => void;
      locks.set(key, new Promise<void>((r) => (done = r)));
      release.push(done);
      await prev;
    },
    chat: {
      findFirst: async ({
        where,
        select,
      }: {
        where: {
          id: string;
          kind: string;
        };
        select: Record<string, unknown>;
      }) => {
        state.lockOrder.push('read:chat');
        return y(
          pick(
            state.chats.find((c) => c.id === where.id && c.kind === where.kind),
            select,
          ),
        );
      },
      update: async ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: Partial<Chat>;
      }) => {
        const c = state.chats.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return y(c);
      },
      delete: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        state.chats = state.chats.filter((c) => c.id !== where.id);
        state.members = state.members.filter((m) => m.chatId !== where.id);
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
        select?: {
          user?: unknown;
        };
      }) => {
        const { chatId, userId } = where.chatId_userId;
        const m = state.members.find((x) => x.chatId === chatId && x.userId === userId);
        return y(
          m
            ? {
                id: m.id,
                ...userFor(userId, select),
              }
            : null,
        );
      },
      findMany: async ({
        where,
      }: {
        where: {
          chatId?: string;
          userId?: string;
        };
      }) =>
        y(
          state.members
            .filter(
              (m) =>
                (where.chatId ? m.chatId === where.chatId : true) && (where.userId ? m.userId === where.userId : true),
            )
            .map((m) => ({
              ...m,
            })),
        ),
      findFirst: async ({
        where,
      }: {
        where: {
          chatId: string;
          userId?: string;
        };
      }) =>
        y(state.members.find((m) => m.chatId === where.chatId && (!where.userId || m.userId === where.userId)) ?? null),
      createMany: async ({
        data,
      }: {
        data: {
          chatId: string;
          userId: string;
        }[];
      }) => {
        for (const d of data) {
          if (!state.members.some((m) => m.chatId === d.chatId && m.userId === d.userId)) {
            state.members.push({
              id: `m${++state.seq}`,
              ...d,
              joinedAt: new Date(2026, 0, 1, 0, 0, state.seq),
            });
          }
        }
        return y({
          count: data.length,
        });
      },
      delete: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        state.members = state.members.filter((m) => m.id !== where.id);
        return y({});
      },
    },
    user: {
      findMany: async ({
        where,
      }: {
        where: {
          OR: Record<string, string>[];
        };
      }) => {
        const wanted = where.OR;
        return y(
          state.users.filter((u) =>
            wanted.some((w) => ('id' in w && w.id === u.id) || ('handle' in w && w.handle === u.handle)),
          ),
        );
      },
      findUnique: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => y(state.users.find((u) => u.id === where.id) ?? null),
    },
    // s06-09: removal records and invite links; this suite does not look at them (group-invites.test.ts does).
    chatRemoval: {
      deleteMany: async () => y({ count: 0 }),
      upsert: async () => y({}),
    },
    chatInvite: {
      updateMany: async () => y({ count: 0 }),
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
        const adder = mine.blockerId;
        const ids = mine.blockedId.in;
        return y(
          state.blocks.filter(
            (b) =>
              (b.blockerId === adder && ids.includes(b.blockedId)) ||
              (b.blockedId === adder && ids.includes(b.blockerId)),
          ),
        );
      },
    },
  };
}

vi.mock('@/lib/prisma.server', () => {
  const { state } = h;
  return {
    prisma: new Proxy(
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
          const release: Array<() => void> = [];
          const tx = makeTx(release, []);
          try {
            return await fn(tx);
          } finally {
            for (const r of release) r();
          }
        },
        chatMember: makeTx([], []).chatMember,
        user: makeTx([], []).user,
        userBlock: makeTx([], []).userBlock,
        _state: state,
      },
      {
        get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : undefined),
      },
    ),
  };
});
vi.mock('@/lib/chat-plus/access.server', () => ({
  getChatAccess: async (_kind: string, id: string, userId: string) =>
    h.state.members.some((m) => m.chatId === id && m.userId === userId)
      ? {
          id,
          kind: 'group',
          viewerId: userId,
        }
      : null,
  publishChatUpdate: (_a: unknown, u: unknown) => h.publish(u),
}));
vi.mock('@/lib/chat-plus/post.server', () => ({
  postSystemLine: h.post,
}));
vi.mock('@/lib/notify/dispatch.server', () => ({
  dispatch: h.dispatch,
}));

import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import {
  addMembers,
  leaveAllGroups,
  leaveGroup,
  refusedForGroup,
  removeMember,
  renameGroup,
  transferOwnership,
} from '@/lib/group-chat/manage.server';
import { findGroupMembership } from '@/lib/chat/chat.server';

const G = 'g1';

function seed(opts: {
  members: string[];
  owner?: string;
  users?: Partial<UserRow>[];
  blocks?: {
    blockerId: string;
    blockedId: string;
  }[];
}) {
  const s = h.state;
  s.chats = [
    {
      id: G,
      kind: 'group',
      name: 'Raid',
      ownerId: opts.owner ?? opts.members[0]!,
    },
  ];
  s.members = opts.members.map((userId, i) => ({
    id: `m${i}`,
    chatId: G,
    userId,
    joinedAt: new Date(2026, 0, 1, 0, 0, i),
  }));
  s.seq = 1000;
  const ids = new Set([...opts.members, ...(opts.users ?? []).map((u) => u.id!)]);
  s.users = [...ids].map((id) => ({
    id,
    name: id.toUpperCase(),
    handle: id,
    bannedUntil: null,
    ...(opts.users ?? []).find((u) => u.id === id),
  }));
  s.blocks = opts.blocks ?? [];
  s.lockOrder = [];
}

const ownerOf = () => h.state.chats.find((c) => c.id === G)?.ownerId;
const memberIds = () => h.state.members.filter((m) => m.chatId === G).map((m) => m.userId);
const lines = () =>
  h.post.mock.calls.map(
    (c) =>
      c[2] as {
        action: string;
      },
  );

beforeEach(() => {
  h.post.mockClear();
  h.publish.mockClear();
  h.dispatch.mockClear();
  seed({
    members: ['owner', 'bo', 'cy'],
  });
});

describe('only the owner changes a group', () => {
  it('refuses rename, add, remove and transfer from an ordinary member, and says nothing exists to a stranger', async () => {
    seed({
      members: ['owner', 'bo', 'cy'],
      users: [
        {
          id: 'new',
        },
        {
          id: 'stranger',
        },
      ],
    });
    expect(await renameGroup('bo', G, 'Mine')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await addMembers('bo', G, ['new'])).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await removeMember('bo', G, 'cy')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await transferOwnership('bo', G, 'bo')).toMatchObject({
      ok: false,
    });
    expect(await transferOwnership('bo', G, 'cy')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await renameGroup('stranger', G, 'Mine')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await removeMember('stranger', G, 'bo')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await renameGroup('owner', 'nope', 'x')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(h.state.chats[0]).toMatchObject({
      name: 'Raid',
      ownerId: 'owner',
    });
    expect(memberIds()).toEqual(['owner', 'bo', 'cy']);
    expect(h.post).not.toHaveBeenCalled();
  });

  it('the owner renames, and the rename is a line and a realtime update', async () => {
    const r = await renameGroup('owner', G, '  Raid night ');
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Raid night',
      },
    });
    expect(h.state.chats[0]!.name).toBe('Raid night');
    expect(lines()).toEqual([
      {
        action: 'rename',
        actorId: 'owner',
        name: 'Raid night',
      },
    ]);
    expect(h.publish).toHaveBeenCalledWith({
      kind: 'group',
      chatId: G,
      op: 'group',
      change: 'rename',
    });
  });

  it('renaming to the same name posts nothing', async () => {
    expect(await renameGroup('owner', G, 'Raid')).toEqual({
      ok: true,
      value: {
        name: 'Raid',
      },
    });
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe('adding people', () => {
  it('adds, posts a line per person and notifies only those added', async () => {
    seed({
      members: ['owner', 'bo'],
      users: [
        {
          id: 'dee',
          name: 'Dee',
        },
        {
          id: 'eli',
          name: 'Eli',
        },
      ],
    });
    const r = await addMembers('owner', G, ['dee', '@eli']);
    expect(r).toEqual({
      ok: true,
      value: {
        added: 2,
        refused: 0,
      },
    });
    expect(memberIds()).toEqual(['owner', 'bo', 'dee', 'eli']);
    expect(lines().map((l) => l.action)).toEqual(['add', 'add']);
    expect(lines()[0]).toMatchObject({
      targetId: 'dee',
      targetName: 'Dee',
    });
    expect(
      h.dispatch.mock.calls.map(
        (c) =>
          (
            c[0] as {
              userId: string;
            }
          ).userId,
      ),
    ).toEqual(['dee', 'eli']);
    expect(h.dispatch.mock.calls[0]![0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'group_chat',
      entityId: G,
      link: `/groups/${G}`,
      preview: expect.objectContaining({ fallback: 'OWNER added you to Raid' }),
    });
  });

  it('refuses someone who blocked the owner, someone the owner blocked, the banned, the tombstone and the unknown, without a reason', async () => {
    seed({
      members: ['owner'],
      users: [
        {
          id: 'blockedme',
        },
        {
          id: 'iblocked',
        },
        {
          id: 'banned',
          bannedUntil: new Date(Date.now() + 86_400_000),
        },
        {
          id: DELETED_USER_ID,
          bannedUntil: null,
        },
        {
          id: 'fine',
        },
      ],
      blocks: [
        {
          blockerId: 'blockedme',
          blockedId: 'owner',
        },
        {
          blockerId: 'owner',
          blockedId: 'iblocked',
        },
      ],
    });
    const r = await addMembers('owner', G, ['blockedme', 'iblocked', 'banned', DELETED_USER_ID, 'ghost', 'fine']);
    expect(r).toEqual({
      ok: true,
      value: {
        added: 1,
        refused: 5,
      },
    });
    expect(memberIds()).toEqual(['owner', 'fine']);
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r)).not.toMatch(/block|ban|suspend/i);
  });

  it('a person already in the group is neither added nor refused', async () => {
    expect(await addMembers('owner', G, ['bo'])).toEqual({
      ok: true,
      value: {
        added: 0,
        refused: 0,
      },
    });
    expect(h.post).not.toHaveBeenCalled();
  });

  it('holds a group to 51 members, the extra people counted as refused', async () => {
    const full = [
      'owner',
      ...Array.from(
        {
          length: 49,
        },
        (_, i) => `u${i}`,
      ),
    ];
    seed({
      members: full,
      users: [
        {
          id: 'x1',
        },
        {
          id: 'x2',
        },
        {
          id: 'x3',
        },
      ],
    });
    const r = await addMembers('owner', G, ['x1', 'x2', 'x3']);
    expect(r).toEqual({
      ok: true,
      value: {
        added: 1,
        refused: 2,
      },
    });
    expect(memberIds()).toHaveLength(51);
    expect(await addMembers('owner', G, ['x2'])).toEqual({
      ok: true,
      value: {
        added: 0,
        refused: 1,
      },
    });
    expect(memberIds()).toHaveLength(51);
  });

  it('two adds racing for the last seat fill it once, because both take the group lock first', async () => {
    const full = [
      'owner',
      ...Array.from(
        {
          length: 49,
        },
        (_, i) => `u${i}`,
      ),
    ];
    seed({
      members: full,
      users: [
        {
          id: 'x1',
        },
        {
          id: 'x2',
        },
      ],
    });
    const [a, b] = await Promise.all([addMembers('owner', G, ['x1']), addMembers('owner', G, ['x2'])]);
    const added = [a, b].map((r) => (r.ok ? r.value.added : -1));
    expect(added.sort()).toEqual([0, 1]);
    expect(memberIds()).toHaveLength(51);
    expect(h.state.lockOrder.filter((e) => e === `lock:group-members:${G}`)).toHaveLength(2);
  });

  it('takes the lock before it reads the group', async () => {
    await renameGroup('owner', G, 'Next');
    expect(h.state.lockOrder.slice(0, 2)).toEqual([`lock:group-members:${G}`, 'read:chat']);
  });
});

describe('refusedForGroup (also used at creation)', () => {
  it('lets through only people the creator may be in a group with, by id or handle', async () => {
    seed({
      members: ['owner'],
      users: [
        {
          id: 'ok',
          handle: 'okay',
        },
        {
          id: 'nope',
        },
      ],
      blocks: [
        {
          blockerId: 'nope',
          blockedId: 'owner',
        },
      ],
    });
    const r = await refusedForGroup('owner', ['okay', 'nope', 'missing', 'owner']);
    expect(r.allowed.map((u) => u.id)).toEqual(['ok']);
    expect(r.refused).toBe(2);
  });
});

describe('removing a member', () => {
  it('removes them, closes their stream first and posts the line', async () => {
    const r = await removeMember('owner', G, 'bo');
    expect(r).toEqual({
      ok: true,
      value: null,
    });
    expect(memberIds()).toEqual(['owner', 'cy']);
    expect(h.publish.mock.calls[0]![0]).toEqual({
      kind: 'group',
      chatId: G,
      op: 'group',
      change: 'removed',
      userId: 'bo',
    });
    expect(lines()).toEqual([
      {
        action: 'remove',
        actorId: 'owner',
        targetId: 'bo',
        targetName: 'BO',
      },
    ]);
    // the removed member is told nothing
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('a removed member can no longer read the group (membership is the access check)', async () => {
    expect(
      await findGroupMembership(G, 'bo', {
        id: true,
      }),
    ).not.toBeNull();
    await removeMember('owner', G, 'bo');
    expect(
      await findGroupMembership(G, 'bo', {
        id: true,
      }),
    ).toBeNull();
  });

  it('cannot remove yourself (leave instead) or someone who is not in it', async () => {
    expect(await removeMember('owner', G, 'owner')).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await removeMember('owner', G, 'stranger')).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe('transferring ownership', () => {
  it('leaves exactly one owner and turns the old owner into a member', async () => {
    expect(await transferOwnership('owner', G, 'cy')).toEqual({
      ok: true,
      value: null,
    });
    expect(ownerOf()).toBe('cy');
    expect(memberIds()).toEqual(['owner', 'bo', 'cy']);
    expect(lines()).toEqual([
      {
        action: 'owner',
        actorId: 'owner',
        targetId: 'cy',
        targetName: 'CY',
      },
    ]);
    // the old owner can no longer change the group
    expect(await renameGroup('owner', G, 'Again')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await renameGroup('cy', G, 'Again')).toMatchObject({
      ok: true,
    });
  });

  it('only to a member, and not to yourself', async () => {
    expect(await transferOwnership('owner', G, 'stranger')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await transferOwnership('owner', G, 'owner')).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(ownerOf()).toBe('owner');
  });

  it('a transfer racing a removal cannot leave two owners or none: the loser re-reads the owner', async () => {
    const [t, r] = await Promise.all([transferOwnership('owner', G, 'bo'), removeMember('owner', G, 'bo')]);
    const owner = ownerOf();
    expect(memberIds()).toContain(owner);
    if (t.ok) {
      // the transfer won: the old owner's removal is refused
      expect(r).toMatchObject({
        ok: false,
        status: 403,
      });
      expect(owner).toBe('bo');
    } else {
      // the removal won: there is nobody to transfer to
      expect(t).toMatchObject({
        ok: false,
        status: 404,
      });
      expect(r.ok).toBe(true);
      expect(owner).toBe('owner');
    }
  });
});

describe('leaving', () => {
  it('an ordinary member leaving changes nothing else', async () => {
    expect(await leaveGroup('bo', G)).toEqual({
      ok: true,
      value: {
        disbanded: false,
        newOwnerId: null,
      },
    });
    expect(ownerOf()).toBe('owner');
    expect(memberIds()).toEqual(['owner', 'cy']);
  });

  it('the owner leaving passes the group to the longest-standing member and says so', async () => {
    expect(await leaveGroup('owner', G)).toEqual({
      ok: true,
      value: {
        disbanded: false,
        newOwnerId: 'bo',
      },
    });
    expect(ownerOf()).toBe('bo');
    expect(lines()).toEqual([
      {
        action: 'owner',
        actorId: 'bo',
        targetId: 'bo',
        targetName: 'BO',
      },
    ]);
  });

  it('the last one out deletes the group', async () => {
    seed({
      members: ['owner'],
    });
    expect(await leaveGroup('owner', G)).toEqual({
      ok: true,
      value: {
        disbanded: true,
        newOwnerId: null,
      },
    });
    expect(h.state.chats).toEqual([]);
  });

  it('a non-member cannot leave', async () => {
    expect(await leaveGroup('stranger', G)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await leaveGroup('bo', 'nope')).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('leaveAllGroups leaves every group the member is in', async () => {
    await leaveAllGroups('owner');
    expect(ownerOf()).toBe('bo');
    expect(memberIds()).toEqual(['bo', 'cy']);
    await leaveAllGroups('owner');
    expect(memberIds()).toEqual(['bo', 'cy']);
  });
});
