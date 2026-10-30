import { beforeEach, describe, expect, it, vi } from 'vitest';

type Thread = {
  id: string; gameId: string; authorId: string; title: string; body: string;
  createdAt: Date; lastPostAt: Date; replyCount: number; locked: boolean; pinned: boolean;
};
type Post = { id: string; threadId: string; authorId: string; body: string; createdAt: Date };

const db = vi.hoisted(() => ({
  threads: new Map<string, Thread>(),
  posts: new Map<string, Post>(),
  banned: new Map<string, Date>(),
  seq: 0,
}));

const prismaMock = vi.hoisted(() => {
  const m: Record<string, unknown> = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ bannedUntil: db.banned.get(where.id) ?? null }),
    },
    gameThread: {
      count: async ({ where }: { where: { authorId: string; createdAt: { gte: Date } } }) =>
        [...db.threads.values()].filter((t) => t.authorId === where.authorId && t.createdAt >= where.createdAt.gte).length,
      create: async ({ data }: { data: { gameId: string; authorId: string; title: string; body: string } }) => {
        const now = new Date();
        const t: Thread = { id: `T${++db.seq}`, ...data, createdAt: now, lastPostAt: now, replyCount: 0, locked: false, pinned: false };
        db.threads.set(t.id, t);
        return t;
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.threads.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const t = db.threads.get(where.id);
        if (!t) throw new Error('missing');
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as object)) (t as Record<string, unknown>)[k] = (t[k as keyof Thread] as number) + (v as { increment: number }).increment;
          else (t as Record<string, unknown>)[k] = v;
        }
        return t;
      },
      updateMany: async ({ where, data }: { where: { id: string; replyCount?: { gt: number } }; data: { replyCount: { decrement: number } } }) => {
        const t = db.threads.get(where.id);
        if (!t || (where.replyCount && !(t.replyCount > where.replyCount.gt))) return { count: 0 };
        t.replyCount -= data.replyCount.decrement;
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        db.threads.delete(where.id);
        for (const [k, p] of db.posts) if (p.threadId === where.id) db.posts.delete(k);
      },
    },
    gameThreadPost: {
      count: async ({ where }: { where: { authorId: string; createdAt: { gte: Date } } }) =>
        [...db.posts.values()].filter((p) => p.authorId === where.authorId && p.createdAt >= where.createdAt.gte).length,
      create: async ({ data }: { data: { threadId: string; authorId: string; body: string } }) => {
        const p: Post = { id: `P${++db.seq}`, ...data, createdAt: new Date() };
        db.posts.set(p.id, p);
        return p;
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.posts.get(where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => { db.posts.delete(where.id); },
    },
  };
  let chain: Promise<unknown> = Promise.resolve();
  m.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = async () => {
      const threads = new Map([...db.threads].map(([k, v]) => [k, { ...v }]));
      const posts = new Map(db.posts);
      try { return await fn(m); } catch (e) { db.threads = threads; db.posts = posts; throw e; }
    };
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  };
  return m;
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
const reply = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock('@/lib/cards/notify.server', () => ({ notifyHubReply: reply.fn }));

import { createPost, createThread, deletePost, deleteThread, moderateThread, HubError } from '@/lib/games/hub.server';

const code = (p: Promise<unknown>) =>
  p.then(() => null, (e) => (e instanceof HubError ? e.code : `other:${(e as Error).message}`));

beforeEach(() => {
  db.threads.clear(); db.posts.clear(); db.banned.clear(); db.seq = 0;
});

const thread = (over: Partial<Parameters<typeof createThread>[0]> = {}) =>
  createThread({ userId: 'u1', gameId: 'altair', title: 'Best build?', body: 'Thoughts?', ...over });

describe('createThread', () => {
  it('creates a cleaned thread for a tracked title', async () => {
    const { id } = await thread({ title: '  Best   build?  ' });
    expect(db.threads.get(id)).toMatchObject({ title: 'Best   build?', gameId: 'altair', replyCount: 0 });
  });

  it('refuses bad input, an untracked title and a banned account', async () => {
    expect(await code(thread({ title: 'no' }))).toBe('BAD_INPUT');
    expect(await code(thread({ body: '  ' }))).toBe('BAD_INPUT');
    expect(await code(thread({ gameId: 'nope' }))).toBe('NOT_FOUND');
    db.banned.set('u1', new Date(Date.now() + 86_400_000));
    expect(await code(thread())).toBe('BANNED');
    db.banned.set('u1', new Date(Date.now() - 1000));
    expect(await code(thread())).toBeNull();
  });

  it('caps new threads at ten a day per account', async () => {
    for (let i = 0; i < 10; i++) await thread();
    expect(await code(thread())).toBe('RATE_LIMITED');
    expect(await code(thread({ userId: 'u2' }))).toBeNull();
  });
});

