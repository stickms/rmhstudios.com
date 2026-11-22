/**
 * The review queue draws from public decks too, so it must send a sound only on the member's own cards (s10-02): a
 * card of someone else's public deck carries neither sound field. A generated reverse card reads its source's
 * sounds with the sides swapped; a cloze sibling reads the back sound only.
 */
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ scheduled: [] as unknown[] }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    flashcardReview: { findMany: vi.fn(async () => rows.scheduled), count: vi.fn(async () => 0) },
    flashcard: { findMany: vi.fn(async () => [] as unknown[]), count: vi.fn(async () => 0) },
    $queryRaw: vi.fn(async () => [] as unknown[]),
  },
}));

const { reviewQueue } = await import('@/lib/study/queue.server');

const NONE = {
  frontImageUrl: null,
  frontImageAlt: null,
  backImageUrl: null,
  backImageAlt: null,
  frontSoundUrl: null,
  frontSoundText: null,
  frontSoundMs: null,
  backSoundUrl: null,
  backSoundText: null,
  backSoundMs: null,
};
const FRONT = { frontSoundUrl: '/api/study/card-sound/me-f.webm', frontSoundText: 'front words', frontSoundMs: 900 };
const BACK = { backSoundUrl: '/api/study/card-sound/me-b.webm', backSoundText: 'back words', backSoundMs: 1100 };

const card = (id: string, ownerId: string, over: Record<string, unknown> = {}) => ({
  id,
  front: 'f',
  back: 'b',
  kind: 'basic',
  sourceId: null,
  clozeIndex: null,
  deckId: `deck-${ownerId}`,
  ...NONE,
  source: null,
  deck: { title: 'Deck', userId: ownerId },
  ...over,
});

describe('reviewQueue and sounds', () => {
  it('sends a sound on the member’s own card, and none on a card of someone else’s public deck', async () => {
    rows.scheduled = [
      { dueAt: new Date('2026-01-01'), card: card('mine', 'me', { ...FRONT, ...BACK }) },
      { dueAt: new Date('2026-01-01'), card: card('theirs', 'author', { ...FRONT, ...BACK }) },
    ];
    const { cards } = await reviewQueue('me', undefined, new Date('2026-02-01'));
    const mine = cards.find((c) => c.id === 'mine')!;
    const theirs = cards.find((c) => c.id === 'theirs')!;
    expect(mine.frontSound).toEqual({ url: FRONT.frontSoundUrl, transcript: 'front words', durationMs: 900 });
    expect(mine.backSound).toEqual({ url: BACK.backSoundUrl, transcript: 'back words', durationMs: 1100 });
    expect('frontSound' in theirs).toBe(false);
    expect('backSound' in theirs).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain('card-sound');
  });

  it('a card with no sound carries no sound field', async () => {
    rows.scheduled = [{ dueAt: new Date('2026-01-01'), card: card('plain', 'me') }];
    const { cards } = await reviewQueue('me', undefined, new Date('2026-02-01'));
    expect('frontSound' in cards[0]!).toBe(false);
    expect('backSound' in cards[0]!).toBe(false);
  });

  it('a reverse card swaps its source’s sides, and a cloze sibling takes the source’s back sound only', async () => {
    rows.scheduled = [
      {
        dueAt: new Date('2026-01-01'),
        card: card('rev', 'me', {
          kind: 'reversible',
          sourceId: 'src',
          source: { ...NONE, ...FRONT, ...BACK, back: 'b', occlusion: null },
        }),
      },
      {
        dueAt: new Date('2026-01-01'),
        card: card('cloze', 'me', {
          kind: 'cloze',
          sourceId: 'src2',
          clozeIndex: 1,
          front: 'The {{c1::heart}}',
          source: { ...NONE, ...BACK, back: '', occlusion: null },
        }),
      },
    ];
    const { cards } = await reviewQueue('me', undefined, new Date('2026-02-01'));
    const rev = cards.find((c) => c.id === 'rev')!;
    expect(rev.frontSound?.transcript).toBe('back words');
    expect(rev.backSound?.transcript).toBe('front words');
    const cloze = cards.find((c) => c.id === 'cloze')!;
    expect(cloze.backSound?.transcript).toBe('back words');
    expect('frontSound' in cloze).toBe(false);
  });

  it('a never-reviewed card of the member’s own deck carries its sound too (the new-card query reads the deck owner)', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    const findMany = prisma.flashcard.findMany as unknown as ReturnType<typeof vi.fn>;
    rows.scheduled = [];
    findMany.mockImplementationOnce(async (args: { select: { deck: { select: Record<string, true> } } }) => {
      // What the real query returns is exactly what it selects: no `userId` selected, none on the row.
      const deck: Record<string, unknown> = { title: 'Deck', newPerDay: null, extraNewDay: null, extraNew: 0 };
      if (args.select.deck.select.userId) deck.userId = 'me';
      return [{ ...card('fresh', 'me', FRONT), deck }];
    });
    const { cards } = await reviewQueue('me', undefined, new Date('2026-02-01'));
    expect(cards.find((c) => c.id === 'fresh')?.frontSound).toEqual({
      url: FRONT.frontSoundUrl,
      transcript: 'front words',
      durationMs: 900,
    });
  });
});
