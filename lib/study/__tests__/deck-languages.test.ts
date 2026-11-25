import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeDb } from './fake-study-db';

// A deck's languages (s11-17) describe its cards, so only the owner sets them, a copy takes them along, and applying
// the author's updates never changes them afterwards. A tag Listen cannot read is refused.

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_POLICIES: {}, rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return { prisma: { ...prisma, $queryRaw: vi.fn(async () => [] as unknown[]) } };
});

const { addCard, updateDeck } = await import('@/lib/study/deck-editor.server');
const { cloneDeck, getDeck } = await import('@/lib/study.server');
const { applyUpdates, deckUpdates } = await import('@/lib/study/deck-sync.server');
const { updateDeckBody } = await import('@/lib/study/decks-schema');
const { DECK_LANGUAGE_TAGS } = await import('@/lib/study/listen');

const deckOf = (id: string) => db.decks.find((d) => d.id === id)!;

beforeEach(async () => {
  Object.assign(db, newFakeDb());
  db.decks = [
    {
      id: 'pub',
      userId: 'author',
      title: 'Spanish',
      description: null,
      isPublic: true,
      cardCount: 0,
      frontLang: 'es-ES',
      backLang: 'en-US',
    },
  ];
  const made = await addCard('author', 'pub', { front: 'hola', back: 'hello' });
  if (!made.ok) throw new Error(made.error);
});

describe('only the owner sets a deck’s languages', () => {
  it('the owner sets and clears them', async () => {
    expect(await updateDeck('author', 'pub', { frontLang: 'fr-FR', backLang: null })).toEqual({ ok: true });
    expect(deckOf('pub')).toMatchObject({ frontLang: 'fr-FR', backLang: null });
  });

  it('anyone else gets a 404 and nothing changes', async () => {
    for (const who of ['me', 'editor']) {
      expect(await updateDeck(who, 'pub', { frontLang: 'de-DE' })).toMatchObject({ ok: false, status: 404 });
    }
    expect(deckOf('pub')).toMatchObject({ frontLang: 'es-ES', backLang: 'en-US' });
  });

  it('an invalid tag is refused by the schema and again by the server', async () => {
    for (const bad of ['xx', 'english', 'EN', 'es_ES', 'es-ES; DROP', 'x'.repeat(40), 5, '']) {
      expect(updateDeckBody.safeParse({ frontLang: bad }).success, String(bad)).toBe(false);
    }
    expect(await updateDeck('author', 'pub', { backLang: 'klingon' })).toMatchObject({ ok: false, status: 400 });
    expect(deckOf('pub')).toMatchObject({ frontLang: 'es-ES', backLang: 'en-US' });
  });

  it('the schema takes every listed tag and null, and a languages-only patch is a patch', () => {
    for (const tag of DECK_LANGUAGE_TAGS) expect(updateDeckBody.safeParse({ frontLang: tag }).success, tag).toBe(true);
    expect(updateDeckBody.safeParse({ backLang: null }).success).toBe(true);
    expect(updateDeckBody.safeParse({}).success).toBe(false);
  });
});

describe('copies and updates', () => {
  it('a clone copies both languages', async () => {
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    expect(deckOf(cloned.id)).toMatchObject({ frontLang: 'es-ES', backLang: 'en-US' });
    const detail = await getDeck(cloned.id, { id: 'me' });
    expect(detail?.deck).toMatchObject({ frontLang: 'es-ES', backLang: 'en-US' });
  });

  it('a clone of a deck with no languages has none', async () => {
    deckOf('pub').frontLang = null;
    deckOf('pub').backLang = undefined;
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const detail = await getDeck(cloned.id, { id: 'me' });
    expect(detail?.deck.frontLang ?? null).toBeNull();
    expect(detail?.deck.backLang ?? null).toBeNull();
  });

  it('applying the author’s updates leaves a copy’s languages alone, whatever the author changes', async () => {
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    // The copier picks their own; the author then changes theirs and adds a card.
    expect(await updateDeck('me', cloned.id, { frontLang: 'pt-BR' })).toEqual({ ok: true });
    expect(await updateDeck('author', 'pub', { frontLang: 'it-IT', backLang: 'fr-FR' })).toEqual({ ok: true });
    await addCard('author', 'pub', { front: 'adios', back: 'bye' });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    const added = detail.diff.added.find((a) => a.card.front === 'adios')!;
    const applied = await applyUpdates('me', cloned.id, [{ type: 'new', sourceCardId: added.sourceCardId }]);
    expect(applied).toMatchObject({ ok: true, applied: 1 });
    expect(deckOf(cloned.id)).toMatchObject({ frontLang: 'pt-BR', backLang: 'en-US' });
  });

  it('the deck page tells every reader the languages, and an unknown stored tag reads as none', async () => {
    expect((await getDeck('pub', { id: null }))?.deck).toMatchObject({ frontLang: 'es-ES', backLang: 'en-US' });
    deckOf('pub').frontLang = 'xx-old';
    expect((await getDeck('pub', { id: 'me' }))?.deck.frontLang).toBeNull();
  });
});
