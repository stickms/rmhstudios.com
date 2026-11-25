import { beforeEach, describe, expect, it, vi } from 'vitest';

// Replies in a game thread (s14-11): who is told, who is skipped, and that the row is the one the old code wrote.
// The real `createNotification` runs against an in-memory database, so the thread mute (a `game-thread:<id>` row of
// `ConversationPref`) and the dedupe are the production code, not a stub's idea of them.

interface Row {
  [key: string]: unknown;
}
const db = vi.hoisted(() => ({
  users: new Map<string, { id: string; bannedUntil: Date | null; deletionScheduledAt: Date | null }>(),
  blocks: [] as { blockerId: string; blockedId: string }[],
  mutes: [] as { muterId: string; mutedId: string; expiresAt: Date | null }[],
  threads: new Map<string, { id: string; authorId: string }>(),
  posts: [] as { threadId: string; authorId: string; createdAt: Date }[],
  prefs: new Map<string, { muteUntil: Date | null; mentionsOnly: boolean; pinned: boolean }>(),
  notifications: [] as Row[],
  failReads: false,
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const u = db.users.get(where.id);
          return u ? { id: u.id, name: `Name ${u.id}`, image: null, handle: u.id, profile: null } : null;
        },
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in
            .map((id) => db.users.get(id))
            .filter((u) => u && ((u.bannedUntil && u.bannedUntil.getTime() > Date.now()) || u.deletionScheduledAt))
            .map((u) => ({ id: u!.id })),
      },
      userBlock: {
        findMany: async ({ where }: { where: { OR: Row[] } }) => {
          const [a, b] = where.OR as [
            { blockerId: string; blockedId: { in: string[] } },
            { blockedId: string; blockerId: { in: string[] } },
          ];
          return db.blocks.filter(
            (x) =>
              (x.blockerId === a.blockerId && a.blockedId.in.includes(x.blockedId)) ||
              (x.blockedId === b.blockedId && b.blockerId.in.includes(x.blockerId)),
          );
        },
      },
      userMute: {
        findMany: async ({ where }: { where: { mutedId: string; muterId: { in: string[] }; OR: Row[] } }) => {
          expect(where.OR).toHaveLength(2); // activeMuteWhere
          return db.mutes.filter(
            (m) =>
              m.mutedId === where.mutedId &&
              where.muterId.in.includes(m.muterId) &&
              (m.expiresAt === null || m.expiresAt.getTime() > Date.now()),
          );
        },
      },
      gameThread: {
        findUnique: async ({ where }: { where: { id: string } }) => db.threads.get(where.id) ?? null,
      },
      gameThreadPost: {
        groupBy: async ({ where, take }: { where: { threadId: string }; take: number }) => {
          if (db.failReads) throw new Error('database is down');
          const seen = new Set<string>();
          const out: { authorId: string }[] = [];
          for (const p of db.posts
            .filter((x) => x.threadId === where.threadId)
            .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())) {
            if (seen.has(p.authorId)) continue;
            seen.add(p.authorId);
            out.push({ authorId: p.authorId });
          }
          return out.slice(0, take);
        },
      },
      conversationPref: {
        findUnique: async ({ where }: { where: { userId_scopeKey: { userId: string; scopeKey: string } } }) =>
          db.prefs.get(`${where.userId_scopeKey.userId}|${where.userId_scopeKey.scopeKey}`) ?? null,
      },
      notificationPreference: { findUnique: async () => null },
      notification: {
        findFirst: async ({ where }: { where: Row }) =>
          db.notifications.find((n) =>
            ['userId', 'actorId', 'type', 'entityType', 'entityId', 'read'].every((k) => n[k] === where[k]),
          ) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Row }) => {
          Object.assign(
            db.notifications.find((n) => n.id === where.id)!,
            data,
          );
          return {};
        },
        create: async ({ data }: { data: Row }) => {
          const row = { id: `n${db.notifications.length + 1}`, read: false, ...data };
          db.notifications.push(row);
          return { id: row.id };
        },
      },
    }),
  };
});
vi.mock('@/lib/cached.server', () => ({
  cachedNullable: (_k: string, _t: number, load: () => Promise<unknown>) => load(),
  invalidateCached: vi.fn(),
}));
vi.mock('@/lib/redis.server', () => ({
  redisEnabled: () => false,
  redisGetJSON: vi.fn(),
  redisSetJSON: vi.fn(),
  redisIncrBy: vi.fn(),
}));
vi.mock('@/lib/push/send.server', () => ({
  sendPushToUser: vi.fn(),
  pushTitleFor: () => 'title',
  pushActionsFor: () => undefined,
}));
vi.mock('@/lib/notify/held.server', () => ({ holdNotification: vi.fn(async () => {}) }));

