/**
 * Picture-occlusion cards, the server half of the account export (s09-03). The cards live on `Flashcard` rows like any
 * other, so deleting an account removes them with the member's decks (`anonymizeAccount` deletes the decks); this file
 * only reads them out. The picture address and description are already in the `cardImages` section of the export.
 */
import { prisma } from '@/lib/prisma.server';
import { readOcclusion, type OcclusionMode, type OcclusionMask } from '@/lib/study/occlusion';

export interface ExportedOcclusionCard {
  deckId: string;
  deck: string;
  cardId: string;
  /** The optional prompt shown above the picture. */
  prompt: string;
  /** The optional note shown after the reveal. */
  note: string;
  mode: OcclusionMode;
  masks: OcclusionMask[];
}

/** The member's authored occlusion cards: deck, card id, mode and masks. */
export async function exportOcclusionCards(userId: string): Promise<ExportedOcclusionCard[]> {
  const rows = await prisma.flashcard.findMany({
    where: { sourceId: null, kind: 'occlusion', deck: { userId } },
    orderBy: [{ deckId: 'asc' }, { position: 'asc' }],
    select: { id: true, deckId: true, front: true, back: true, occlusion: true, deck: { select: { title: true } } },
  });
  const out: ExportedOcclusionCard[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const occlusion = readOcclusion(row.occlusion);
    if (!occlusion) continue;
    out.push({
      deckId: row.deckId,
      deck: row.deck.title,
      cardId: row.id,
      prompt: row.front,
      note: row.back,
      mode: occlusion.mode,
      masks: occlusion.masks,
    });
  }
  return out;
}
