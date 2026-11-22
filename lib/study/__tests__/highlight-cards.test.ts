import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDb } from './fake-study-db';

// Cards from reading highlights (s10-01): both sides belong to the member, the passage is a part of the stored
// highlight, the deck cap counts generated cloze siblings, and cards and links are written together or not at all.

interface Highlight {
  id: string;
  userId: string;
  exact: string;
  docKind: 'blog' | 'news' | 'library';
  docKey: string;
}
interface Link {
  cardId: string;
  highlightId: string;
}

const db = vi.hoisted(() => ({
  decks: [] as FakeDb['decks'],
  cards: [] as FakeDb['cards'],
  reviews: [] as FakeDb['reviews'],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
  highlights: [] as Highlight[],
  links: [] as Link[],
}));

vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const base = makeStudyPrisma(db as unknown as FakeDb);
  const readingHighlight = {
    findMany: async ({ where }: { where: { id: { in: string[] }; userId: string } }) =>
      db.highlights.filter((h) => where.id.in.includes(h.id) && h.userId === where.userId),
  };
  const highlightCardLink = {
    createMany: async ({ data }: { data: Link[] }) => {
      db.links.push(...data);
      db.writes++;
      return { count: data.length };
    },
  };
  return {
    prisma: {
      ...base,
      // The link table and the highlight table join the fake's transaction client.
      $transaction: (fn: (tx: object) => Promise<unknown>) =>
        base.$transaction((tx) => fn({ ...tx, readingHighlight, highlightCardLink })),
    },
  };
});

vi.mock('@/lib/reading/highlights.server', () => ({
  documentTitles: async () => new Map([['blog:post', 'On Tides']]),
}));

const { createCardsFromHighlights } = await import('@/lib/study/highlight-cards.server');

const ROOT = path.resolve(__dirname, '../../..');
const source = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const PASSAGE = 'The tide pulls twice daily, once toward the moon and once away.';

beforeEach(() => {
  Object.assign(db, { decks: [], cards: [], reviews: [], writes: 0, locks: [], nextId: 1, links: [] });
  db.decks.push({
    id: 'deck-mine',
    userId: 'me',
    title: 'Mine',
    description: null,
    isPublic: false,
    cardCount: 0,
  } as never);
  db.decks.push({
    id: 'deck-theirs',
    userId: 'them',
    title: 'Theirs',
    description: null,
    isPublic: false,
    cardCount: 0,
  } as never);
  db.highlights = [
    { id: 'h-mine', userId: 'me', exact: PASSAGE, docKind: 'blog', docKey: 'post' },
    { id: 'h-mine-2', userId: 'me', exact: 'A second passage about the sea.', docKind: 'blog', docKey: 'post' },
    { id: 'h-theirs', userId: 'them', exact: 'Private words.', docKind: 'blog', docKey: 'post' },
  ];
});

const basic = (highlightId = 'h-mine', text = PASSAGE) => ({
  highlightId,
  shape: 'basic' as const,
  text,
  front: 'What pulls the tide?',
});

