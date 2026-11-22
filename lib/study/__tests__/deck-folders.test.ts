import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deck folders (s07-09): the 30-folder cap under concurrent creates, ownership of both the deck and the folder on
 * a move, deleting a folder keeping its decks, no folder in any public payload, and the review queue's folder filter.
 */

interface Folder {
  id: string;
  userId: string;
  name: string;
  position: number;
  collapsed: boolean;
  createdAt: Date;
}
interface Deck {
  id: string;
  userId: string;
  folderId: string | null;
  isPublic: boolean;
}

const state = vi.hoisted(() => ({
  folders: [] as Folder[],
  decks: [] as Deck[],
  deleted: [] as unknown[],
  tails: new Map<string, Promise<void>>(),
  reviewFindMany: [] as unknown[],
  cardFindMany: [] as unknown[],
  seq: 0,
}));

const yieldTurn = () => new Promise<void>((r) => setTimeout(r, 0));

const prismaMock = vi.hoisted(() => {
  const matchFolder = (f: Folder, w: Record<string, unknown>) =>
    (w.id === undefined || w.id === f.id) && (w.userId === undefined || w.userId === f.userId);
  const deckFolder = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      await yieldTurn();
      return state.folders.filter((f) => matchFolder(f, where)).sort((a, b) => a.position - b.position);
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      state.folders.find((f) => matchFolder(f, where)) ?? null,
    create: async ({ data }: { data: Omit<Folder, 'id' | 'collapsed' | 'createdAt'> }) => {
      const row = { id: `f${++state.seq}`, collapsed: false, createdAt: new Date(), ...data };
      state.folders.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Folder> }) => {
      const rows = state.folders.filter((f) => matchFolder(f, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      state.deleted.push(where);
      const rows = state.folders.filter((f) => matchFolder(f, where));
      state.folders = state.folders.filter((f) => !rows.includes(f));
      // The database's ON DELETE SET NULL.
      for (const d of state.decks) if (rows.some((r) => r.id === d.folderId)) d.folderId = null;
      return { count: rows.length };
    },
  };
  const flashcardDeck = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; userId: string; user?: { deckFolders: { some: { id: string } } } };
      data: { folderId: string | null };
    }) => {
      const rows = state.decks.filter((d) => {
        if (d.id !== where.id || d.userId !== where.userId) return false;
        const need = where.user?.deckFolders.some.id;
        return need === undefined || state.folders.some((f) => f.id === need && f.userId === d.userId);
      });
      rows.forEach((r) => (r.folderId = data.folderId));
      return { count: rows.length };
    },
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: async () => [],
    findUnique: async ({ where }: { where: { id: string } }) => {
      const d = state.decks.find((x) => x.id === where.id);
      return d
        ? { ...d, title: 't', description: null, cardCount: 0, clonedFromId: null, notifyUpdates: true, cards: [] }
        : null;
    },
  };
  const flashcardReview = {
    findMany: async (args: unknown) => {
      state.reviewFindMany.push(args);
      return [];
    },
  };
  const flashcard = {
    findMany: async (args: unknown) => {
      state.cardFindMany.push(args);
      return [];
    },
  };
  const tx = { deckFolder, flashcardDeck, __tx: true };
  return {
    deckFolder,
    flashcardDeck,
    flashcardReview,
    flashcard,
    $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

// A per-key mutex stands in for pg_advisory_xact_lock: held until the transaction callback settles.
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    const prev = state.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    state.tails.set(key, new Promise<void>((r) => (release = r)));
    await prev;
    // Released at the end of this macrotask chain: the callers below finish well within a few turns.
    setTimeout(release, 20);
  },
}));

import { createFolder, deleteFolder, moveDeck, moveFolder, ownsFolder, renameFolder } from '@/lib/study/folders.server';
import { reviewQueue } from '@/lib/study/queue.server';
import { getDeck, listMarketplaceDecks } from '@/lib/study.server';

const ROOT = join(__dirname, '..', '..', '..');