import { CONVERSATION_SCOPES, isConversationScopeKey } from '@/lib/notify/conversation-prefs.server';
import {
  MAX_THREAD_RECIPIENTS,
  notifyThreadReply,
  reachableRecipients,
  threadReplyRecipients,
} from '@/lib/games/thread-notices.server';

const user = (id: string, over: Partial<{ bannedUntil: Date | null; deletionScheduledAt: Date | null }> = {}) =>
  db.users.set(id, { id, bannedUntil: null, deletionScheduledAt: null, ...over });
let clock = 0;
const post = (authorId: string) => db.posts.push({ threadId: 'T', authorId, createdAt: new Date(1_000_000 + clock++) });
const reply = (posterId = 'poster') =>
  notifyThreadReply({
    id: 'P9',
    threadId: 'T',
    gameId: 'altair',
    threadTitle: 'Best build for act 2',
    threadAuthorId: 'author',
    posterId,
  });
const told = () => db.notifications.map((n) => n.userId as string).sort();

beforeEach(() => {
  db.users.clear();
  db.blocks.length = 0;
  db.mutes.length = 0;
  db.threads.clear();
  db.posts.length = 0;
  db.prefs.clear();
  db.notifications.length = 0;
  db.failReads = false;
  clock = 0;
  for (const id of ['author', 'poster', 'early1', 'early2']) user(id);
  db.threads.set('T', { id: 'T', authorId: 'author' });
  post('early1');
  post('early2');
  post('poster');
});

describe('threadReplyRecipients', () => {
  it('is the thread author and the earlier posters, never the poster', async () => {
    expect((await threadReplyRecipients('T', 'poster')).sort()).toEqual(['author', 'early1', 'early2']);
  });

  it('reads the thread author when it is not handed one', async () => {
    db.threads.set('T', { id: 'T', authorId: 'early1' });
    expect((await threadReplyRecipients('T', 'poster')).sort()).toEqual(['early1', 'early2']);
  });

  it('puts the author first and caps the list at fifty', async () => {
    for (let i = 0; i < 80; i++) {
      user(`many${i}`);
      post(`many${i}`);
    }
    const ids = await threadReplyRecipients('T', 'poster', 'author');
    expect(ids).toHaveLength(MAX_THREAD_RECIPIENTS);
    expect(ids[0]).toBe('author');
    expect(ids).not.toContain('poster');
    // The newest posters win the remaining places.
    expect(ids).toContain('many79');
    expect(ids).not.toContain('early1');
  });

  it('counts a person once however many times they posted', async () => {
    post('early1');
    post('early1');
    expect((await threadReplyRecipients('T', 'poster', 'early1')).filter((id) => id === 'early1')).toHaveLength(1);
  });

  it('skips a member the poster blocked and one who blocked the poster', async () => {
    db.blocks.push({ blockerId: 'poster', blockedId: 'early1' }, { blockerId: 'early2', blockedId: 'poster' });
    expect(await threadReplyRecipients('T', 'poster')).toEqual(['author']);
  });

  it('skips a member who muted the poster, and ignores a mute that has ended', async () => {
    db.mutes.push(
      { muterId: 'early1', mutedId: 'poster', expiresAt: null },
      { muterId: 'early2', mutedId: 'poster', expiresAt: new Date(Date.now() - 1000) },
      // Muting someone else says nothing about the poster.
      { muterId: 'author', mutedId: 'early1', expiresAt: null },
    );
    expect((await threadReplyRecipients('T', 'poster')).sort()).toEqual(['author', 'early2']);
  });

  it('skips banned members and members waiting to be deleted, but not an ended ban', async () => {
    user('author', { bannedUntil: new Date(Date.now() + 86_400_000) });
    user('early1', { deletionScheduledAt: new Date(Date.now() + 86_400_000) });
    user('early2', { bannedUntil: new Date(Date.now() - 1000) });
    expect(await threadReplyRecipients('T', 'poster')).toEqual(['early2']);
  });
});

