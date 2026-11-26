import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mentions in a game's discussions (s15-12): who is told, who is skipped, the once-per-thread dedupe, the cap of five,
// and no second notice for a member who is also a reply recipient. The real `createNotification` and the real reply
// notice run against an in-memory database (as thread-notices.test.ts does), behind `shapeChecked`.

interface Row {
  [key: string]: unknown;
}
interface FakeUser {
  id: string;
  handle: string;
  bannedUntil: Date | null;
  deletionScheduledAt: Date | null;
}
const db = vi.hoisted(() => ({
  users: new Map<string, FakeUser>(),
  blocks: [] as { blockerId: string; blockedId: string }[],
  mutes: [] as { muterId: string; mutedId: string; expiresAt: Date | null }[],
  threads: new Map<string, { id: string; authorId: string }>(),
  posts: [] as { threadId: string; authorId: string; createdAt: Date }[],
  prefs: new Map<string, { muteUntil: Date | null; mentionsOnly: boolean; pinned: boolean }>(),
  notifications: [] as Row[],
  /** Members who turned the mentions preference off. */
  mentionsOff: new Set<string>(),
  lookups: [] as string[][],
  failLookup: false,
  failMembers: false,
}));

vi.mock('@/lib/handles/lookup.server', () => ({
  // The real one is one `lower("handle") = ANY(...)` query; this answers the same question in memory.
  findUsersByHandles: async (handles: readonly string[], opts: { excludeUserId?: string } = {}) => {
    if (db.failLookup) throw new Error('database is down');
    db.lookups.push([...handles]);
    const lowered = new Set(handles.map((h) => h.toLowerCase()));
    return [...db.users.values()]
      .filter((u) => lowered.has(u.handle.toLowerCase()) && u.id !== opts.excludeUserId)
      .map((u) => ({ id: u.id, handle: u.handle }));
  },
}));

