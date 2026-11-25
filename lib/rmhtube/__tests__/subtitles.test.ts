import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../../../server/rmhtube/config';
import { C2S } from '@/lib/rmhtube/events';
import { SubtitleAddSchema, SubtitleRemoveSchema } from '@/lib/rmhtube/schemas';
import { addSubtitle, readSubtitleCues, removeSubtitle, type SubtitleDb } from '@/lib/rmhtube/subtitles.server';

interface Row {
  id: string;
  queueItemId: string;
  roomId: string;
  addedById: string;
  label: string;
  lang: string | null;
  cues: unknown;
  cueCount: number;
}

/** A small in-memory stand-in for the models these functions touch. */
function fakeDb(opts: { closed?: boolean } = {}) {
  const state = {
    room: { id: 'r1', hostId: 'host', closedAt: opts.closed ? new Date() : null },
    members: new Map<string, { leftAt: Date | null }>([
      ['host', { leftAt: null }],
      ['adder', { leftAt: null }],
      ['viewer', { leftAt: null }],
      ['gone', { leftAt: new Date() }],
    ]),
    item: { id: 'i1', roomId: 'r1', addedById: 'adder' },
    subs: [] as Row[],
    n: 0,
  };
  const models = {
    rmhTubeRoom: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === state.room.id ? state.room : null),
    },
    rmhTubeRoomMember: {
      findUnique: async ({ where }: { where: { roomId_userId: { roomId: string; userId: string } } }) =>
        state.members.get(where.roomId_userId.userId) ?? null,
    },
    rmhTubeQueueItem: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === state.item.id ? state.item : null),
    },
    rmhTubeSubtitle: {
      findMany: async ({ where }: { where: { queueItemId: string } }) =>
        state.subs.filter((s) => s.queueItemId === where.queueItemId),
      findUnique: async ({ where }: { where: { id: string } }) => state.subs.find((s) => s.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { id: string; queueItemId: string; roomId: string } }) =>
        state.subs.find((s) => s.id === where.id && s.queueItemId === where.queueItemId && s.roomId === where.roomId) ??
        null,
      create: async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row = { id: `s${++state.n}`, ...data };
        state.subs.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        state.subs = state.subs.filter((s) => s.id !== where.id);
        return { count: 1 };
      },
    },
  };
  const tx = { ...models, $executeRaw: async () => 1 };
  const db = { ...models, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as unknown as SubtitleDb;
  return { db, state };
}

const cues = [
  { start: 0, end: 1000, text: 'Hello' },
  { start: 1000, end: 2000, text: 'World' },
];
const add = (db: SubtitleDb, userId: string, label = 'English', extra: Record<string, unknown> = {}) =>
  addSubtitle(db, { roomId: 'r1', itemId: 'i1', userId, label, cues, live: false, ...extra });