describe('reachableRecipients', () => {
  it('answers nothing for nobody, and never the actor', async () => {
    expect(await reachableRecipients('poster', [])).toEqual([]);
    expect(await reachableRecipients('poster', ['poster'])).toEqual([]);
  });
});

describe('notifyThreadReply', () => {
  it('writes one Replies row per recipient, in the shape the old row had, with the new notice', async () => {
    expect(await reply()).toBe(3);
    expect(told()).toEqual(['author', 'early1', 'early2']);
    const row = db.notifications.find((n) => n.userId === 'author')!;
    expect(row).toMatchObject({
      type: 'REPLY',
      actorId: 'poster',
      entityType: 'hub-thread',
      entityId: 'T',
      previewKey: 'game-thread-reply',
      previewParams: { name: 'Name poster', title: 'Best build for act 2' },
      link: '/games/hub/altair/t/T#post-P9',
    });
    expect(row.preview).toBe('Name poster replied in Best build for act 2');
  });

  it('refreshes an unread row instead of adding a second one (a burst is one row)', async () => {
    await reply();
    await reply();
    expect(db.notifications).toHaveLength(3);
  });

  it('refreshes an unread row the old code wrote rather than duplicating it', async () => {
    db.notifications.push({
      id: 'old',
      userId: 'author',
      actorId: 'poster',
      type: 'REPLY',
      entityType: 'hub-thread',
      entityId: 'T',
      read: false,
      preview: 'replied to “Best build for act 2”',
      previewKey: null,
    });
    await reply();
    expect(db.notifications.filter((n) => n.userId === 'author')).toHaveLength(1);
    expect(db.notifications.find((n) => n.id === 'old')).toMatchObject({ previewKey: 'game-thread-reply' });
  });

  it('tells nobody who muted the thread, and still tells the others', async () => {
    db.prefs.set('early1|game-thread:T', {
      muteUntil: new Date('9999-12-31T00:00:00Z'),
      mentionsOnly: false,
      pinned: false,
    });
    await reply();
    expect(told()).toEqual(['author', 'early2']);
  });

  it('tells a member whose thread mute has ended', async () => {
    db.prefs.set('early1|game-thread:T', {
      muteUntil: new Date(Date.now() - 1000),
      mentionsOnly: false,
      pinned: false,
    });
    await reply();
    expect(told()).toContain('early1');
  });

  it('a mute on a different thread does not hold this one back', async () => {
    db.prefs.set('early1|game-thread:OTHER', {
      muteUntil: new Date('9999-12-31T00:00:00Z'),
      mentionsOnly: false,
      pinned: false,
    });
    await reply();
    expect(told()).toContain('early1');
  });

  it('writes nothing for a blocked or muting member, nor a banned one', async () => {
    db.blocks.push({ blockerId: 'early1', blockedId: 'poster' });
    db.mutes.push({ muterId: 'early2', mutedId: 'poster', expiresAt: null });
    user('author', { bannedUntil: new Date(Date.now() + 86_400_000) });
    expect(await reply()).toBe(0);
    expect(db.notifications).toEqual([]);
  });

  it('the thread author replying to their own thread tells the earlier posters, not themselves', async () => {
    await reply('author');
    expect(told()).toEqual(['early1', 'early2', 'poster']);
  });

  it('never throws: a failing read is logged and the post is untouched', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failReads = true;
    expect(await reply()).toBe(0);
    expect(spy).toHaveBeenCalledOnce();
    expect(db.notifications).toEqual([]);
    spy.mockRestore();
  });
});

describe('the game-thread conversation scope', () => {
  it('is a scope, and its key is accepted by the preference route', () => {
    expect(CONVERSATION_SCOPES).toContain('game-thread');
    expect(isConversationScopeKey('game-thread:clx123abc')).toBe(true);
    expect(isConversationScopeKey('game-thread:')).toBe(false);
    expect(isConversationScopeKey('game-thread:a/b')).toBe(false);
    expect(isConversationScopeKey('thread:abc')).toBe(false);
  });
});
