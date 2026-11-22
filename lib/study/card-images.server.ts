/**
 * Pictures on flashcards, the server half (s08-15): the member's upload through the `flashcard` ingest surface,
 * claiming it when a card is saved, releasing it when nothing references it any more, and the export.
 *
 * Storage. An upload is `ingest(file, 'flashcard', { userId, record: true })`: stored with every metadata block
 * stripped and a `Media` row in `PENDING` that the media sweep reclaims when no card claims it. Saving a card with
 * the picture flips that row to `ATTACHED` (no post, no `attachedAt`, the shape the sweep skips).
 *
 * Copies share the object. A copied card keeps the source's URL, so an object may be referenced by many cards, and
 * it is deleted only when no `Flashcard` references its URL (`releaseCardImage` counts inside the removing
 * transaction, under a lock per URL that copying takes too, so a copy and a removal cannot both miss each other).
 * The storage bound is the per-member cap on cards carrying a picture they uploaded, taken under a lock.
 */
import type { Prisma } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { ingest, IngestError, POLICIES } from '@/lib/media/ingest.server';
import { prisma } from '@/lib/prisma.server';
import { deleteObject } from '@/lib/storage/s3.server';
import { MAX_CARD_IMAGES, fromColumns, type CardImageColumns } from '@/lib/study/card-images';

type Tx = Prisma.TransactionClient;

export type UploadResult =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; status: 400 | 413 | 415 | 429; error: string };

/** Store one picture for the member through the `flashcard` surface. Nothing is attached to a card yet. */
export async function uploadCardImage(userId: string, file: File | null): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, status: 400, error: 'No file provided' };
  try {
    const stored = await ingest(file, 'flashcard', { userId, record: true });
    return { ok: true, url: stored.url, width: stored.width, height: stored.height };
  } catch (err) {
    if (err instanceof IngestError) {
      return { ok: false, status: err.status as 400 | 413 | 415 | 429, error: err.message };
    }
    throw err;
  }
}

export type AttachFailure = {
  ok: false;
  status: 400 | 409;
  error: string;
  code: 'LIMIT' | 'MEDIA_NOT_FOUND';
};

const HAS_PICTURE = {
  OR: [{ frontImageUrl: { not: null } }, { backImageUrl: { not: null } }],
} satisfies Prisma.FlashcardWhereInput;

/** Authored cards the member wrote (not copies) that carry a picture: the number the cap bounds. */
export async function countUploadedPictureCards(tx: Tx, userId: string): Promise<number> {
  return tx.flashcard.count({
    where: { sourceId: null, originCardId: null, deck: { userId }, ...HAS_PICTURE },
  });
}

/**
 * Take the member's picture lock, check the cap and claim the pictures a save introduces. `urls` are the addresses new to
 * the card(s) being saved; `adding` is how many cards will newly carry a picture the member uploaded (the cap counts
 * cards). A picture must be the member's own: a `PENDING` upload (claimed once, compare-and-set) or one a card of
 * theirs already shows. Run it inside the transaction that writes the cards.
 */
export async function attachCardImages(
  tx: Tx,
  userId: string,
  plan: { urls: readonly string[]; adding: number },
): Promise<{ ok: true } | AttachFailure> {
  if (plan.urls.length === 0 && plan.adding <= 0) return { ok: true };
  await lockKey(tx, `card-images:${userId}`);
  if (plan.adding > 0) {
    const have = await countUploadedPictureCards(tx, userId);
    if (have + plan.adding > MAX_CARD_IMAGES) {
      return { ok: false, status: 409, code: 'LIMIT', error: `At most ${MAX_CARD_IMAGES} cards can carry a picture` };
    }
  }
  for (const url of new Set(plan.urls)) {
    const claimed = await tx.media.updateMany({
      // The claim re-checks the flashcard policy, not just ownership: a pending upload from another surface (or the
      // legacy images route) must still be a still image within the size cap to become a card picture.
      where: {
        userId,
        url,
        status: 'PENDING',
        postId: null,
        contentType: { in: [...POLICIES.flashcard.mime] },
        bytes: { lte: POLICIES.flashcard.maxBytes },
      },
      data: { status: 'ATTACHED' },
    });
    if (claimed.count > 0) continue;
    // Already attached: fine only when one of the member's own cards shows it (an import reusing a picture).
    const reused = await tx.flashcard.count({
      where: { deck: { userId }, OR: [{ frontImageUrl: url }, { backImageUrl: url }] },
    });
    if (reused === 0) return { ok: false, status: 400, code: 'MEDIA_NOT_FOUND', error: 'Upload the picture again' };
  }
  return { ok: true };
}

