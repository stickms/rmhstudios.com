import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Saved replies (s05-13): the 50-reply cap under the lock, ownership (another
 * member's id is a 404 and is never touched), reorder scoping and the body
 * limit. Prisma is a small in-memory fake.
 */

interface Row {
  id: string;
  userId: string;
  title: string;
  body: string;
  position: number;
  useCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  events: [] as string[],
  seq: 0,
  writes: [] as { id: string; userId: string; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    state.events.push(`lock:${key}`);
  }),
}));

vi.mock('@/lib/prisma.server', () => {
  type Where = { id?: string; userId?: string };
  const match = (r: Row, w: Where = {}) => (w.id === undefined || r.id === w.id) && (w.userId === undefined || r.userId === w.userId);
  const pick = (r: Row) => ({ ...r });
  const savedReply = {
    count: async ({ where }: { where: Where }) => {
      state.events.push('count');
      return state.rows.filter((r) => match(r, where)).length;
    },
    findFirst: async ({ where, orderBy }: { where: Where; orderBy?: { position?: 'asc' | 'desc' } }) => {
      const rows = state.rows.filter((r) => match(r, where)).sort((a, b) => a.position - b.position);
      if (orderBy?.position === 'desc') rows.reverse();
      return rows[0] ? pick(rows[0]) : null;
    },
    findMany: async ({ where }: { where: Where }) =>
      state.rows
        .filter((r) => match(r, where))
        .sort((a, b) => a.position - b.position)
        .map(pick),
    create: async ({ data }: { data: Omit<Row, 'id' | 'useCount' | 'lastUsedAt' | 'createdAt'> }) => {
      state.events.push('create');
      const row: Row = { ...data, id: `r${++state.seq}`, useCount: 0, lastUsedAt: null, createdAt: new Date() };
      state.rows.push(row);
      return pick(row);
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const hit = state.rows.filter((r) => match(r, where));
      for (const r of hit) {
        state.writes.push({ id: r.id, userId: r.userId, data });
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in v) (r as unknown as Record<string, number>)[k]! += (v as { increment: number }).increment;
          else (r as unknown as Record<string, unknown>)[k] = v;
        }
      }
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const hit = state.rows.filter((r) => match(r, where));
      state.rows = state.rows.filter((r) => !hit.includes(r));
      return { count: hit.length };
    },
  };
  const client = {
    savedReply,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});

import {
  createSavedReply,
  exportSavedReplies,
  listSavedReplies,
  recordSavedReplyUse,
  removeSavedReply,
  reorderSavedReplies,
  updateSavedReply,
} from '@/lib/messages/saved-replies.server';
import { MAX_SAVED_REPLIES } from '@/lib/messages/saved-replies';
import {
  createSavedReplyBody,
  patchSavedReplyBody,
  reorderSavedRepliesBody,
} from '@/lib/messages/saved-replies-schema';

function seed(userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    state.rows.push({
      id: `${userId}-${i}`,
      userId,
      title: `t${i}`,
      body: `b${i}`,
      position: i,
      useCount: 0,
      lastUsedAt: null,
      createdAt: new Date(2026, 0, 1 + i),
    });
  }
}

beforeEach(() => {
  state.rows = [];
  state.events = [];
  state.writes = [];
  state.seq = 0;
});

describe('create', () => {
  it('takes the member lock before it counts or inserts', async () => {
    const res = await createSavedReply('u1', { title: 'Hi', body: 'Hello' });
    expect(res.ok).toBe(true);
    expect(state.events).toEqual(['lock:saved-replies:u1', 'count', 'create']);
  });

  it('appends after the highest position', async () => {
    seed('u1', 3);
    const res = await createSavedReply('u1', { title: 'New', body: 'x' });
    expect(res).toMatchObject({ ok: true, value: { position: 3 } });
  });

  it('refuses the 51st with a 409 limit and writes nothing', async () => {
    seed('u1', MAX_SAVED_REPLIES);
    const res = await createSavedReply('u1', { title: 'One more', body: 'x' });
    expect(res).toMatchObject({ ok: false, status: 409, code: 'limit' });
    expect(state.rows).toHaveLength(MAX_SAVED_REPLIES);
    expect(state.events).not.toContain('create');
  });

  it('counts only the caller’s replies toward the cap', async () => {
    seed('u2', MAX_SAVED_REPLIES);
    expect((await createSavedReply('u1', { title: 'Mine', body: 'x' })).ok).toBe(true);
  });
});