describe('createPost', () => {
  it('adds a reply and keeps the counters in step', async () => {
    const { id } = await thread();
    const before = db.threads.get(id)!.lastPostAt;
    await new Promise((r) => setTimeout(r, 5));
    await createPost({ userId: 'u2', threadId: id, body: 'Try the shield' });
    expect(db.threads.get(id)!.replyCount).toBe(1);
    expect(db.threads.get(id)!.lastPostAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('refuses a locked thread, a missing thread, empty text, a banned account', async () => {
    const { id } = await thread();
    await moderateThread({ threadId: id, action: 'lock' });
    expect(await code(createPost({ userId: 'u2', threadId: id, body: 'hi' }))).toBe('LOCKED');
    expect(await code(createPost({ userId: 'u2', threadId: 'zzz', body: 'hi' }))).toBe('NOT_FOUND');
    await moderateThread({ threadId: id, action: 'unlock' });
    expect(await code(createPost({ userId: 'u2', threadId: id, body: ' ' }))).toBe('BAD_INPUT');
    db.banned.set('u2', new Date(Date.now() + 1e6));
    expect(await code(createPost({ userId: 'u2', threadId: id, body: 'hi' }))).toBe('BANNED');
  });

  it('caps replies at thirty an hour per account, and rolls back the counter on failure', async () => {
    const { id } = await thread();
    for (let i = 0; i < 30; i++) await createPost({ userId: 'u2', threadId: id, body: `r${i}` });
    expect(await code(createPost({ userId: 'u2', threadId: id, body: 'one more' }))).toBe('RATE_LIMITED');
    expect(db.threads.get(id)!.replyCount).toBe(30);
    expect(db.posts.size).toBe(30);
  });

  it('concurrent replies all count', async () => {
    const { id } = await thread();
    await Promise.all(['a', 'b', 'c', 'd'].map((u) => createPost({ userId: u, threadId: id, body: 'x' })));
    expect(db.threads.get(id)!.replyCount).toBe(4);
    expect(db.posts.size).toBe(4);
  });
});

describe('deleting', () => {
  it('an author deletes their own thread and its replies go with it', async () => {
    const { id } = await thread();
    await createPost({ userId: 'u2', threadId: id, body: 'hi' });
    await deleteThread({ userId: 'u1', isAdmin: false, threadId: id });
    expect(db.threads.size).toBe(0);
    expect(db.posts.size).toBe(0);
  });

  it('others cannot delete a thread, an admin can', async () => {
    const { id } = await thread();
    expect(await code(deleteThread({ userId: 'u2', isAdmin: false, threadId: id }))).toBe('FORBIDDEN');
    expect(await code(deleteThread({ userId: 'mod', isAdmin: true, threadId: id }))).toBeNull();
  });

  it('deleting a reply lowers the count, only its author or an admin may, and never below zero', async () => {
    const { id } = await thread();
    const p = await createPost({ userId: 'u2', threadId: id, body: 'hi' });
    expect(await code(deletePost({ userId: 'u3', isAdmin: false, postId: p.id }))).toBe('FORBIDDEN');
    await deletePost({ userId: 'u2', isAdmin: false, postId: p.id });
    expect(db.threads.get(id)!.replyCount).toBe(0);
    expect(await code(deletePost({ userId: 'u2', isAdmin: false, postId: p.id }))).toBe('NOT_FOUND');
    const q = await createPost({ userId: 'u2', threadId: id, body: 'again' });
    db.threads.get(id)!.replyCount = 0; // drifted counter
    await deletePost({ userId: 'mod', isAdmin: true, postId: q.id });
    expect(db.threads.get(id)!.replyCount).toBe(0);
  });
});

describe('moderateThread', () => {
  it('pins and unpins', async () => {
    const { id } = await thread();
    await moderateThread({ threadId: id, action: 'pin' });
    expect(db.threads.get(id)!.pinned).toBe(true);
    await moderateThread({ threadId: id, action: 'unpin' });
    expect(db.threads.get(id)!.pinned).toBe(false);
    expect(await code(moderateThread({ threadId: 'zzz', action: 'pin' }))).toBe('NOT_FOUND');
  });
});

describe('reply notification', () => {
  it('tells the thread author about a reply, with a link target, and not on a refused reply', async () => {
    reply.fn.mockClear();
    const { id } = await thread({ title: 'Best build?' });
    await createPost({ userId: 'u2', threadId: id, body: 'Try the shield' });
    expect(reply.fn).toHaveBeenCalledWith({
      threadAuthorId: 'u1',
      replierId: 'u2',
      gameId: 'altair',
      threadId: id,
      threadTitle: 'Best build?',
    });
    reply.fn.mockClear();
    await code(createPost({ userId: 'u2', threadId: id, body: ' ' }));
    await moderateThread({ threadId: id, action: 'lock' });
    await code(createPost({ userId: 'u2', threadId: id, body: 'late' }));
    expect(reply.fn).not.toHaveBeenCalled();
  });
});
