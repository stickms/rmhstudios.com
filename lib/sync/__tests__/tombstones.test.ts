import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeDb } from '@/lib/study/__tests__/fake-study-db';

/**
 * s09-10: each deletion function writes exactly one tombstone with its kind when it deleted something and none when it
 * deleted nothing; a deck writes one and no per-card tombstones; the prune keeps the window and works in batches.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tombstones: [] as { id: bigint; userId: string; kind: string; entityId: string; deletedAt: Date }[],
  highlights: [] as Row[],
  shelf: [] as Row[],
  saved: [] as Row[],
  deckDb: { decks: [], cards: [], reviews: [], writes: 0, locks: [], nextId: 1 } as unknown,
  seq: 0n,
  deleteManyCalls: [] as number[],
}));

const matches = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return (v as Row[]).every((w) => matches(row, w));
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    const value = row[k];
    if (v instanceof Date) return value instanceof Date && value.getTime() === v.getTime();
    if (v && typeof v === 'object' && !(typeof v === 'bigint')) {
      const op = v as { in?: unknown[]; lt?: Date; gt?: Date | bigint };
      if (op.in) return op.in.includes(value);
      if (op.lt) return (value as Date) < op.lt;
      if (op.gt !== undefined) return (value as Date | bigint) > op.gt;
    }
    return value === v;
  });

vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('@/lib/study/__tests__/fake-study-db');
  const study = makeStudyPrisma(h.deckDb as FakeDb) as Record<string, unknown>;
  const tombstone = {
    create: async ({ data }: { data: { userId: string; kind: string; entityId: string; deletedAt: Date } }) => {
      h.tombstones.push({ id: ++h.seq, ...data });
      return {};
    },
    createMany: async ({ data }: { data: { userId: string; kind: string; entityId: string; deletedAt: Date }[] }) => {
      for (const d of data) h.tombstones.push({ id: ++h.seq, ...d });
      return { count: data.length };
    },
    findMany: async ({ where, take }: { where: Row; take?: number }) =>
      h.tombstones
        .filter((t) => matches(t as unknown as Row, where))
        .sort((a, b) => Number(a.id - b.id))
        .slice(0, take),
    deleteMany: async ({ where }: { where: Row }) => {
      const doomed = h.tombstones.filter((t) => matches(t as unknown as Row, where));
      h.deleteManyCalls.push(doomed.length);
      h.tombstones = h.tombstones.filter((t) => !doomed.includes(t));
      return { count: doomed.length };
    },
  };
  const del =
    (key: 'highlights' | 'shelf' | 'saved') =>
    async ({ where }: { where: Row }) => {
      const doomed = h[key].filter((r) => matches(r, where));
      h[key] = h[key].filter((r) => !doomed.includes(r));
      return { count: doomed.length };
    };
  const prisma: Record<string, unknown> = {
    ...study,
    syncTombstone: tombstone,
    readingHighlight: {
      findFirst: async ({ where }: { where: Row }) => h.highlights.find((r) => matches(r, where)) ?? null,
      deleteMany: del('highlights'),
    },
    readingHighlightPassage: { deleteMany: async () => ({ count: 0 }) },
    readingShelfEntry: { deleteMany: del('shelf') },
    savedItem: {
      findUnique: async ({ where }: { where: { userId_entityType_entityId: Row } }) =>
        h.saved.find((r) => matches(r, where.userId_entityType_entityId)) ?? null,
      findMany: async ({ where }: { where: Row }) => h.saved.filter((r) => matches(r, where)),
      deleteMany: del('saved'),
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock('@/lib/social/engagement-effects.server', () => ({ enqueueProgression: vi.fn() }));
vi.mock('@/lib/feed/audience.server', () => ({ canReadThread: async () => true }));

import { deleteHighlight } from '@/lib/reading/highlights.server';
import { removeShelf } from '@/lib/reading/shelves.server';
import { removeSave } from '@/lib/saves/saves.server';
import { setBookmark } from '@/lib/social/engagement.server';
import { deleteCard, deleteDeck } from '@/lib/study/deck-editor.server';
import { pruneTombstones, listTombstones, recordTombstone } from '@/lib/sync/tombstones.server';
import {
  TOMBSTONE_KINDS,
  TOMBSTONE_SCOPE,
  decodeTombstoneCursor,
  encodeTombstoneCursor,
  sinceExpired,
} from '@/lib/sync/tombstones';

const kinds = () => h.tombstones.map((t) => `${t.kind}:${t.entityId}`);

beforeEach(() => {
  const db = Object.assign(h.deckDb as FakeDb, newFakeDb());
  db.decks.push({ id: 'd1', userId: 'u1', title: 'Deck', description: null, isPublic: false, cardCount: 2 });
  db.cards.push(
    { id: 'c1', deckId: 'd1', front: 'a', back: 'b', position: 0 },
    { id: 'c2', deckId: 'd1', front: 'c', back: 'd', position: 1 },
  );
  h.tombstones = [];
  h.deleteManyCalls = [];
  h.highlights = [{ id: 'hl1', userId: 'u1', docKind: 'blog', docKey: 'p', isPublic: false }];
  h.shelf = [{ userId: 'u1', docSlug: 'meditations' }];
  h.saved = [{ id: 's1', userId: 'u1', entityType: 'rmhark', entityId: 'post1' }];
});

describe('the deletion functions write a tombstone from their own count', () => {
  it('a highlight: one tombstone, and none the second time', async () => {
    expect(await deleteHighlight('u1', 'hl1')).toBe(true);
    expect(kinds()).toEqual(['highlight:hl1']);
    expect(await deleteHighlight('u1', 'hl1')).toBe(false);
    expect(kinds()).toEqual(['highlight:hl1']);
  });

  it('another member’s highlight is not deleted and writes nothing', async () => {
    expect(await deleteHighlight('u2', 'hl1')).toBe(false);
    expect(h.tombstones).toHaveLength(0);
  });

  it('a shelf entry is tombstoned by its slug, once', async () => {
    expect(await removeShelf('u1', 'meditations')).toBe(true);
    expect(await removeShelf('u1', 'meditations')).toBe(false);
    expect(kinds()).toEqual(['shelf_entry:meditations']);
  });

  it('a bookmark removed from the feed is tombstoned by its post id', async () => {
    expect(await setBookmark('u1', 'post1', false)).toMatchObject({ bookmarked: false });
    expect(kinds()).toEqual(['bookmark:post1']);
    await setBookmark('u1', 'post1', false);
    expect(kinds()).toEqual(['bookmark:post1']);
  });

  it('a post bookmark removed through the saves API is tombstoned; other saves are not', async () => {
    h.saved.push({ id: 's2', userId: 'u1', entityType: 'rmhark', entityId: 'post2' });
    h.saved.push({ id: 's3', userId: 'u1', entityType: 'song', entityId: 'song1' });
    await removeSave('u1', 'rmhark', 'post2');
    await removeSave('u1', 'song' as never, 'song1');
    await removeSave('u1', 'rmhark', 'nothing');
    expect(kinds()).toEqual(['bookmark:post2']);
  });

  it('a card writes one card tombstone; a missing card writes none', async () => {
    expect(await deleteCard('u1', 'c1')).toEqual({ ok: true });
    expect(await deleteCard('u1', 'c1')).toMatchObject({ ok: false });
    expect(await deleteCard('u2', 'c2')).toMatchObject({ ok: false });
    expect(kinds()).toEqual(['card:c1']);
  });

  it('a deck writes one deck tombstone and none for its cards', async () => {
    expect(await deleteDeck('u1', 'd1')).toEqual({ ok: true });
    expect(await deleteDeck('u1', 'd1')).toMatchObject({ ok: false });
    expect(kinds()).toEqual(['deck:d1']);
  });

  it('a deck with pictures writes its one tombstone inside the transaction', async () => {
    (h.deckDb as FakeDb).cards[0]!.frontImageUrl = 'https://example.test/a.webp';
    expect(await deleteDeck('u1', 'd1')).toEqual({ ok: true });
    expect(kinds()).toEqual(['deck:d1']);
  });
});

describe('reading tombstones back', () => {
  const at = (d: string) => new Date(d);
  const seed = () => {
    h.tombstones = [
      { id: 1n, userId: 'u1', kind: 'card', entityId: 'a', deletedAt: at('2026-11-20T00:00:00Z') },
      { id: 2n, userId: 'u1', kind: 'card', entityId: 'b', deletedAt: at('2026-11-21T00:00:00Z') },
    ];
    h.seq = 2n;
  };

  it('stores only an id, a kind and a time', async () => {
    await recordTombstone((await import('@/lib/prisma.server')).prisma as never, 'u1', 'deck', 'd9');
    expect(Object.keys(h.tombstones[0]!).sort()).toEqual(['deletedAt', 'entityId', 'id', 'kind', 'userId']);
  });

  it('pages oldest first through a keyset cursor', async () => {
    seed();
    const now = at('2026-11-22T00:00:00Z');
    const first = await listTombstones('u1', 'card', { since: null, cursor: undefined, limit: 1 }, now);
    expect(first).not.toBe('invalid_cursor');
    if (first === 'invalid_cursor') return;
    expect(first.data.map((d) => d.id)).toEqual(['a']);
    expect(first.nextCursor).toBe(encodeTombstoneCursor(at('2026-11-20T00:00:00Z'), 1n));
    expect(decodeTombstoneCursor(first.nextCursor!)).toEqual({ deletedAt: at('2026-11-20T00:00:00Z'), id: 1n });
  });

  it('rejects a cursor that is not ours', async () => {
    expect(await listTombstones('u1', 'card', { since: null, cursor: '!!', limit: 5 })).toBe('invalid_cursor');
  });
});

describe('the window and the prune', () => {
  const now = new Date('2026-11-22T00:00:00Z');
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('a since older than 90 days is expired; 90 days exactly is not', () => {
    expect(sinceExpired(days(91), now)).toBe(true);
    expect(sinceExpired(days(90), now)).toBe(false);
    expect(sinceExpired(days(1), now)).toBe(false);
  });

  it('every kind has a read scope', () => {
    expect(TOMBSTONE_KINDS.map((k) => TOMBSTONE_SCOPE[k])).toEqual([
      'read:reading',
      'read:study',
      'read:study',
      'read:bookmarks',
      'read:reading',
    ]);
  });

  it('deletes only rows older than 90 days, in batches', async () => {
    h.tombstones = [];
    for (let i = 0; i < 7; i++) {
      h.tombstones.push({
        id: BigInt(i + 1),
        userId: 'u1',
        kind: 'card',
        entityId: `old${i}`,
        deletedAt: days(91 + i),
      });
    }
    h.tombstones.push({ id: 100n, userId: 'u1', kind: 'card', entityId: 'edge', deletedAt: days(90) });
    h.tombstones.push({ id: 101n, userId: 'u1', kind: 'card', entityId: 'new', deletedAt: days(1) });
    expect(await pruneTombstones(now, 3)).toBe(7);
    expect(h.deleteManyCalls).toEqual([3, 3, 1]);
    expect(h.tombstones.map((t) => t.entityId)).toEqual(['edge', 'new']);
  });
});

/* ------------------------------ source scan ------------------------------ */

