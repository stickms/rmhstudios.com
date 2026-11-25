/**
 * The cards a room quiz is built from (s11-15). A quiz shows a deck's cards to everyone in the room, so the rule is who
 * may show them, and it runs here on the server, against the deck as it is when the host starts:
 *
 *  - a public deck: any host who may read it;
 *  - a private deck: only its owner (`deckRole` is `'owner'`), and only after confirming ("Everyone in this room will
 *    see these cards"). An editor of a private deck studies it but may not show it to a room, since the owner never
 *    agreed to that; a private deck the host may not study is refused like a missing one.
 *
 * Only text goes out: picture and occlusion cards are left out and every sound is dropped (a card's sounds are the
 * owner's own, heard by them alone, s10-02), so the result carries no picture or sound field at all.
 */
import { prisma } from '@/lib/prisma.server';
import { REVIEWABLE_WHERE, CARD_ORDER } from '@/lib/study/card-query.server';
import { noteIdOf } from '@/lib/study/card-types';
import { deckRole } from '@/lib/study/deck-access.server';
import type { TestCard } from '@/lib/study/practice-test';

export type QuizCardsRefusal = 'not-found' | 'private-editor' | 'confirm-required';

export type QuizCardsResult =
  { ok: true; deckTitle: string; cards: TestCard[] } | { ok: false; reason: QuizCardsRefusal };

/** A card a room may see: text only, no picture, no occlusion, no sound. */
export function roomSafeCards(cards: readonly TestCard[]): TestCard[] {
  return cards
    .filter((c) => !c.frontImage && !c.backImage && !c.occlusion)
    .map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      clozeIndex: c.clozeIndex ?? null,
      ...(c.noteId ? { noteId: c.noteId } : {}),
    }));
}

export async function loadQuizCards(
  hostUserId: string,
  deckId: string,
  options: { confirmPrivate: boolean },
): Promise<QuizCardsResult> {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { id: true, title: true, isPublic: true, userId: true },
  });
  if (!deck) return { ok: false, reason: 'not-found' };
  if (!deck.isPublic) {
    const role = await deckRole(hostUserId, deck.id);
    if (role === null) return { ok: false, reason: 'not-found' };
    if (role !== 'owner') return { ok: false, reason: 'private-editor' };
    if (!options.confirmPrivate) return { ok: false, reason: 'confirm-required' };
  }
  // A slim read (not `lib/study.server`, which drags the library metadata into the socket bundle): the access rule
  // above already decided who may show the deck, so this selects text columns and the picture columns that exclude a
  // card. Sound columns are never selected.
  const rows = await prisma.flashcard.findMany({
    where: { deckId: deck.id, ...REVIEWABLE_WHERE },
    orderBy: CARD_ORDER,
    select: {
      id: true,
      front: true,
      back: true,
      kind: true,
      sourceId: true,
      clozeIndex: true,
      frontImageUrl: true,
      backImageUrl: true,
      source: { select: { frontImageUrl: true, backImageUrl: true } },
    },
  });
  const cards = roomSafeCards(
    rows.map((r) => ({
      id: r.id,
      front: r.front,
      back: r.back,
      clozeIndex: r.clozeIndex,
      noteId: noteIdOf(r),
      // Only presence matters: a card with a picture (its own or its source's) or an occlusion is left out.
      ...(r.frontImageUrl || r.source?.frontImageUrl ? { frontImage: { url: 'x', alt: '' } } : {}),
      ...(r.backImageUrl || r.source?.backImageUrl ? { backImage: { url: 'x', alt: '' } } : {}),
      ...(r.kind === 'occlusion' ? { occlusion: {} } : {}),
    })) as TestCard[],
  );
  return { ok: true, deckTitle: deck.title, cards };
}