const display = (u: FakeUser) => ({
  id: u.id,
  name: `Name ${u.id}`,
  image: null,
  username: null,
  handle: u.handle,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
});

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const u = db.users.get(where.id);
          return u ? display(u) : null;
        },
        findMany: async ({ where }: { where: { id: { in: string[] }; OR?: Row[]; deletionScheduledAt?: null } }) => {
          const wanted = where.id.in.map((id) => db.users.get(id)).filter((u): u is FakeUser => !!u);
          // The reach check: banned or waiting to be deleted.
          if (where.OR) {
            return wanted
              .filter((u) => (u.bannedUntil && u.bannedUntil.getTime() > Date.now()) || u.deletionScheduledAt)
              .map((u) => ({ id: u.id }));
          }
          // The page's names: members not waiting to be deleted.
          if (db.failMembers) throw new Error('database is down');
          return wanted.filter((u) => u.deletionScheduledAt === null).map(display);
        },
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
      notificationPreference: {
        findUnique: async ({ where }: { where: { userId: string } }) =>
          db.mentionsOff.has(where.userId)
            ? {
                likes: true,
                comments: true,
                follows: true,
                mentions: false,
                reposts: true,
                system: true,
                matrix: null,
                quietStart: null,
                quietEnd: null,
                tz: 'UTC',
              }
            : null,
      },
      notification: {
        findFirst: async ({ where }: { where: Row }) =>
          // Only the keys the query names: a mention's dedupe leaves the actor out.
          db.notifications.find((n) =>
            ['userId', 'actorId', 'type', 'entityType', 'entityId', 'read'].every(
              (k) => !(k in where) || n[k] === where[k],
            ),
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

import { assertJsonSafe } from '@/lib/db/query-shape';
import { notifyThreadReply } from '@/lib/games/thread-notices.server';
import {
  mentionLink,
  notifyThreadMentions,
  resolveThreadMentions,
  type ThreadMentionPost,
} from '@/lib/games/thread-mentions.server';
import { MAX_MENTION_NOTICES, MAX_PAGE_HANDLES } from '@/lib/games/thread-text';

const FOREVER = new Date('9999-12-31T00:00:00Z');
const user = (id: string, over: Partial<FakeUser> = {}) =>
  db.users.set(id, { id, handle: id, bannedUntil: null, deletionScheduledAt: null, ...over });
const mention = (body: string, over: Partial<ThreadMentionPost> = {}) =>
  notifyThreadMentions({
    postId: 'P9',
    threadId: 'T',
    gameId: 'altair',
    threadTitle: 'Best build for act 2',
    body,
    writerId: 'writer',
    ...over,
  });
const told = () => db.notifications.map((n) => n.userId as string).sort();
const day = 86_400_000;

beforeEach(() => {
  db.users.clear();
  db.blocks.length = 0;
  db.mutes.length = 0;
  db.threads.clear();
  db.posts.length = 0;
  db.prefs.clear();
  db.notifications.length = 0;
  db.mentionsOff.clear();
  db.lookups.length = 0;
  db.failLookup = false;
  db.failMembers = false;
  for (const id of ['writer', 'sam', 'lee', 'kit']) user(id);
  db.threads.set('T', { id: 'T', authorId: 'author' });
});

describe('notifyThreadMentions', () => {
  it('tells a mentioned member once, with the key notice, and opens the reply', async () => {
    expect(await mention('@sam can you check this')).toEqual(['sam']);
    expect(db.notifications).toHaveLength(1);
    const row = db.notifications[0]!;
    expect(row).toMatchObject({
      userId: 'sam',
      actorId: 'writer',
      type: 'MENTION',
      entityType: 'game-thread',
      entityId: 'T',
      previewKey: 'game-thread-mention',
      previewParams: { name: 'Name writer', title: 'Best build for act 2' },
      link: '/games/hub/altair/t/T#post-P9',
    });
    expect(row.preview).toBe('Name writer mentioned you in Best build for act 2');
    // The text of the reply is not in the notice.
    expect(JSON.stringify(row)).not.toContain('can you check this');
  });

  it('opens the top of the discussion for an opening post, which has no anchor', async () => {
    expect(await mention('@sam welcome', { postId: null })).toEqual(['sam']);
    expect(db.notifications[0]).toMatchObject({ link: '/games/hub/altair/t/T' });
    expect(mentionLink({ postId: null, threadId: 'T', gameId: 'altair' })).toBe('/games/hub/altair/t/T');
  });

  it('matches a handle whatever its case and tells a member named twice once', async () => {
    user('Sam', { handle: 'Sam' });
    db.users.delete('sam');
    expect(await mention('@sam and @SAM and @Sam')).toEqual(['Sam']);
    expect(told()).toEqual(['Sam']);
  });

  it('tells several members, one row each', async () => {
    expect(await mention('@sam @lee and @kit')).toEqual(['sam', 'lee', 'kit']);
    expect(told()).toEqual(['kit', 'lee', 'sam']);
  });

  it('tells nobody for an unknown handle, an e-mail address or @@', async () => {
    expect(await mention('@ghost and sam@example.com and @@lee')).toEqual([]);
    expect(db.notifications).toEqual([]);
  });

  it('does no lookup for text with no mention', async () => {
    expect(await mention('no names here')).toEqual([]);
    expect(db.lookups).toEqual([]);
  });

  it('never tells the writer, even when they name themselves', async () => {
    expect(await mention('@writer is testing, @sam too')).toEqual(['sam']);
    expect(told()).toEqual(['sam']);
  });

  it('tells nobody who blocked the writer or whom the writer blocked', async () => {
    db.blocks.push({ blockerId: 'writer', blockedId: 'sam' }, { blockerId: 'lee', blockedId: 'writer' });
    expect(await mention('@sam @lee @kit')).toEqual(['kit']);
    expect(told()).toEqual(['kit']);
  });

  it('tells nobody who muted the writer, and ignores a mute that has ended', async () => {
    db.mutes.push(
      { muterId: 'sam', mutedId: 'writer', expiresAt: null },
      { muterId: 'lee', mutedId: 'writer', expiresAt: new Date(Date.now() - 1000) },
      // The writer muting a member says nothing about being heard by them.
      { muterId: 'writer', mutedId: 'kit', expiresAt: null },
    );
    expect(await mention('@sam @lee @kit')).toEqual(['lee', 'kit']);
  });

  it('tells nobody banned or waiting to be deleted, but a member whose ban ended', async () => {
    user('sam', { bannedUntil: new Date(Date.now() + day) });
    user('lee', { deletionScheduledAt: new Date(Date.now() + day) });
    user('kit', { bannedUntil: new Date(Date.now() - 1000) });
    expect(await mention('@sam @lee @kit')).toEqual(['kit']);
  });

  it('tells nobody who muted the thread, and still tells the others', async () => {
    db.prefs.set('sam|game-thread:T', { muteUntil: FOREVER, mentionsOnly: false, pinned: false });
    await mention('@sam @lee');
    expect(told()).toEqual(['lee']);
  });

  it('lets a mention through a "mentions only" thread mute', async () => {
    db.prefs.set('sam|game-thread:T', { muteUntil: null, mentionsOnly: true, pinned: false });
    await mention('@sam');
    expect(told()).toEqual(['sam']);
  });

  it('tells a member whose thread mute has ended, and one who muted a different thread', async () => {
    db.prefs.set('sam|game-thread:T', { muteUntil: new Date(Date.now() - 1000), mentionsOnly: false, pinned: false });
    db.prefs.set('lee|game-thread:OTHER', { muteUntil: FOREVER, mentionsOnly: false, pinned: false });
    await mention('@sam @lee');
    expect(told()).toEqual(['lee', 'sam']);
  });

  it('tells at most five members, the first five unique handles, with one lookup', async () => {
    for (let i = 1; i <= 7; i++) user(`m${i}`);
    const told5 = await mention('@m1 @m2 @m2 @m3 @m4 @m5 @m6 @m7');
    expect(told5).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(told5).toHaveLength(MAX_MENTION_NOTICES);
    expect(db.notifications).toHaveLength(5);
    expect(db.lookups).toEqual([['m1', 'm2', 'm3', 'm4', 'm5']]);
  });

  it('adds nothing for a second post by the same writer while the first notice is unread', async () => {
    await mention('@sam first', { postId: 'P1' });
    await mention('@sam again', { postId: 'P2' });
    expect(db.notifications).toHaveLength(1);
    // Once it has been read, the next mention is a new notice.
    db.notifications[0]!.read = true;
    await mention('@sam once more', { postId: 'P3' });
    expect(db.notifications).toHaveLength(2);
  });

  it('keeps a member to one unread notice per thread whoever writes, refreshed to the newest writer and post', async () => {
    user('other');
    await mention('@sam first', { postId: 'P1' });
    expect(await mention('@sam from someone else', { postId: 'P2', writerId: 'other' })).toEqual(['sam']);
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({
      userId: 'sam',
      actorId: 'other',
      previewParams: { name: 'Name other', title: 'Best build for act 2' },
      link: '/games/hub/altair/t/T#post-P2',
    });
  });

  it('does not count a member whose mentions are turned off as told', async () => {
    db.mentionsOff.add('sam');
    expect(await mention('@sam @lee')).toEqual(['lee']);
    expect(told()).toEqual(['lee']);
  });

  it('keeps a member to one unread notice per thread, but a second thread is its own notice', async () => {
    await mention('@sam here', { threadId: 'T' });
    await mention('@sam there', { threadId: 'T2', postId: 'P7' });
    expect(db.notifications).toHaveLength(2);
    expect(db.notifications.map((n) => n.entityId)).toEqual(['T', 'T2']);
  });

  it('never throws, and returns what it told before a failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failLookup = true;
    expect(await mention('@sam')).toEqual([]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('tells nobody when the writer no longer exists', async () => {
    db.users.delete('writer');
    expect(await mention('@sam')).toEqual([]);
    expect(db.notifications).toEqual([]);
  });

  it('cuts a long title in the notice', async () => {
    await mention('@sam', { threadTitle: 'x'.repeat(200) });
    expect((db.notifications[0]!.previewParams as { title: string }).title).toHaveLength(80);
  });
});

describe('a mention and the reply notice', () => {
  const reply = (skip?: ReadonlySet<string>) =>
    notifyThreadReply(
      {
        id: 'P9',
        threadId: 'T',
        gameId: 'altair',
        threadTitle: 'Best build for act 2',
        threadAuthorId: 'author',
        posterId: 'writer',
      },
      skip,
    );
  const rows = (type: string) =>
    db.notifications
      .filter((n) => n.type === type)
      .map((n) => n.userId as string)
      .sort();

  beforeEach(() => {
    user('author');
    // Sam posted earlier in the thread, so Sam is a reply recipient too.
    db.posts.push({ threadId: 'T', authorId: 'sam', createdAt: new Date(1_000_000) });
  });

  it('a mentioned reply recipient gets the mention and no reply notice', async () => {
    const mentioned = await mention('@sam can you check this');
    await reply(new Set(mentioned));
    expect(rows('MENTION')).toEqual(['sam']);
    expect(rows('REPLY')).toEqual(['author']);
    expect(told()).toEqual(['author', 'sam']);
  });

  it('without the skip set the reply notice is unchanged: Sam would be told twice', async () => {
    await mention('@sam can you check this');
    await reply();
    expect(rows('REPLY')).toEqual(['author', 'sam']);
  });

  it('an empty skip set changes nothing', async () => {
    await reply(new Set());
    expect(rows('REPLY')).toEqual(['author', 'sam']);
  });

  it('a mentioned reply recipient whose mentions are turned off still gets the reply notice', async () => {
    db.mentionsOff.add('sam');
    const mentioned = await mention('@sam can you check this');
    expect(mentioned).toEqual([]);
    await reply(new Set(mentioned));
    expect(rows('MENTION')).toEqual([]);
    expect(rows('REPLY')).toEqual(['author', 'sam']);
  });

  it('a mentioned member who is not a reply recipient gets the mention, and the others keep their reply notice', async () => {
    const mentioned = await mention('@lee hello');
    await reply(new Set(mentioned));
    expect(rows('MENTION')).toEqual(['lee']);
    expect(rows('REPLY')).toEqual(['author', 'sam']);
  });
});

describe('resolveThreadMentions', () => {
  it('maps each handle to the handle as stored and the name, case-insensitively', async () => {
    user('sam', { handle: 'Sam' });
    const out = await resolveThreadMentions(['@sam can you check this', 'thanks @LEE', 'and @ghost']);
    expect(out).toEqual({
      sam: { handle: 'Sam', name: 'Name sam' },
      lee: { handle: 'lee', name: 'Name lee' },
    });
    assertJsonSafe(out);
  });

  it('does one handle lookup for the whole page', async () => {
    await resolveThreadMentions(['@sam', '@lee and @sam', 'no one', '@kit']);
    expect(db.lookups).toEqual([['sam', 'lee', 'kit']]);
  });

  it('does no lookup when no body names anyone', async () => {
    expect(await resolveThreadMentions(['plain', 'sam@example.com', '@@sam'])).toEqual({});
    expect(db.lookups).toEqual([]);
  });

  it('bounds the handles looked up', async () => {
    const bodies = Array.from({ length: MAX_PAGE_HANDLES + 20 }, (_, i) => `@member${i}`);
    await resolveThreadMentions(bodies);
    expect(db.lookups[0]).toHaveLength(MAX_PAGE_HANDLES);
  });

  it('leaves out a member waiting to be deleted', async () => {
    user('lee', { deletionScheduledAt: new Date(Date.now() + day) });
    expect(Object.keys(await resolveThreadMentions(['@sam @lee']))).toEqual(['sam']);
  });

  it('answers nothing, not an error, when the lookup fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failMembers = true;
    expect(await resolveThreadMentions(['@sam'])).toEqual({});
    db.failMembers = false;
    db.failLookup = true;
    expect(await resolveThreadMentions(['@sam'])).toEqual({});
    log.mockRestore();
  });
});