beforeEach(() => {
  state.folders = [];
  state.decks = [];
  state.deleted = [];
  state.tails = new Map();
  state.reviewFindMany = [];
  state.cardFindMany = [];
  state.seq = 0;
});

function seedFolders(userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    state.folders.push({
      id: `${userId}-seed${i}`,
      userId,
      name: `Folder ${i}`,
      position: i,
      collapsed: false,
      createdAt: new Date(),
    });
  }
}

describe('folder CRUD', () => {
  it('creates folders in order and refuses a duplicate name ignoring case', async () => {
    const a = await createFolder('u1', '  Biology   201 ');
    expect(a).toMatchObject({ ok: true, folder: { name: 'Biology 201', position: 0 } });
    expect(await createFolder('u1', 'Spanish')).toMatchObject({ ok: true, folder: { position: 1 } });
    expect(await createFolder('u1', 'biology 201')).toMatchObject({ ok: false, status: 409, error: 'Name taken' });
    // Another member may use the same name.
    expect(await createFolder('u2', 'Biology 201')).toMatchObject({ ok: true });
  });

  it('refuses an empty or over-long name', async () => {
    expect(await createFolder('u1', '   ')).toMatchObject({ ok: false, status: 400 });
    expect(await createFolder('u1', 'x'.repeat(41))).toMatchObject({ ok: false, status: 400 });
  });

  it('stops at 30 folders, and two concurrent creates at 29 make exactly one more', async () => {
    seedFolders('u1', 29);
    const [a, b] = await Promise.all([createFolder('u1', 'Alpha'), createFolder('u1', 'Beta')]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(state.folders.filter((f) => f.userId === 'u1')).toHaveLength(30);
    const failed = a.ok ? b : a;
    expect(failed).toMatchObject({ ok: false, status: 400, error: 'Too many folders' });
  });

  it('renames, moves and refuses a folder that is not the caller’s with a 404', async () => {
    await createFolder('u1', 'One');
    await createFolder('u1', 'Two');
    const two = state.folders[1]!;
    expect(await renameFolder('u1', two.id, 'Deux')).toEqual({ ok: true });
    expect(await renameFolder('u1', two.id, 'one')).toMatchObject({ ok: false, status: 409 });
    expect(await moveFolder('u1', two.id, 'up')).toEqual({ ok: true });
    expect(state.folders.find((f) => f.name === 'Deux')!.position).toBe(0);
    expect(await renameFolder('u2', two.id, 'Mine')).toEqual({ ok: false, status: 404, error: 'Not found' });
    expect(await moveFolder('u2', two.id, 'down')).toMatchObject({ ok: false, status: 404 });
    expect(await deleteFolder('u2', two.id)).toMatchObject({ ok: false, status: 404 });
    expect(state.folders).toHaveLength(2);
  });
});

describe('moving a deck', () => {
  beforeEach(() => {
    state.folders.push({ id: 'fa', userId: 'u1', name: 'A', position: 0, collapsed: false, createdAt: new Date() });
    state.folders.push({ id: 'fb', userId: 'u2', name: 'B', position: 0, collapsed: false, createdAt: new Date() });
    state.decks.push({ id: 'd1', userId: 'u1', folderId: null, isPublic: false });
    state.decks.push({ id: 'd2', userId: 'u2', folderId: null, isPublic: true });
  });

  it('puts an owned deck in an owned folder and back to none', async () => {
    expect(await moveDeck('u1', 'd1', 'fa')).toEqual({ ok: true });
    expect(state.decks[0]!.folderId).toBe('fa');
    expect(await moveDeck('u1', 'd1', null)).toEqual({ ok: true });
    expect(state.decks[0]!.folderId).toBeNull();
  });

  it('refuses another member’s folder', async () => {
    expect(await moveDeck('u1', 'd1', 'fb')).toEqual({ ok: false, status: 404, error: 'Not found' });
    expect(state.decks[0]!.folderId).toBeNull();
  });

  it('refuses another member’s deck, even into the caller’s own folder', async () => {
    expect(await moveDeck('u1', 'd2', 'fa')).toMatchObject({ ok: false, status: 404 });
    expect(await moveDeck('u1', 'd2', null)).toMatchObject({ ok: false, status: 404 });
    expect(state.decks[1]!.folderId).toBeNull();
  });

  it('deleting a folder keeps its decks and leaves them with no folder', async () => {
    await moveDeck('u1', 'd1', 'fa');
    expect(await deleteFolder('u1', 'fa')).toEqual({ ok: true });
    expect(state.decks).toHaveLength(2);
    expect(state.decks[0]!.folderId).toBeNull();
    expect(prismaMock.flashcardDeck.delete).not.toHaveBeenCalled();
    expect(prismaMock.flashcardDeck.deleteMany).not.toHaveBeenCalled();
    expect(state.deleted).toEqual([{ id: 'fa', userId: 'u1' }]);
  });

  it('relies on a database rule that sets the deck’s folder to null on delete', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema/rmhstudy.prisma'), 'utf8');
    expect(schema).toMatch(
      /folder\s+DeckFolder\?\s+@relation\(fields: \[folderId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(schema).toMatch(/@@index\(\[userId, folderId\]\)/);
    expect(schema).toMatch(/@@map\("deck_folder"\)/);
  });

  it('ownsFolder answers false for an unknown or foreign folder', async () => {
    expect(await ownsFolder('u1', 'fa')).toBe(true);
    expect(await ownsFolder('u1', 'fb')).toBe(false);
    expect(await ownsFolder('u1', 'nope')).toBe(false);
  });
});

describe('a folder never appears in a public payload', () => {
  it('leaves folderId out of the deck page for any viewer but the owner', async () => {
    state.decks.push({ id: 'd1', userId: 'u1', folderId: 'fa', isPublic: true });
    const stranger = await getDeck('d1', { id: null });
    expect(stranger?.deck).not.toHaveProperty('folderId');
    expect(JSON.stringify(stranger)).not.toContain('fa"');
  });

  it('does not select it in the marketplace, and no developer API file mentions it', async () => {
    await listMarketplaceDecks(null, null);
    const src = readFileSync(join(ROOT, 'lib/study.server.ts'), 'utf8');
    const market = src.slice(
      src.indexOf('export async function listMarketplaceDecks'),
      src.indexOf('export async function listMarketplaceDecks') + 2500,
    );
    expect(market).not.toContain('folderId');
    for (const file of ['lib/api/openapi.ts', 'lib/study/api/study.marketplace.server.ts']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toMatch(/folderId|deckFolder/);
    }
    const v1 = join(ROOT, 'app/routes/api/v1');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const f of walk(v1)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/folderId|deckFolder/);
  });
});

describe('the review queue’s folder filter', () => {
  const now = new Date('2026-11-27T12:00:00Z');

  it('draws scheduled and new cards only from the member’s decks in that folder', async () => {
    await reviewQueue('u1', undefined, now, 'fa');
    const scheduled = state.reviewFindMany[0] as { where: { card: { deck: unknown } } };
    expect(scheduled.where.card.deck).toEqual({ userId: 'u1', folderId: 'fa' });
    const fresh = state.cardFindMany[0] as { where: { deck: unknown } };
    expect(fresh.where.deck).toEqual({ userId: 'u1', folderId: 'fa' });
  });

  it('without a folder keeps reading every readable deck', async () => {
    await reviewQueue('u1', undefined, now);
    const scheduled = state.reviewFindMany[0] as { where: { card: { deck: unknown } } };
    expect(scheduled.where.card.deck).toEqual({ OR: [{ isPublic: true }, { userId: 'u1' }] });
    const fresh = state.cardFindMany[0] as { where: { deck: unknown } };
    expect(fresh.where.deck).toEqual({ userId: 'u1' });
  });

  it('the review route answers 404 for a folder that is not the caller’s', () => {
    const src = readFileSync(join(ROOT, 'lib/study/api/study.review.server.ts'), 'utf8');
    expect(src).toMatch(/ownsFolder/);
    expect(src).toMatch(/status:\s*404/);
  });
});