const ROOT = join(__dirname, '..', '..', '..');
const MODELS = ['readingHighlight', 'flashcardDeck', 'flashcard', 'savedItem', 'readingShelfEntry'];
const CALL = new RegExp(`\\.(${MODELS.join('|')})\\.(delete|deleteMany)\\(`, 'g');

/** Files that delete rows of the five models, with how many calls and why that is right. */
const ALLOWED: Record<string, { calls: number; why: string }> = {
  'lib/reading/highlights.server.ts': {
    calls: 1,
    why: 'deleteHighlight: the tombstone is written in the same transaction',
  },
  'lib/reading/shelves.server.ts': { calls: 1, why: 'removeShelf: the tombstone follows the count' },
  'lib/study/deck-editor.server.ts': {
    calls: 4,
    why: 'deleteDeck (two statements, one tombstone each path), deleteCard, and the generated siblings an edit replaces (not API objects)',
  },
  'lib/study/deck-sync.server.ts': {
    calls: 1,
    why: 'applying a source update removes a card: tombstoned in the same transaction',
  },
  'lib/social/engagement.server.ts': { calls: 1, why: 'setBookmark: tombstoned in the same transaction' },
  'lib/saves/saves.server.ts': { calls: 1, why: 'removeSave: tombstoned for post bookmarks' },
  'lib/bulk/bulk.server.ts': { calls: 1, why: 'clear-bookmarks: tombstones every removed post id' },
  'lib/account/erasure-coverage.server.ts': {
    calls: 2,
    why: 'account erasure: the member and their tombstones are erased together',
  },
  'lib/account/erasure-private.server.ts': {
    calls: 1,
    why: 'account erasure: the member and their tombstones are erased together',
  },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('every deletion of the five models is accounted for', () => {
  it('no file outside the deletion functions deletes them unlisted', () => {
    const found: Record<string, number> = {};
    for (const top of ['lib', 'server', 'app', 'features', 'scripts']) {
      for (const file of walk(join(ROOT, top))) {
        const n = (readFileSync(file, 'utf8').match(CALL) ?? []).length;
        if (n > 0) found[file.slice(ROOT.length + 1)] = n;
      }
    }
    expect(Object.fromEntries(Object.entries(found).map(([f, n]) => [f, n]))).toEqual(
      Object.fromEntries(Object.entries(ALLOWED).map(([f, a]) => [f, a.calls])),
    );
  });
});
