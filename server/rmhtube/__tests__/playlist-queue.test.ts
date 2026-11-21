/**
 * QUEUE_ADD_PLAYLIST on the hub: access comes from the authenticated socket
 * user, the same permission and capacity rules as a single add, no probing, one
 * broadcast. Prisma is a fake that answers playlist lookups by evaluating the
 * `where` the hub sends, so a query that forgot the access clause fails here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/rmhtube/probe.server', () => ({ probeMediaUrl: probe }));

interface FakePlaylist {
  id: string;
  kind: string;
  userId: string;
  name: string;
  itemCount: number;
  collaborators: string[];
  items: Array<{ url: string | null; title: string; durationMs: number | null; thumbnail: string | null }>;
}

const db = vi.hoisted(() => ({
  playlists: [] as FakePlaylist[],
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  playlistFindFirst: undefined as unknown as ReturnType<typeof vi.fn>,
  createMany: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('../prisma-client', () => {
  db.playlistFindFirst = vi.fn(async (args: {
    where: { id: string; kind: string; OR: Array<{ userId?: string; collaborators?: { some: { userId: string } } }> };
    select: unknown;
    }) => {
    const p = db.playlists.find((x) => x.id === args.where.id && x.kind === args.where.kind);
    if (!p) return null;
    const allowed = args.where.OR.some(
      (c) => c.userId === p.userId || (c.collaborators && p.collaborators.includes(c.collaborators.some.userId)),
    );
    if (!allowed) return null;
    return { name: p.name, userId: p.userId, itemCount: p.itemCount, items: p.items };
  });
  db.createMany = vi.fn(async () => ({ count: 0 }));
  return {
    getPrismaClient: () => ({
      playlist: { findFirst: db.playlistFindFirst },
      userBlock: {
        findFirst: async (args: { where: { OR: Array<{ blockerId: string; blockedId: string }> } }) =>
          db.blocks.find((b) => args.where.OR.some((c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId))
            ? { id: 'b' }
            : null,
      },
      rmhTubeQueueItem: { createMany: db.createMany },
    }),
    disconnectPrisma: () => Promise.resolve(),
  };
});

import { MediaQueue } from '../media-queue';
import { config } from '../config';
import { S2C } from '../../../lib/rmhtube/events';

const PLAYLIST_ID = 'cmaaaaaaaaaaaaaaaaaaaaaaa';
const yt = (n: number) => `https://www.youtube.com/watch?v=video${String(n).padStart(6, '0')}`;
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ url: yt(i), title: `Video ${i}`, durationMs: 60_000, thumbnail: null }));

function setup(opts: { host?: string; allowMemberQueue?: boolean; queue?: number } = {}) {
  const room = {
    id: 'room1',
    hostUserId: opts.host ?? 'host',
    settings: { allowMemberQueue: opts.allowMemberQueue ?? false, autoPlay: false },
    queue: Array.from({ length: opts.queue ?? 0 }, (_, i) => ({ id: `q${i}`, url: yt(900 + i), position: i })),
    currentItem: null,
    currentIndex: -1,
    lastActivityAt: 0,
  };
  const broadcastAction = vi.fn();
  const roomManager = {
    getRoomForUser: () => room,
    broadcastAction,
    toBroadcastItem: (_r: unknown, q: { id: string; title: string }) => ({ id: q.id, title: q.title }),
  };
  const emitted: Array<[string, unknown]> = [];
  const socket = (userId: string) =>
    ({
      id: `sock-${userId}`,
      data: { userId, userName: `Name ${userId}` },
      emit: (e: string, p: unknown) => emitted.push([e, p]),
      on: vi.fn(),
    }) as never;
  const queue = new MediaQueue({} as never, roomManager as never, {} as never);
  const run = (userId: string) =>
    (queue as unknown as { addPlaylistToQueue: (s: unknown, p: { playlistId: string }) => Promise<void> }).addPlaylistToQueue(
      socket(userId),
      { playlistId: PLAYLIST_ID },
    );
  return { room, broadcastAction, emitted, run };
}

function playlist(over: Partial<FakePlaylist> = {}): FakePlaylist {
  return {
    id: PLAYLIST_ID,
    kind: 'video',
    userId: 'host',
    name: 'Friday mix',
    itemCount: 20,
    collaborators: [],
    items: rows(20),
    ...over,
  };
}

beforeEach(() => {
  db.playlists = [];
  db.blocks = [];
  db.playlistFindFirst.mockClear();
  db.createMany.mockClear();
  probe.mockReset();
});

describe('QUEUE_ADD_PLAYLIST', () => {
  it('lets the owner queue a 20-item playlist in order with one broadcast and no probe', async () => {
    db.playlists = [playlist()];
    const { room, broadcastAction, emitted, run } = setup();
    await run('host');
    expect(room.queue).toHaveLength(20);
    expect(room.queue.map((q) => (q as unknown as { title: string }).title)).toEqual(rows(20).map((r) => r.title));
    expect(room.queue.map((q) => q.position)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(broadcastAction).toHaveBeenCalledTimes(1);
    const [, type, payload] = broadcastAction.mock.calls[0] as [unknown, string, { items: unknown[]; count: number; playlistName: string; userName: string }];
    expect(type).toBe('QUEUE_PLAYLIST_ADDED');
    expect(payload).toMatchObject({ count: 20, playlistName: 'Friday mix', userName: 'Name host' });
    expect(payload.items).toHaveLength(20);
    expect(db.createMany).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual([S2C.QUEUE_PLAYLIST_RESULT, { added: 20, total: 20, skipped: 0, full: false }]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('lets a collaborator queue it when members may add', async () => {
    db.playlists = [playlist({ userId: 'owner', collaborators: ['dana'] })];
    const { room, run } = setup({ allowMemberQueue: true });
    await run('dana');
    expect(room.queue).toHaveLength(20);
  });

  it('answers a stranger exactly like a missing playlist', async () => {
    db.playlists = [playlist({ userId: 'owner' })];
    const stranger = setup({ allowMemberQueue: true });
    await stranger.run('eve');
    const missing = setup({ allowMemberQueue: true });
    db.playlists = [];
    await missing.run('eve');
    expect(stranger.room.queue).toHaveLength(0);
    expect(stranger.emitted).toEqual(missing.emitted);
    expect(stranger.emitted[0]?.[1]).toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
    expect(stranger.broadcastAction).not.toHaveBeenCalled();
  });

  it('refuses a collaborator when the owner blocked them, and in the other direction', async () => {
    db.playlists = [playlist({ userId: 'owner', collaborators: ['dana'] })];
    db.blocks = [{ blockerId: 'owner', blockedId: 'dana' }];
    const a = setup({ allowMemberQueue: true });
    await a.run('dana');
    expect(a.emitted[0]?.[1]).toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
    expect(a.room.queue).toHaveLength(0);

    db.blocks = [{ blockerId: 'dana', blockedId: 'owner' }];
    const b = setup({ allowMemberQueue: true });
    await b.run('dana');
    expect(b.emitted[0]?.[1]).toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
  });

  it('never lists another member\'s music or other-kind playlist', async () => {
    db.playlists = [playlist({ kind: 'music' })];
    const { emitted, run } = setup();
    await run('host');
    expect(emitted[0]?.[1]).toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
  });

  it('follows allowMemberQueue: a member is refused when it is off, before any read', async () => {
    db.playlists = [playlist({ userId: 'dana' })];
    const { room, emitted, run } = setup({ allowMemberQueue: false });
    await run('dana');
    expect(emitted[0]?.[1]).toMatchObject({ code: 'NOT_HOST' });
    expect(room.queue).toHaveLength(0);
    expect(db.playlistFindFirst).not.toHaveBeenCalled();
  });

  it('selects only the columns it needs and bounds the read by free capacity', async () => {
    db.playlists = [playlist()];
    const { run } = setup({ queue: 90 });
    await run('host');
    const args = db.playlistFindFirst.mock.calls[0]?.[0] as {
      select: { items: { take: number; select: Record<string, boolean> } };
    };
    expect(args.select.items.select).toEqual({ url: true, title: true, durationMs: true, thumbnail: true });
    expect(args.select.items.take).toBe(10 + 20);
  });

  it('adds only what fits and tells the adder', async () => {
    db.playlists = [playlist({ itemCount: 30, items: rows(30) })];
    const { room, emitted, broadcastAction, run } = setup({ queue: config.MAX_QUEUE_SIZE - 12 });
    await run('host');
    expect(room.queue).toHaveLength(config.MAX_QUEUE_SIZE);
    expect(broadcastAction).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual([S2C.QUEUE_PLAYLIST_RESULT, { added: 12, total: 30, skipped: 0, full: true }]);
  });

  it('skips unplaceable rows without probing and counts them', async () => {
    db.playlists = [
      playlist({
        itemCount: 3,
        items: [
          { url: yt(1), title: 'ok', durationMs: null, thumbnail: null },
          { url: null, title: 'no url', durationMs: null, thumbnail: null },
          { url: 'https://example.com/signed/123', title: 'opaque', durationMs: null, thumbnail: null },
        ],
      }),
    ];
    const { room, emitted, run } = setup();
    await run('host');
    expect(room.queue).toHaveLength(1);
    expect(emitted).toContainEqual([S2C.QUEUE_PLAYLIST_RESULT, { added: 1, total: 3, skipped: 2, full: false }]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('refuses outright when the queue is already full', async () => {
    db.playlists = [playlist()];
    const { emitted, run } = setup({ queue: config.MAX_QUEUE_SIZE });
    await run('host');
    expect(emitted[0]?.[1]).toMatchObject({ code: 'QUEUE_FULL' });
    expect(db.playlistFindFirst).not.toHaveBeenCalled();
  });

  it('is rate limited to 5 playlist adds a minute per socket', () => {
    expect(config.SOCKET_RATE_LIMITS['rmhtube:queue:add_playlist']).toEqual({ max: 5, windowMs: 60_000 });
  });
});