describe('ownership', () => {
  beforeEach(() => {
    seed('u1', 2);
    seed('u2', 1);
  });

  it('answers 404 for another member’s id on edit, delete and use', async () => {
    const foreign = 'u2-0';
    expect(await updateSavedReply('u1', foreign, { title: 'x' })).toMatchObject({ ok: false, status: 404 });
    expect(await removeSavedReply('u1', foreign)).toMatchObject({ ok: false, status: 404 });
    expect(await recordSavedReplyUse('u1', foreign)).toMatchObject({ ok: false, status: 404 });
    const row = state.rows.find((r) => r.id === foreign)!;
    expect(row).toMatchObject({ title: 't0', useCount: 0, lastUsedAt: null });
  });

  it('answers 404 for a missing id exactly as for a foreign one', async () => {
    expect(await removeSavedReply('u1', 'nope')).toEqual(await removeSavedReply('u1', 'u2-0'));
  });

  it('edits, uses and deletes the caller’s own', async () => {
    expect(await updateSavedReply('u1', 'u1-0', { title: 'Renamed' })).toMatchObject({ ok: true, value: { title: 'Renamed', body: 'b0' } });
    expect(await recordSavedReplyUse('u1', 'u1-0')).toMatchObject({ ok: true });
    const used = state.rows.find((r) => r.id === 'u1-0')!;
    expect(used.useCount).toBe(1);
    expect(used.lastUsedAt).toBeInstanceOf(Date);
    expect(await removeSavedReply('u1', 'u1-0')).toMatchObject({ ok: true });
    expect(state.rows.map((r) => r.id)).toEqual(['u1-1', 'u2-0']);
  });

  it('lists only the caller’s replies', async () => {
    expect((await listSavedReplies('u1')).map((r) => r.id)).toEqual(['u1-0', 'u1-1']);
  });
});

describe('reorder', () => {
  beforeEach(() => {
    seed('u1', 3);
    seed('u2', 2);
  });

  it('writes positions for the caller’s rows only, under the lock', async () => {
    const res = await reorderSavedReplies('u1', ['u1-2', 'u1-0', 'u1-1']);
    expect(res.ok && res.value.map((r) => r.id)).toEqual(['u1-2', 'u1-0', 'u1-1']);
    expect(state.events[0]).toBe('lock:saved-replies:u1');
    expect(state.writes.every((w) => w.userId === 'u1')).toBe(true);
    expect(state.rows.filter((r) => r.userId === 'u2').map((r) => r.position)).toEqual([0, 1]);
  });

  it('refuses an id that is not the caller’s and writes nothing', async () => {
    const res = await reorderSavedReplies('u1', ['u1-1', 'u2-0']);
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(state.writes).toEqual([]);
  });

  it('keeps replies the list leaves out after the listed ones, in their order', async () => {
    const res = await reorderSavedReplies('u1', ['u1-2']);
    expect(res.ok && res.value.map((r) => r.id)).toEqual(['u1-2', 'u1-0', 'u1-1']);
  });
});

describe('export', () => {
  it('returns the member’s replies and none of anyone else’s', async () => {
    seed('u1', 2);
    seed('u2', 1);
    const out = await exportSavedReplies('u1');
    expect(out.map((r) => r.title)).toEqual(['t0', 't1']);
    expect(Object.keys(out[0]!).sort()).toEqual(['body', 'createdAt', 'lastUsedAt', 'position', 'title', 'useCount']);
  });
});

describe('request schemas', () => {
  it('limits the body to 2 000 characters and the title to 60', () => {
    expect(createSavedReplyBody.safeParse({ title: 'a', body: 'x'.repeat(2000) }).success).toBe(true);
    expect(createSavedReplyBody.safeParse({ title: 'a', body: 'x'.repeat(2001) }).success).toBe(false);
    expect(createSavedReplyBody.safeParse({ title: 'x'.repeat(60), body: 'b' }).success).toBe(true);
    expect(createSavedReplyBody.safeParse({ title: 'x'.repeat(61), body: 'b' }).success).toBe(false);
  });

  it('refuses a blank title or body', () => {
    expect(createSavedReplyBody.safeParse({ title: '  ', body: 'b' }).success).toBe(false);
    expect(createSavedReplyBody.safeParse({ title: 't', body: '\n ' }).success).toBe(false);
  });

  it('needs something to change on a patch', () => {
    expect(patchSavedReplyBody.safeParse({}).success).toBe(false);
    expect(patchSavedReplyBody.safeParse({ body: 'new' }).success).toBe(true);
  });

  it('takes the order as one comma-separated list of distinct ids', () => {
    expect(reorderSavedRepliesBody.safeParse({ ids: 'a,b,c' }).success).toBe(true);
    expect(reorderSavedRepliesBody.safeParse({ ids: 'a,a' }).success).toBe(false);
    expect(reorderSavedRepliesBody.safeParse({ ids: 'a,,b' }).success).toBe(false);
    expect(reorderSavedRepliesBody.safeParse({ ids: '' }).success).toBe(false);
  });
});
