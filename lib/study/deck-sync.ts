/**
 * Copied decks and their author's changes (pure, no I/O). Each copied authored card remembers the
 * source card it came from (`originCardId`) and a hash of that card's kind, front and back when it
 * was copied or last synced (`originHash`). Comparing those with the source's current cards says
 * what changed:
 *
 * - new: a source card no copy card points at;
 * - changed: the source's hash moved and the member never edited their copy;
 * - conflict: the source's hash moved and the member edited their copy too (never applied
 *   automatically);
 * - removed: a copy card whose origin is gone from the source (offered, never removed unasked).
 *
 * Import server-only code from `deck-sync.server.ts`; this file holds no `*.server` dependency, and
 * client code reaches its types with `import type`.
 */
import { createHash } from 'node:crypto';
import { isCardKind, type CardKind } from '@/lib/study/card-types';
import {
  fromColumns,
  hasPictures,
  pictureHashInput,
  type CardImage,
  type CardImageColumns,
} from '@/lib/study/card-images';
import { readOcclusion, type Occlusion } from '@/lib/study/occlusion';

/** An authored card's content: the fields a hash covers (the pictures too, once it has any: s08-15). */
export interface CardContent extends Partial<CardImageColumns> {
  kind: string;
  front: string;
  back: string;
  /** The masks of an occlusion card (s09-03), as stored; part of the hash only for that kind. */
  occlusion?: unknown;
}

export interface SourceCard extends CardContent {
  id: string;
}

export interface CopyCard extends CardContent {
  id: string;
  originCardId: string | null;
  originHash: string | null;
}

/**
 * Stable hash of an authored card's kind, front and back (SHA-256, 64 hex characters), and its pictures when it has
 * any. A card with none hashes exactly as before pictures existed, so every stored `originHash` still matches.
 */
export function cardHash(card: CardContent): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        card.kind,
        card.front,
        card.back,
        ...(pictureHashInput(card) ?? []),
        // Masks change what the card asks, so they change the hash; no other kind carries any (hashes stay as they were).
        ...(card.kind === 'occlusion' ? [readOcclusion(card.occlusion)] : []),
      ]),
    )
    .digest('hex');
}

export interface Side {
  kind: CardKind;
  front: string;
  back: string;
  /** The card's pictures, present only on a card that has one (the update dialog shows them; s08-15). */
  frontImage?: CardImage | null;
  backImage?: CardImage | null;
  /** The masks, present on an occlusion card. */
  occlusion?: Occlusion | null;
}

const side = (card: CardContent): Side => ({
  kind: isCardKind(card.kind) ? card.kind : 'basic',
  front: card.front,
  back: card.back,
  ...(hasPictures(card) ? fromColumns(card) : {}),
  ...(card.kind === 'occlusion' ? { occlusion: readOcclusion(card.occlusion) } : {}),
});

export interface NewItem {
  sourceCardId: string;
  card: Side;
}
export interface ChangedItem {
  cardId: string;
  sourceCardId: string;
  mine: Side;
  theirs: Side;
  /** Hash of the copy's current content: an apply skips the row if it no longer matches. */
  expectedHash: string;
}
export interface RemovedItem {
  cardId: string;
  card: Side;
  expectedHash: string;
}

export interface DeckDiff {
  added: NewItem[];
  changed: ChangedItem[];
  conflicts: ChangedItem[];
  removed: RemovedItem[];
}

/** Compare the source's authored cards with the copy's, in the source's and the copy's own order. */
export function diffDecks(source: readonly SourceCard[], copy: readonly CopyCard[]): DeckDiff {
  const byId = new Map(source.map((c) => [c.id, c]));
  const pointedAt = new Set<string>();
  const diff: DeckDiff = {
    added: [],
    changed: [],
    conflicts: [],
    removed: [],
  };

  for (const card of copy) {
    if (card.originCardId === null) continue;
    pointedAt.add(card.originCardId);
    const origin = byId.get(card.originCardId);
    const current = cardHash(card);
    if (!origin) {
      diff.removed.push({
        cardId: card.id,
        card: side(card),
        expectedHash: current,
      });
      continue;
    }
    const theirsHash = cardHash(origin);
    // Settled: already in step, or the member took the same edit (or chose to keep theirs).
    if (card.originHash === theirsHash || current === theirsHash) continue;
    const item: ChangedItem = {
      cardId: card.id,
      sourceCardId: origin.id,
      mine: side(card),
      theirs: side(origin),
      expectedHash: current,
    };
    if (current === card.originHash) diff.changed.push(item);
    else diff.conflicts.push(item);
  }

  for (const card of source) {
    if (!pointedAt.has(card.id))
      diff.added.push({
        sourceCardId: card.id,
        card: side(card),
      });
  }
  return diff;
}

export const pendingCount = (diff: DeckDiff): number =>
  diff.added.length + diff.changed.length + diff.conflicts.length + diff.removed.length;

export interface FrontMatch {
  cardId: string;
  sourceCardId: string;
}

/**
 * Link a copy made before origins were recorded: each unlinked copy card takes the first source
 * card with exactly the same front that no other copy card has claimed. Unmatched cards stay the
 * member's own.
 */
export function matchByFront(
  source: readonly Pick<SourceCard, 'id' | 'front'>[],
  copy: readonly Pick<CopyCard, 'id' | 'front' | 'originCardId'>[],
): FrontMatch[] {
  const claimed = new Set(copy.map((c) => c.originCardId).filter((id): id is string => id !== null));
  const free = new Map<string, string[]>();
  for (const card of source) {
    if (claimed.has(card.id)) continue;
    const list = free.get(card.front);
    if (list) list.push(card.id);
    else free.set(card.front, [card.id]);
  }
  const out: FrontMatch[] = [];
  for (const card of copy) {
    if (card.originCardId !== null) continue;
    const next = free.get(card.front)?.shift();
    if (next !== undefined)
      out.push({
        cardId: card.id,
        sourceCardId: next,
      });
  }
  return out;
}

/** The counts the deck page's line shows. A changed-and-edited card counts as changed. */
export interface UpdatesSummary {
  state: 'updates' | 'needs-link' | 'unavailable';
  changed: number;
  added: number;
  removed: number;
  conflicts: number;
}

export const summaryOf = (diff: DeckDiff): UpdatesSummary => ({
  state: 'updates',
  changed: diff.changed.length,
  added: diff.added.length,
  removed: diff.removed.length,
  conflicts: diff.conflicts.length,
});