describe('createCardsFromHighlights', () => {
  it('writes the card and its link under the deck lock, with the title on the back', async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [basic()]);
    expect(res).toMatchObject({ ok: true, created: 1, cardCount: 1 });
    expect(db.locks).toContain('deck-cards:deck-mine');
    expect(db.cards).toHaveLength(1);
    expect(db.cards[0]).toMatchObject({ kind: 'basic', front: 'What pulls the tide?', back: `${PASSAGE}\n— On Tides` });
    expect(db.links).toEqual([{ cardId: (db.cards[0] as { id: string }).id, highlightId: 'h-mine' }]);
  });

  it("refuses another member's highlight and writes nothing", async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [basic(), basic('h-theirs', 'Private words.')]);
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(db.cards).toHaveLength(0);
    expect(db.links).toHaveLength(0);
  });

  it("refuses another member's deck and a missing one", async () => {
    expect(await createCardsFromHighlights('me', 'deck-theirs', [basic()])).toMatchObject({ ok: false, status: 404 });
    expect(await createCardsFromHighlights('me', 'nope', [basic()])).toMatchObject({ ok: false, status: 404 });
    expect(db.cards).toHaveLength(0);
    expect(db.links).toHaveLength(0);
  });

  it('refuses a trimmed passage that is not part of the highlight', async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [
      basic('h-mine', 'The tide pulls three times daily'),
    ]);
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.cards).toHaveLength(0);
  });

  it('accepts a trimmed passage that is still part of the highlight', async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [basic('h-mine', '  once toward the moon  ')]);
    expect(res.ok).toBe(true);
    expect(db.cards[0]).toMatchObject({ back: 'once toward the moon\n— On Tides' });
  });

  it('counts a cloze card’s generated siblings against the deck cap', async () => {
    // 1,998 rows leave room for two more: a cloze card with three blanks is four rows, a basic card one.
    for (let i = 0; i < 1998; i++)
      db.cards.push({ id: `c${i}`, deckId: 'deck-mine', front: 'f', back: 'b', position: i });
    const cloze = {
      highlightId: 'h-mine',
      shape: 'cloze' as const,
      text: PASSAGE,
      deletions: [
        { from: 1, to: 1 },
        { from: 3, to: 3 },
        { from: 5, to: 5 },
      ],
    };
    expect(await createCardsFromHighlights('me', 'deck-mine', [cloze])).toMatchObject({
      ok: false,
      error: 'Deck is full',
    });
    expect(db.cards).toHaveLength(1998);
    expect(db.links).toHaveLength(0);
    expect((await createCardsFromHighlights('me', 'deck-mine', [basic()])).ok).toBe(true);
  });

  it('makes a cloze card with one sibling per blank and one link', async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [
      {
        highlightId: 'h-mine',
        shape: 'cloze',
        text: PASSAGE,
        deletions: [
          { from: 1, to: 1 },
          { from: 6, to: 6 },
        ],
      },
    ]);
    expect(res).toMatchObject({ ok: true, created: 1 });
    const authored = db.cards.filter((c) => !(c as { sourceId?: string }).sourceId);
    expect(authored).toHaveLength(1);
    expect(authored[0]).toMatchObject({
      kind: 'cloze',
      front: 'The {{c1::tide}} pulls twice daily, once {{c2::toward}} the moon and once away.',
    });
    expect(db.cards).toHaveLength(3);
    expect(db.links).toHaveLength(1);
  });

  it('writes N cards and N links in one call, in the order given, and counts them on the deck', async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [
      basic('h-mine'),
      basic('h-mine-2', 'A second passage about the sea.'),
      basic('h-mine'),
    ]);
    expect(res).toMatchObject({ ok: true, created: 3, cardCount: 3 });
    expect(db.cards).toHaveLength(3);
    expect(db.links.map((l) => l.highlightId)).toEqual(['h-mine', 'h-mine-2', 'h-mine']);
    expect(new Set(db.links.map((l) => l.cardId)).size).toBe(3);
    // The same highlight twice is allowed: a second card.
    expect(db.links.filter((l) => l.highlightId === 'h-mine')).toHaveLength(2);
  });

  it('writes nothing when any one item is refused', async () => {
    const res = await createCardsFromHighlights('me', 'deck-mine', [basic(), { ...basic('h-mine-2'), front: '   ' }]);
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.cards).toHaveLength(0);
    expect(db.links).toHaveLength(0);
  });

  it('refuses an empty or oversized batch', async () => {
    expect(await createCardsFromHighlights('me', 'deck-mine', [])).toMatchObject({ ok: false, status: 400 });
    const fifty1 = Array.from({ length: 51 }, () => basic());
    expect(await createCardsFromHighlights('me', 'deck-mine', fifty1)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('how the pieces are held together', () => {
  it("takes the deck editor's own lock, not a copy of its key", () => {
    const src = source('lib/study/highlight-cards.server.ts');
    expect(src).toContain('lockDeckCards(tx, deckId)');
    expect(src).not.toContain('deck-cards:');
  });

  it('is a write-limited, validated, registered endpoint', () => {
    const route = source('lib/study/api/study.highlight-cards.server.ts');
    expect(route).toContain("rateLimit: 'write'");
    expect(route).toContain('body: createHighlightCardsBody');
    expect(route).toContain("apiRoute('/api/study/highlight-cards'");
  });

  it('leaves deck cloning and the deck editor alone: neither mentions the link', () => {
    for (const file of [
      'lib/study/deck-sync.server.ts',
      'lib/study/deck-editor.server.ts',
      'lib/study/api/study.decks.$id.clone.server.ts',
    ]) {
      expect(source(file), file).not.toMatch(/highlightLink|HighlightCardLink|highlightCardLink/);
    }
    // A copy's cards are built field by field (never from a relation), so no link row can ride along.
    expect(source('lib/study.server.ts')).not.toMatch(/highlightCardLink\.(create|update)/);
  });

  it('shows "From:" to the deck owner only', () => {
    const study = source('lib/study.server.ts');
    expect(study).toContain('isOwner ? await highlightSources(');
    expect(study).toMatch(/sources\.get\(c\.id\)/);
    // A link to a highlight the owner does not own is ignored.
    expect(study).toContain('c.highlightLink.highlight.userId === ownerId');
  });

  it('computes "In <deck>" for the requesting member in one query, with the owner condition repeated', () => {
    const reading = source('lib/reading/highlights.server.ts');
    expect(reading).toContain('highlight: { userId }');
    expect(reading.match(/highlightCardLink\.findMany/g)).toHaveLength(1);
  });

  it('writes no raw SQL', () => {
    for (const file of ['lib/study/highlight-cards.server.ts', 'lib/study/api/study.highlight-cards.server.ts']) {
      expect(source(file), file).not.toMatch(/\$(queryRaw|executeRaw)/);
    }
  });

  it('declares the table with the names the migration uses', () => {
    const schema = source('prisma/schema/rmhstudy.prisma');
    expect(schema).toContain('@@map("highlight_card_link")');
    const sql = source('prisma/migrations/20261130010100_s10_highlight_cards/migration.sql');
    expect(sql).toContain('CREATE TABLE "highlight_card_link"');
    expect(sql).toContain('"highlight_card_link_cardId_key"');
    expect(sql).toMatch(/"cardId_fkey".*ON DELETE CASCADE|highlight_card_link_cardId_fkey.*ON DELETE CASCADE/);
    expect(sql).toMatch(/highlight_card_link_highlightId_fkey.*ON DELETE CASCADE/);
  });
});
