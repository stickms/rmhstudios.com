import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardHash } from '@/lib/study/deck-sync';
import type { FakeDb } from './fake-study-db';

// A copied deck and its author's changes: only the copy's owner reads or applies, a source that is no longer shared
// offers nothing, an apply keeps each card's row and review, an edited card is a conflict and never overwritten, a stale
// row is skipped, the card cap holds, and the deck lock is the first thing an apply takes.

const db: FakeDb = vi.hoisted(() => ({
  decks: [],
  cards: [],
  reviews: [],
  writes: 0,
  locks: [],
  nextId: 1,
})) as FakeDb;

vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  return {
    prisma: makeStudyPrisma(db),
  };
});
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: async () => [] as string[],
}));

const { applyUpdates, deckUpdates, deckUpdatesSummary, linkToOriginal } = await import('@/lib/study/deck-sync.server');
const { updateCard } = await import('@/lib/study/deck-editor.server');

const basic = (front: string, back: string) => ({
  kind: 'basic',
  front,
  back,
});
const at = (id: string, deckId: string, position: number, front: string, back: string, extra = {}) => ({
  id,
  deckId,
  front,
  back,
  position,
  ...extra,
});

const NOW = new Date('2026-11-20T12:00:00Z');
const EARLIER = new Date('2026-11-01T12:00:00Z');
const LATER = new Date('2026-11-10T12:00:00Z');

beforeEach(() => {
  db.decks = [
    {
      id: 'src',
      userId: 'author',
      title: 'Source',
      description: null,
      isPublic: true,
      cardCount: 2,
    },
    {
      id: 'cp',
      userId: 'me',
      title: 'Copy',
      description: null,
      isPublic: false,
      cardCount: 2,
      clonedFromId: 'src',
      sourceSyncedAt: EARLIER,
    },
  ];
  db.cards = [
    at('s1', 'src', 0, 'Capital of France', 'Paris'),
    at('s2', 'src', 1, 'Capital of Spain', 'Madrid'),
    at('c1', 'cp', 0, 'Capital of France', 'Paris', {
      originCardId: 's1',
      originHash: cardHash(basic('Capital of France', 'Paris')),
    }),
    at('c2', 'cp', 1, 'Capital of Spain', 'Madrid', {
      originCardId: 's2',
      originHash: cardHash(basic('Capital of Spain', 'Madrid')),
    }),
  ];
  db.reviews = [
    {
      id: 'r1',
      cardId: 'c1',
      userId: 'me',
      dueAt: NOW,
    },
  ];
  db.writes = 0;
  db.locks = [];
});

const source = (id: string) => db.cards.find((c) => c.id === id)!;
const edit = (id: string, patch: Record<string, string>) => Object.assign(source(id), patch);