/** Lock the pictures a copy is about to reference, in a fixed order, so a removal waits for the copy (or the reverse). */
export async function lockPictureUrls(tx: Tx, urls: readonly string[]): Promise<void> {
  for (const url of [...new Set(urls)].sort()) await lockKey(tx, `card-image:${url}`);
}

/** Every stored object an uploaded picture made: the full size and the small variant (`-400` before the extension). */
export function objectKeysOf(key: string): string[] {
  const dot = key.lastIndexOf('.');
  return dot > 0 ? [key, `${key.slice(0, dot)}-400${key.slice(dot)}`] : [key];
}

/**
 * Forget one picture a card no longer shows. Counts the cards that still reference the URL, inside the caller's
 * transaction (call it AFTER the change that dropped the reference); with none left, the member's `Media` row is
 * deleted and its object keys are returned for `deleteCardImageObjects` to remove once the transaction commits.
 * A URL still in use, or one with no recorded upload, releases nothing.
 */
export async function releaseCardImage(tx: Tx, url: string | null | undefined): Promise<string[]> {
  if (!url) return [];
  await lockKey(tx, `card-image:${url}`);
  const references = await tx.flashcard.count({ where: { OR: [{ frontImageUrl: url }, { backImageUrl: url }] } });
  if (references > 0) return [];
  const rows = await tx.media.findMany({
    where: { url, status: 'ATTACHED', postId: null, attachedAt: null },
    select: { id: true, key: true },
  });
  const found = Array.isArray(rows) ? rows : [];
  if (found.length === 0) return [];
  await tx.media.deleteMany({ where: { id: { in: found.map((row) => row.id) } } });
  return found.flatMap((row) => objectKeysOf(row.key));
}

/** `releaseCardImage` for several URLs. */
export async function releaseCardImages(tx: Tx, urls: readonly string[]): Promise<string[]> {
  const keys: string[] = [];
  for (const url of [...new Set(urls)].sort()) keys.push(...(await releaseCardImage(tx, url)));
  return keys;
}

/** After the commit, and never fatal: a failed delete leaves an object for a later sweep, not a broken save. */
export async function deleteCardImageObjects(keys: readonly string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => {})));
}

/** The member's authored cards that carry a picture, for the account export. */
export async function exportCardImages(userId: string) {
  const rows = await prisma.flashcard.findMany({
    where: { sourceId: null, deck: { userId }, ...HAS_PICTURE },
    orderBy: [{ deckId: 'asc' }, { position: 'asc' }],
    select: {
      id: true,
      deckId: true,
      front: true,
      frontImageUrl: true,
      frontImageAlt: true,
      backImageUrl: true,
      backImageAlt: true,
      deck: { select: { title: true } },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const { frontImage, backImage } = fromColumns(row as Partial<CardImageColumns>);
    return {
      deckId: row.deckId,
      deck: row.deck.title,
      cardId: row.id,
      front: row.front,
      frontImage,
      backImage,
    };
  });
}

/**
 * The addresses behind the `media_id`s the developer API received, for one key owner: only that member's own
 * uploads that no post uses. An unknown or someone else's id is simply absent from the map (the caller answers
 * `invalid_media` for both, so the API is no oracle for other members' uploads).
 */
export async function resolveMediaUrls(userId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const rows = await prisma.media.findMany({
    where: { userId, id: { in: [...new Set(ids)] }, postId: null },
    select: { id: true, url: true },
  });
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, row.url]));
}