describe('adding subtitles', () => {
  it('lets the member who queued the item, or the host, add', async () => {
    const { db } = fakeDb();
    expect((await add(db, 'adder')).ok).toBe(true);
    expect((await add(db, 'host', 'Español', { lang: 'es' })).ok).toBe(true);
  });

  it('refuses another member, a member who left and a stranger', async () => {
    const { db } = fakeDb();
    for (const user of ['viewer', 'gone', 'stranger']) {
      expect(await add(db, user)).toEqual({ ok: false, reason: 'forbidden' });
    }
  });

  it('allows three per item and refuses the fourth, and a repeated label', async () => {
    const { db } = fakeDb();
    for (const label of ['A', 'B', 'C']) expect((await add(db, 'adder', label)).ok).toBe(true);
    expect(await add(db, 'adder', 'D')).toEqual({ ok: false, reason: 'limit' });
    const other = fakeDb();
    await add(other.db, 'adder', 'English');
    expect(await add(other.db, 'adder', 'english')).toEqual({ ok: false, reason: 'label_taken' });
  });

  it('refuses a live item, a bad label or language, and an item of another room', async () => {
    const { db } = fakeDb();
    expect(await add(db, 'adder', 'English', { live: true })).toEqual({ ok: false, reason: 'live' });
    expect(await add(db, 'adder', '   ')).toEqual({ ok: false, reason: 'bad_label' });
    expect(await add(db, 'adder', 'x'.repeat(41))).toEqual({ ok: false, reason: 'bad_label' });
    expect(await add(db, 'adder', 'English', { lang: 'not a tag' })).toEqual({ ok: false, reason: 'bad_lang' });
    expect(
      await addSubtitle(db, { roomId: 'other', itemId: 'i1', userId: 'adder', label: 'A', cues, live: false }),
    ).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('refuses unordered, oversized and over-512 KB cue sets, and stores cleaned text', async () => {
    const { db, state } = fakeDb();
    expect(await add(db, 'adder', 'A', { cues: [cues[1], cues[0]] })).toEqual({ ok: false, reason: 'unordered' });
    const many = Array.from({ length: 5001 }, (_, i) => ({ start: i, end: i + 1, text: 'a' }));
    expect(await add(db, 'adder', 'A', { cues: many })).toEqual({ ok: false, reason: 'too_many_cues' });
    const heavy = Array.from({ length: 4000 }, (_, i) => ({ start: i, end: i + 1, text: 'y'.repeat(400) }));
    expect(await add(db, 'adder', 'A', { cues: heavy })).toEqual({ ok: false, reason: 'too_large' });
    expect(state.subs).toHaveLength(0);
    await add(db, 'adder', 'A', { cues: [{ start: 0, end: 10, text: '<img src=x onerror=1>Hi‮' }] });
    expect(state.subs[0]!.cues).toEqual([{ start: 0, end: 10, text: 'Hi' }]);
  });
});

describe('removing subtitles', () => {
  it('lets the adder or the host remove, and nobody else', async () => {
    const { db, state } = fakeDb();
    await add(db, 'adder', 'A');
    await add(db, 'host', 'B');
    const [a, b] = state.subs.map((s) => s.id);
    expect(await removeSubtitle(db, { roomId: 'r1', subtitleId: b!, userId: 'adder' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await removeSubtitle(db, { roomId: 'r1', subtitleId: a!, userId: 'viewer' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await removeSubtitle(db, { roomId: 'r1', subtitleId: a!, userId: 'gone' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await removeSubtitle(db, { roomId: 'r1', subtitleId: a!, userId: 'adder' })).toMatchObject({ ok: true });
    expect(await removeSubtitle(db, { roomId: 'r1', subtitleId: b!, userId: 'host' })).toMatchObject({ ok: true });
    expect(state.subs).toHaveLength(0);
    expect(await removeSubtitle(db, { roomId: 'r1', subtitleId: 'nope', userId: 'host' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('reading the cues', () => {
  async function seeded(opts?: { closed?: boolean }) {
    const f = fakeDb(opts);
    f.state.subs.push({
      id: 's1',
      queueItemId: 'i1',
      roomId: 'r1',
      addedById: 'adder',
      label: 'English',
      lang: 'en',
      cues,
      cueCount: 2,
    });
    return f.db;
  }
  const read = (
    db: SubtitleDb,
    userId: string,
    over: Partial<{ roomId: string; itemId: string; subtitleId: string }> = {},
  ) => readSubtitleCues(db, { roomId: 'r1', itemId: 'i1', subtitleId: 's1', userId, ...over });

  it('serves a current member and the host', async () => {
    const db = await seeded();
    expect(await read(db, 'viewer')).toMatchObject({ id: 's1', label: 'English', cues });
    expect(await read(db, 'host')).not.toBeNull();
  });

  it('gives a member who left, a stranger and a closed room the same null as a missing room, item or subtitle', async () => {
    const db = await seeded();
    const open = [
      await read(db, 'gone'),
      await read(db, 'stranger'),
      await read(db, 'viewer', { roomId: 'zz' }),
      await read(db, 'viewer', { itemId: 'zz' }),
      await read(db, 'viewer', { subtitleId: 'zz' }),
    ];
    expect(open).toEqual([null, null, null, null, null]);
    expect(await read(await seeded({ closed: true }), 'host')).toBeNull();
    expect(await read(await seeded({ closed: true }), 'viewer')).toBeNull();
  });

  it('is registered as a private, no-store, members-only endpoint', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../api/rmhtube.rooms.$roomId.items.$itemId.subtitles.$subtitleId.server.ts'),
      'utf8',
    );
    expect(src).toContain("auth: 'required'");
    expect(src).toContain("rateLimit: 'read'");
    expect(src).toContain('private, no-store');
    expect(src).toContain('/api/rmhtube/rooms/$roomId/items/$itemId/subtitles/$subtitleId');
  });
});

describe('hub events', () => {
  it('both events have a rate-limit entry (an event with none is not limited)', () => {
    expect(config.SOCKET_RATE_LIMITS[C2S.SUBTITLE_ADD]).toEqual({ max: 6, windowMs: 60_000 });
    expect(config.SOCKET_RATE_LIMITS[C2S.SUBTITLE_REMOVE]).toEqual({ max: 20, windowMs: 60_000 });
  });

  it('validates both payloads with zod and bounds them', () => {
    expect(SubtitleAddSchema.safeParse({ itemId: 'i1', label: 'English', cues }).success).toBe(true);
    expect(SubtitleAddSchema.safeParse({ itemId: 'i1', label: 'English', cues: [] }).success).toBe(false);
    expect(SubtitleAddSchema.safeParse({ itemId: 'i1', label: '', cues }).success).toBe(false);
    expect(
      SubtitleAddSchema.safeParse({ itemId: 'i1', label: 'a', cues: [{ start: 0, end: 1, text: 'x'.repeat(5000) }] })
        .success,
    ).toBe(false);
    expect(SubtitleRemoveSchema.safeParse({ subtitleId: 's1' }).success).toBe(true);
    expect(SubtitleRemoveSchema.safeParse({}).success).toBe(false);
  });

  it('registers the handlers on every connection and gates them by wrapper', () => {
    const queue = readFileSync(path.resolve(__dirname, '../../../server/rmhtube/media-queue.ts'), 'utf8');
    expect(queue).toContain('registerSubtitleHandlers(socket, this.roomManager)');
    const handler = readFileSync(path.resolve(__dirname, '../../../server/rmhtube/subtitle-handler.ts'), 'utf8');
    expect(handler).toContain('validated(socket, C2S.SUBTITLE_ADD, SubtitleAddSchema');
    expect(handler).toContain('validated(socket, C2S.SUBTITLE_REMOVE, SubtitleRemoveSchema');
  });
});