describe('who may read and apply', () => {
  it('only the copy owner reads the diff; a stranger and the author get 404', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    expect(await deckUpdates('stranger', 'cp')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await deckUpdates('author', 'cp')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await deckUpdates('me', 'src')).toMatchObject({
      ok: false,
      status: 404,
    });
    const mine = await deckUpdates('me', 'cp');
    expect(mine).toMatchObject({
      ok: true,
      state: 'ok',
    });
  });

  it('a stranger cannot apply and nothing is written', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    const result = await applyUpdates('stranger', 'cp', [
      {
        type: 'changed',
        cardId: 'c1',
        expectedHash: cardHash(basic('Capital of France', 'Paris')),
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(db.cards.find((c) => c.id === 'c1')!.back).toBe('Paris');
    expect(db.writes).toBe(0);
  });

  it('a source that is no longer public offers nothing and cannot be applied', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    db.decks[0]!.isPublic = false;
    expect(await deckUpdates('me', 'cp')).toMatchObject({
      ok: true,
      state: 'unavailable',
    });
    expect((await deckUpdatesSummary('me', 'cp'))?.state).toBe('unavailable');
    const result = await applyUpdates('me', 'cp', [
      {
        type: 'new',
        sourceCardId: 's1',
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(db.cards.find((c) => c.id === 'c1')!.back).toBe('Paris');
  });
});

describe('applying', () => {
  it('updates a changed card in place: same id, same review row', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    expect(detail.diff.changed.map((r) => r.cardId)).toEqual(['c1']);
    const row = detail.diff.changed[0]!;

    const result = await applyUpdates('me', 'cp', [
      {
        type: 'changed',
        cardId: 'c1',
        expectedHash: row.expectedHash,
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      applied: 1,
      skipped: [],
      leftOut: 0,
    });

    const c1 = db.cards.find((c) => c.id === 'c1')!;
    expect(c1.back).toBe('Paris, France');
    expect(c1.originHash).toBe(cardHash(basic('Capital of France', 'Paris, France')));
    expect(db.reviews).toEqual([
      {
        id: 'r1',
        cardId: 'c1',
        userId: 'me',
        dueAt: NOW,
      },
    ]);
    // Nothing is left pending, so the copy is stamped as in step.
    expect(db.decks[1]!.sourceSyncedAt!.getTime()).toBeGreaterThan(EARLIER.getTime());
  });

  it('adds new cards as new, never-reviewed cards that point at their source', async () => {
    db.cards.push(at('s3', 'src', 2, 'Capital of Italy', 'Rome'));
    const result = await applyUpdates('me', 'cp', [
      {
        type: 'new',
        sourceCardId: 's3',
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      applied: 1,
      leftOut: 0,
    });
    const added = db.cards.find((c) => c.originCardId === 's3')!;
    expect(added).toMatchObject({
      deckId: 'cp',
      front: 'Capital of Italy',
      back: 'Rome',
    });
    expect(db.reviews.some((r) => r.cardId === added.id)).toBe(false);
    expect(db.decks[1]!.cardCount).toBe(3);
    // Applying the same row twice does not copy it twice.
    const again = await applyUpdates('me', 'cp', [
      {
        type: 'new',
        sourceCardId: 's3',
      },
    ]);
    expect(again).toMatchObject({
      ok: true,
      applied: 0,
    });
    expect(db.cards.filter((c) => c.originCardId === 's3')).toHaveLength(1);
  });

  it('removes a card only when asked, and only if the author dropped it', async () => {
    db.cards = db.cards.filter((c) => c.id !== 's2');
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    expect(detail.diff.removed.map((r) => r.cardId)).toEqual(['c2']);
    expect(db.cards.some((c) => c.id === 'c2')).toBe(true);
    const row = detail.diff.removed[0]!;
    const result = await applyUpdates('me', 'cp', [
      {
        type: 'removed',
        cardId: 'c2',
        expectedHash: row.expectedHash,
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      applied: 1,
    });
    expect(db.cards.some((c) => c.id === 'c2')).toBe(false);
    expect(db.decks[1]!.cardCount).toBe(1);
  });
});

describe('conflicts', () => {
  it('a card the member edited is a conflict, not an overwrite', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    edit('c1', {
      back: 'Paris (my note)',
    });
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    expect(detail.diff.changed).toEqual([]);
    expect(detail.diff.conflicts.map((r) => r.cardId)).toEqual(['c1']);

    // The member never ticks it: it stays theirs, untouched.
    await applyUpdates('me', 'cp', []);
    expect(db.cards.find((c) => c.id === 'c1')!.back).toBe('Paris (my note)');
  });

  it('Keep mine leaves the card and settles it until the source changes again', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    edit('c1', {
      back: 'Paris (my note)',
    });
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    const row = detail.diff.conflicts[0]!;
    await applyUpdates('me', 'cp', [
      {
        type: 'conflict',
        cardId: 'c1',
        resolution: 'mine',
        expectedHash: row.expectedHash,
      },
    ]);
    expect(db.cards.find((c) => c.id === 'c1')!.back).toBe('Paris (my note)');
    const after = await deckUpdates('me', 'cp');
    if (!after.ok) throw new Error('expected ok');
    expect(after.diff.conflicts).toEqual([]);
    edit('s1', {
      back: 'Paris, the capital',
    });
    const next = await deckUpdates('me', 'cp');
    if (!next.ok) throw new Error('expected ok');
    expect(next.diff.conflicts.map((r) => r.cardId)).toEqual(['c1']);
  });

  it('Take theirs replaces the member edit in place', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    edit('c1', {
      back: 'Paris (my note)',
    });
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    const row = detail.diff.conflicts[0]!;
    const result = await applyUpdates('me', 'cp', [
      {
        type: 'conflict',
        cardId: 'c1',
        resolution: 'theirs',
        expectedHash: row.expectedHash,
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      applied: 1,
    });
    expect(db.cards.find((c) => c.id === 'c1')!.back).toBe('Paris, France');
    expect(db.reviews).toHaveLength(1);
  });
});

describe('the banner follows the source edit', () => {
  it('editing one source card stamps cardsChangedAt and the copy shows one changed card', async () => {
    // The author has not touched the deck since the copy synced: the check is skipped.
    db.decks[0]!.cardsChangedAt = EARLIER;
    db.decks[1]!.sourceSyncedAt = LATER;
    expect(await deckUpdatesSummary('me', 'cp')).toBeNull();

    const before = db.decks[0]!.cardsChangedAt;
    expect(
      await updateCard('author', 's1', {
        back: 'Paris, France',
      }),
    ).toEqual({
      ok: true,
    });
    expect(db.decks[0]!.cardsChangedAt!.getTime()).toBeGreaterThan(before!.getTime());

    expect(await deckUpdatesSummary('me', 'cp')).toEqual({
      state: 'updates',
      changed: 1,
      added: 0,
      removed: 0,
      conflicts: 0,
    });
  });

  it('a source never stamped (older than this release) is diffed', async () => {
    edit('s2', {
      front: 'Capital city of Spain',
    });
    expect(await deckUpdatesSummary('me', 'cp')).toMatchObject({
      state: 'updates',
      changed: 1,
    });
  });
});

describe('stale rows, the cap and the lock', () => {
  it('a row whose card changed since the dialog loaded is skipped and reported', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    const row = detail.diff.changed[0]!;
    edit('c1', {
      back: 'edited meanwhile',
    });
    const result = await applyUpdates('me', 'cp', [
      {
        type: 'changed',
        cardId: 'c1',
        expectedHash: row.expectedHash,
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      applied: 0,
      skipped: [
        {
          id: 'c1',
          reason: 'stale',
        },
      ],
    });
    expect(db.cards.find((c) => c.id === 'c1')!.back).toBe('edited meanwhile');
  });

  it('applies as many new cards as fit under the cap and says how many were left out', async () => {
    for (let i = 0; i < 1996; i++) db.cards.push(at(`own${i}`, 'cp', 10 + i, `own ${i}`, 'x'));
    for (const n of [3, 4, 5]) db.cards.push(at(`s${n}`, 'src', n, `new ${n}`, 'y'));
    // 2 copied + 1996 own = 1998 rows; two more fit.
    const result = await applyUpdates('me', 'cp', [
      {
        type: 'new',
        sourceCardId: 's3',
      },
      {
        type: 'new',
        sourceCardId: 's4',
      },
      {
        type: 'new',
        sourceCardId: 's5',
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      applied: 2,
      leftOut: 1,
    });
    expect(db.cards.filter((c) => c.deckId === 'cp')).toHaveLength(2000);
    // One card is still pending, so the copy is not stamped as in step.
    expect(db.decks[1]!.sourceSyncedAt).toEqual(EARLIER);
  });

  it('takes the deck-sync lock before anything is written', async () => {
    edit('s1', {
      back: 'Paris, France',
    });
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    db.writes = 0;
    await applyUpdates('me', 'cp', [
      {
        type: 'changed',
        cardId: 'c1',
        expectedHash: detail.diff.changed[0]!.expectedHash,
      },
    ]);
    expect(db.locks[0]).toBe('deck-sync:cp');
  });
});

describe('linking a copy made before origins were recorded', () => {
  beforeEach(() => {
    for (const c of db.cards) {
      if (c.deckId === 'cp') {
        c.originCardId = null;
        c.originHash = null;
      }
    }
    db.cards.push(at('mine', 'cp', 5, 'My own card', 'z'));
  });

  it('asks for a link first, then matches by front and leaves unmatched cards alone', async () => {
    expect(await deckUpdates('me', 'cp')).toMatchObject({
      ok: true,
      state: 'needs-link',
    });
    edit('s1', {
      back: 'Paris, France',
    });
    expect(await linkToOriginal('stranger', 'cp')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await linkToOriginal('me', 'cp')).toMatchObject({
      ok: true,
      linked: 2,
      unmatched: 1,
    });
    expect(db.cards.find((c) => c.id === 'mine')!.originCardId ?? null).toBeNull();
    const detail = await deckUpdates('me', 'cp');
    if (!detail.ok) throw new Error('expected ok');
    expect(detail.state).toBe('ok');
    // The author's different wording is offered as a change, not a conflict.
    expect(detail.diff.changed.map((r) => r.cardId)).toEqual(['c1']);
    expect(detail.diff.conflicts).toEqual([]);
  });
});
