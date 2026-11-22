/**
 * Card types are a member's data: reversible and cloze cards generate sibling rows, each with its own
 * review state, and the owner's edits must regenerate them without losing a schedule that still applies.
 * Prisma is replaced by `fake-study-db.ts`, which models the self-relation and its cascade, so what is
 * asserted is the rows that end up in the tables.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { newFakeDb, type FakeDb } from './fake-study-db';

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;
const getSession = vi.hoisted(() => vi.fn());
const saveReview = vi.hoisted(() => vi.fn(async () => ({ leech: false })));
const queryRaw = vi.hoisted(() => vi.fn(async () => [] as unknown[]));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/study/review-log.server', () => ({ saveReview }));
vi.mock('@/lib/quests/engine.server', () => ({ recordStudyReview: vi.fn(async () => undefined) }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return {
    prisma: {
      ...prisma,
      $queryRaw: queryRaw,
      flashcardReviewLog: { findFirst: vi.fn(async () => null) },
    },
  };
});

const { addCard, deleteCard, importCards, reorderCards, updateCard } = await import('@/lib/study/deck-editor.server');
const { cloneDeck, getDeck, getTestCards } = await import('@/lib/study.server');
const { recordTestResult } = await import('@/lib/study/tests.server');
const { getStudyStats } = await import('@/lib/study/stats.server');
const { route: reviewQueue } = await import('@/lib/study/api/study.decks.$id.review.server');
const { route: gradeCard } = await import('@/lib/study/api/study.cards.$id.review.server');
const { MAX_DECK_CARDS } = await import('@/lib/study/limits');

type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const queue = handlersOf<H>(reviewQueue);
const grade = handlersOf<H>(gradeCard);
const headers = { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': '9.9.9.9' };

const TEXT = 'The capital of {{c1::France}} is {{c2::Paris}}.';

const rows = (deckId = 'mine') => db.cards.filter((c) => c.deckId === deckId);
const siblingsOf = (id: string) => db.cards.filter((c) => c.sourceId === id);
const authored = (deckId = 'mine') => rows(deckId).filter((c) => !c.sourceId);
const deck = (id = 'mine') => db.decks.find((d) => d.id === id)!;

beforeEach(() => {
  Object.assign(db, newFakeDb());
  db.decks = [
    { id: 'mine', userId: 'me', title: 'Mine', description: null, isPublic: false, cardCount: 0 },
    { id: 'theirs', userId: 'other', title: 'Theirs', description: null, isPublic: true, cardCount: 0 },
  ];
  getSession.mockResolvedValue({ user: { id: 'me' }, session: { id: 's' } });
  saveReview.mockClear();
  queryRaw.mockClear();
});

async function addCloze(text = TEXT) {
  const r = await addCard('me', 'mine', { kind: 'cloze', front: text });
  if (!r.ok) throw new Error(r.error);
  return r.card.id;
}

describe('saving a card', () => {
  it('a basic card creates one row and no sibling', async () => {
    const r = await addCard('me', 'mine', { front: ' hello ', back: ' bonjour ' });
    expect(r).toMatchObject({ ok: true, card: { front: 'hello', back: 'bonjour', kind: 'basic', sourceId: null } });
    expect(rows()).toHaveLength(1);
    expect(deck().cardCount).toBe(1);
  });

  it('a cloze card creates one sibling per deletion index, each pointing at the authored card', async () => {
    const id = await addCloze();
    expect(authored()).toHaveLength(1);
    expect(authored()[0]).toMatchObject({ id, kind: 'cloze', front: TEXT, back: '', sourceId: null });
    const siblings = siblingsOf(id);
    expect(siblings.map((s) => [s.kind, s.clozeIndex, s.back, s.front])).toEqual([
      ['cloze', 1, 'France', TEXT],
      ['cloze', 2, 'Paris', TEXT],
    ]);
    // The deck counts what was authored; the rows hold the generated cards too.
    expect(deck().cardCount).toBe(1);
    expect(rows()).toHaveLength(3);
  });

  it('a reversible card creates its reverse with the sides swapped, beside it in the deck', async () => {
    const r = await addCard('me', 'mine', { kind: 'reversible', front: 'chat', back: 'cat' });
    if (!r.ok) throw new Error();
    const [reverse] = siblingsOf(r.card.id);
    expect(reverse).toMatchObject({ kind: 'reversible', front: 'cat', back: 'chat', clozeIndex: null, sourceId: r.card.id });
    expect(reverse.position).toBe(rows().find((c) => c.id === r.card.id)!.position);
  });

  it('refuses an invalid card and writes nothing', async () => {
    for (const draft of [
      { kind: 'cloze' as const, front: 'no deletion here' },
      { kind: 'cloze' as const, front: '{{c1::a {{c2::b}}}}' },
      { kind: 'reversible' as const, front: 'one side only', back: '' },
      { front: 'front only' },
    ]) {
      expect(await addCard('me', 'mine', draft)).toEqual({ ok: false, status: 400, error: 'Invalid card' });
    }
    expect(db.writes).toBe(0);
  });

  it('refuses a foreign deck as not found', async () => {
    expect(await addCard('me', 'theirs', { front: 'a', back: 'b' })).toEqual({
      ok: false,
      status: 404,
      error: 'Not found',
    });
    expect(db.writes).toBe(0);
  });
});

describe('editing a card regenerates its siblings in place', () => {
  async function reviewed() {
    const id = await addCloze();
    const [c1, c2] = siblingsOf(id);
    db.reviews.push(
      { id: 'rev-c1', cardId: c1.id, userId: 'me' },
      { id: 'rev-c2', cardId: c2.id, userId: 'me' },
      { id: 'rev-other', cardId: c1.id, userId: 'someone-else' },
    );
    return { id, c1: c1.id, c2: c2.id };
  }

  it('dropping c2 removes only that card and its reviews; c1 keeps its id and its schedule', async () => {
    const { id, c1, c2 } = await reviewed();
    const next = 'The capital of {{c1::France}} is Paris.';
    expect(await updateCard('me', id, { front: next })).toEqual({ ok: true });
    expect(siblingsOf(id).map((s) => s.id)).toEqual([c1]);
    expect(db.cards.some((c) => c.id === c2)).toBe(false);
    expect(db.reviews.map((r) => r.id).sort()).toEqual(['rev-c1', 'rev-other']);
    // The surviving card shows the new text.
    expect(siblingsOf(id)[0].front).toBe(next);
    expect(authored()[0].front).toBe(next);
  });

  it('keeps the ids of every surviving index when the text changes and a new index is added', async () => {
    const { id, c1, c2 } = await reviewed();
    const next = `${TEXT} It lies on the {{c3::Seine}}.`;
    expect(await updateCard('me', id, { front: next })).toEqual({ ok: true });
    const after = siblingsOf(id);
    expect(after.map((s) => [s.clozeIndex, s.id === c1 || s.id === c2 || s.clozeIndex === 3])).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ]);
    expect(after.find((s) => s.clozeIndex === 1)!.id).toBe(c1);
    expect(after.find((s) => s.clozeIndex === 2)!.id).toBe(c2);
    expect(after.find((s) => s.clozeIndex === 3)!.back).toBe('Seine');
    expect(db.reviews).toHaveLength(3);
  });

  it('changing an answer updates the generated back in place', async () => {
    const { id, c1 } = await reviewed();
    await updateCard('me', id, { front: 'The capital of {{c1::Italy}} is {{c2::Paris}}.' });
    expect(db.cards.find((c) => c.id === c1)).toMatchObject({ back: 'Italy' });
  });

  it('editing a reversible card keeps its reverse and its review; becoming basic deletes both', async () => {
    const r = await addCard('me', 'mine', { kind: 'reversible', front: 'chat', back: 'cat' });
    if (!r.ok) throw new Error();
    const reverseId = siblingsOf(r.card.id)[0].id;
    db.reviews.push({ id: 'rev', cardId: reverseId, userId: 'me' });

    await updateCard('me', r.card.id, { back: 'feline' });
    expect(siblingsOf(r.card.id)[0]).toMatchObject({ id: reverseId, front: 'feline', back: 'chat' });
    expect(db.reviews).toHaveLength(1);

    await updateCard('me', r.card.id, { kind: 'basic' });
    expect(siblingsOf(r.card.id)).toHaveLength(0);
    expect(db.reviews).toHaveLength(0);
    expect(authored()[0].kind).toBe('basic');
  });

  it('an edit that makes the card invalid is refused and changes nothing', async () => {
    const { id } = await reviewed();
    const writes = db.writes;
    expect(await updateCard('me', id, { front: 'no deletions left' })).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid card',
    });
    expect(db.writes).toBe(writes);
    expect(siblingsOf(id)).toHaveLength(2);
  });

  it('takes the deck lock before it reads or writes', async () => {
    const { id } = await reviewed();
    db.locks = [];
    await updateCard('me', id, { front: 'The capital of {{c1::France}} is Paris.' });
    expect(db.locks).toEqual(['deck-cards:mine']);
  });

  it('non-owners are refused, and a generated card cannot be edited or deleted directly', async () => {
    const { id, c1 } = await reviewed();
    const writes = db.writes;
    expect(await updateCard('other', id, { front: '{{c1::hijack}}' })).toMatchObject({ ok: false, status: 404 });
    expect(await deleteCard('other', id)).toMatchObject({ ok: false, status: 404 });
    expect(await updateCard('me', c1, { front: '{{c1::x}}' })).toMatchObject({ ok: false, status: 404 });
    expect(await deleteCard('me', c1)).toMatchObject({ ok: false, status: 404 });
    expect(db.writes).toBe(writes);
    expect(siblingsOf(id)).toHaveLength(2);
  });
});

describe('deleting an authored card', () => {
  it('cascades to its siblings and every review, and lowers the count by one', async () => {
    const id = await addCloze();
    const [c1] = siblingsOf(id);
    db.reviews.push({ id: 'r', cardId: c1.id, userId: 'me' });
    const keep = await addCard('me', 'mine', { front: 'keep', back: 'me' });
    expect(deck().cardCount).toBe(2);

    expect(await deleteCard('me', id)).toEqual({ ok: true });
    expect(db.cards.map((c) => c.front)).toEqual(['keep']);
    expect(db.reviews).toEqual([]);
    expect(deck().cardCount).toBe(1);
    expect(keep.ok).toBe(true);
  });
});

describe('the deck cap counts every row, under the lock', () => {
  const fill = (n: number) => {
    for (let i = 0; i < n; i++) {
      db.cards.push({ id: `fill${i}`, deckId: 'mine', front: `f${i}`, back: `b${i}`, position: i });
    }
    deck().cardCount = n;
  };

  it('refuses a card whose generated cards would pass the cap, and accepts one that fits exactly', async () => {
    fill(MAX_DECK_CARDS - 3);
    db.locks = [];
    // One authored row and three generated ones would make 2,001.
    const over = await addCard('me', 'mine', { kind: 'cloze', front: '{{c1::a}} {{c2::b}} {{c3::c}}' });
    expect(over).toEqual({ ok: false, status: 400, error: 'Deck is full' });
    expect(db.locks).toEqual(['deck-cards:mine']);
    expect(rows()).toHaveLength(MAX_DECK_CARDS - 3);
    expect((await addCard('me', 'mine', { kind: 'cloze', front: '{{c1::a}} {{c2::b}}' })).ok).toBe(true);
    expect(rows()).toHaveLength(MAX_DECK_CARDS);
  });

  it('refuses an import whose generated cards pass the cap and writes nothing', async () => {
    fill(MAX_DECK_CARDS - 10);
    const writes = db.writes;
    const cards = Array.from({ length: 6 }, (_, i) => ({ kind: 'reversible' as const, front: `q${i}`, back: `a${i}` }));
    // Six reversible cards are twelve rows.
    expect(await importCards('me', 'mine', cards)).toEqual({ ok: false, status: 400, error: 'Deck is full' });
    expect(db.writes).toBe(writes);
    expect(await importCards('me', 'mine', cards.slice(0, 5))).toMatchObject({ ok: true, created: 5 });
    expect(rows()).toHaveLength(MAX_DECK_CARDS);
  });

  it('refuses an edit that adds generated cards past the cap', async () => {
    const id = await addCloze('{{c1::a}}');
    for (let i = 0; i < MAX_DECK_CARDS - 2; i++) {
      db.cards.push({ id: `pad${i}`, deckId: 'mine', front: 'p', back: 'p', position: 100 + i });
    }
    expect(rows()).toHaveLength(MAX_DECK_CARDS);
    expect(await updateCard('me', id, { front: '{{c1::a}} {{c2::b}}' })).toEqual({
      ok: false,
      status: 400,
      error: 'Deck is full',
    });
    expect(siblingsOf(id)).toHaveLength(1);
  });

  it('every write that can add rows takes the same lock key', async () => {
    db.locks = [];
    await addCard('me', 'mine', { front: 'a', back: 'b' });
    await importCards('me', 'mine', [{ front: 'c', back: 'd' }]);
    expect(db.locks).toEqual(['deck-cards:mine', 'deck-cards:mine']);
  });
});

describe('import', () => {
  it('generates siblings, counts authored cards in cardCount and returns that count', async () => {
    const r = await importCards('me', 'mine', [
      { front: 'a', back: 'b' },
      { kind: 'reversible', front: 'chat', back: 'cat' },
      { kind: 'cloze', front: TEXT },
    ]);
    expect(r).toEqual({ ok: true, created: 3, cardCount: 3 });
    expect(authored()).toHaveLength(3);
    // 3 authored + 1 reverse + 2 cloze.
    expect(rows()).toHaveLength(6);
    expect(authored().map((c) => c.position)).toEqual([0, 1, 2]);
    const cloze = authored().find((c) => c.kind === 'cloze')!;
    expect(siblingsOf(cloze.id).map((s) => s.clozeIndex)).toEqual([1, 2]);
  });

  it('refuses the whole import when one card is invalid', async () => {
    const r = await importCards('me', 'mine', [
      { front: 'ok', back: 'fine' },
      { kind: 'cloze', front: 'broken {{c1::' },
    ]);
    expect(r).toEqual({ ok: false, status: 400, error: 'Invalid import' });
    expect(db.writes).toBe(0);
  });
});

describe('order', () => {
  it('lists authored cards only and moves siblings with their source', async () => {
    const a = await addCloze('{{c1::a}}');
    const b = await addCard('me', 'mine', { front: 'b', back: 'b' });
    if (!b.ok) throw new Error();
    expect(await reorderCards('me', 'mine', [b.card.id, a])).toEqual({ ok: true });
    expect(authored().map((c) => c.id)).toEqual([a, b.card.id]);
    expect(rows().find((c) => c.id === a)!.position).toBe(1);
    expect(siblingsOf(a)[0].position).toBe(1);
    // A list that names a generated card is not the deck's authored cards.
    expect(await reorderCards('me', 'mine', [b.card.id, a, siblingsOf(a)[0].id])).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe('reading a deck', () => {
  it('getDeck lists authored cards and counts reviewable ones and every row separately', async () => {
    await addCloze();
    await addCard('me', 'mine', { kind: 'reversible', front: 'chat', back: 'cat' });
    await addCard('me', 'mine', { front: 'a', back: 'b' });
    const detail = (await getDeck('mine', { id: 'me' }))!;
    expect(detail.cards.map((c) => [c.kind, c.sourceId])).toEqual([
      ['cloze', null],
      ['reversible', null],
      ['basic', null],
    ]);
    expect(detail.deck.cardCount).toBe(3);
    // 2 cloze + reversible + its reverse + basic: the authored cloze text is not reviewed.
    expect(detail.reviewCount).toBe(5);
    expect(detail.rowCount).toBe(6);
    expect(detail.dueCount).toBe(5);
  });

  it('counts the due cards over reviewable cards only', async () => {
    const id = await addCloze();
    const [c1] = siblingsOf(id);
    db.reviews.push({ id: 'r', cardId: c1.id, userId: 'me', dueAt: new Date(Date.now() + 86_400_000) });
    expect((await getDeck('mine', { id: 'me' }))!.dueCount).toBe(1);
  });

  it('a private deck is not found for anyone else', async () => {
    expect(await getDeck('mine', { id: 'other' })).toBeNull();
    expect(await getDeck('mine', { id: null })).toBeNull();
  });

  it('getTestCards returns reviewable cards with the note they belong to', async () => {
    const id = await addCloze();
    const cards = await getTestCards('mine');
    expect(cards.map((c) => [c.clozeIndex, c.noteId])).toEqual([
      [1, id],
      [2, id],
    ]);
  });
});

describe('review', () => {
  it('the due queue holds the generated cards and never the authored cloze row', async () => {
    const id = await addCloze();
    await addCard('me', 'mine', { kind: 'reversible', front: 'chat', back: 'cat' });
    const res = await queue.GET!({
      params: { id: 'mine' },
      request: new Request('https://x.test/api/study/decks/mine/review', { headers }),
    });
    expect(res.status).toBe(200);
    const { due } = (await res.json()) as {
      due: { id: string; kind: string; clozeIndex: number | null; sourceId: string | null }[];
    };
    expect(due.map((c) => c.id)).not.toContain(id);
    expect(due.map((c) => [c.kind, c.clozeIndex, c.sourceId === null])).toEqual([
      ['cloze', 1, false],
      ['cloze', 2, false],
      ['reversible', null, true],
      ['reversible', null, false],
    ]);
  });

  it('each generated card is graded on its own: its review is keyed by that card', async () => {
    const id = await addCloze();
    const [c1, c2] = siblingsOf(id);
    const post = (cardId: string) =>
      grade.POST!({
        params: { id: cardId },
        request: new Request(`https://x.test/api/study/cards/${cardId}/review`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ grade: 3 }),
        }),
      });
    expect((await post(c1.id)).status).toBe(200);
    expect((await post(c2.id)).status).toBe(200);
    expect(saveReview.mock.calls.map((c) => (c as unknown as [{ cardId: string; deckId: string }])[0])).toMatchObject([
      { cardId: c1.id, deckId: 'mine' },
      { cardId: c2.id, deckId: 'mine' },
    ]);
  });

  it('an authored cloze card cannot be graded', async () => {
    const id = await addCloze();
    const res = await grade.POST!({
      params: { id },
      request: new Request(`https://x.test/api/study/cards/${id}/review`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ grade: 3 }),
      }),
    });
    expect(res.status).toBe(404);
    expect(saveReview).not.toHaveBeenCalled();
  });
});

describe('clone', () => {
  it('copies the authored cards and regenerates the siblings for the clone, with new ids', async () => {
    db.decks.push({ id: 'pub', userId: 'other', title: 'Pub', description: null, isPublic: true, cardCount: 0 });
    const made = await importCards('other', 'pub', [
      { front: 'a', back: 'b' },
      { kind: 'reversible', front: 'chat', back: 'cat' },
      { kind: 'cloze', front: TEXT },
    ]);
    expect(made).toMatchObject({ ok: true });
    const sourceRows = rows('pub').length;
    expect(sourceRows).toBe(6);

    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    expect(cloned.alreadyOwned).toBe(false);
    const copy = rows(cloned.id);
    expect(copy).toHaveLength(6);
    expect(authored(cloned.id).map((c) => [c.kind, c.front])).toEqual([
      ['basic', 'a'],
      ['reversible', 'chat'],
      ['cloze', TEXT],
    ]);
    expect(deck(cloned.id).cardCount).toBe(3);
    // The clone's siblings point at the clone's own authored cards.
    const ownIds = new Set(copy.map((c) => c.id));
    for (const s of copy.filter((c) => c.sourceId)) expect(ownIds.has(s.sourceId!)).toBe(true);
    const sourceIds = new Set(rows('pub').map((c) => c.id));
    expect(copy.some((c) => sourceIds.has(c.id))).toBe(false);
  });
});

describe('practice-test results', () => {
  it('a test cannot score more points than the deck has reviewable cards', async () => {
    await addCloze(); // 2 reviewable cards, plus the authored text row that is not one
    const input = { total: 3, correct: 1, kinds: ['written'], durationMs: 1000, missedCardIds: [], seed: 1 };
    expect(await recordTestResult('me', 'mine', input as never)).toEqual({
      ok: false,
      status: 400,
      error: 'Total exceeds the deck',
    });
    expect(await recordTestResult('me', 'mine', { ...input, total: 2 } as never)).toMatchObject({ ok: true });
  });

  it('an authored cloze row is not an accepted missed card', async () => {
    const id = await addCloze();
    const input = { total: 2, correct: 1, kinds: ['written'], durationMs: 1000, missedCardIds: [id], seed: 1 };
    expect(await recordTestResult('me', 'mine', input as never)).toEqual({
      ok: false,
      status: 400,
      error: 'Unknown card',
    });
  });
});

describe('statistics', () => {
  const schema = readFileSync('prisma/schema/rmhstudy.prisma', 'utf8');
  const flashcardModel = schema.slice(schema.indexOf('model Flashcard {'), schema.indexOf('model FlashcardReview {'));

  it('the raw SQL names the real table and quoted camelCase columns, and skips authored cloze rows', async () => {
    expect(flashcardModel).toContain('@@map("flashcard")');
    for (const column of ['kind', 'sourceId', 'deckId']) expect(flashcardModel).toMatch(new RegExp(`\\n\\s+${column}\\s`));

    await getStudyStats('me', { timeZone: 'UTC' });
    const sql = queryRaw.mock.calls.map((c) => (c as unknown as [TemplateStringsArray])[0].join('?')).join('\n');
    expect(sql).toContain(`JOIN flashcard c ON c."deckId" = d.id AND NOT (c.kind = 'cloze' AND c."sourceId" IS NULL)`);
    expect(sql).toContain('FROM flashcard_deck d');
    expect(sql).toContain('FROM flashcard_review_log');
  });
});
