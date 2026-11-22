/**
 * Sound on flashcards (s10-02), the server half: the member's upload, claiming it when a card is saved, releasing a
 * replaced or removed sound, serving it back to its recorder, the account export and the erasure.
 *
 * The upload follows the media policy, in this order: the size is read from `Content-Length` and the file's `size`
 * before any byte is read (413), the declared length is 1 to 15,000 ms (400), the daily allowance applies when the
 * caller knows the member's tier (the same `media-quota:<userId>` key as pictures), the BYTES decide the type
 * (`sniffAudioContainer`: anything else is 415, a renamed HTML file included) and the object is written with the
 * sniffed type and extension at `card-sound/<userId>-<id>.<ext>`. A `Media` row is written `PENDING`; saving a card
 * claims it by compare-and-set exactly as `attachCardImages` claims a picture, refused once it is a day old (the
 * sweep's orphan threshold, `orphanCutoff`).
 *
 * No sharing. A sound is heard by its recorder only: a copy, deck sync and every payload another member receives
 * carry none, and the route that plays it answers anyone else "not found". Each object belongs to one card side,
 * so replacing or removing a sound, or deleting the card or the deck, deletes the object after the transaction.
 */
import { refusalBody, refusalBeside } from '@/lib/errors/codes';
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import type { Tier } from '@/lib/entitlements';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { newMediaId } from '@/lib/media/id';
import { checkDailyUploadQuota, keyedLimit, type QuotaDeps } from '@/lib/media/quota.server';
import { orphanCutoff } from '@/lib/media/sweep-policy';
import { prisma } from '@/lib/prisma.server';
import { AUDIO_CONTAINER_EXT, AUDIO_CONTAINER_TYPE, sniffAudioContainer } from '@/lib/profile/audio-sniff';
import { deleteObject, getObject, putObject } from '@/lib/storage/s3.server';
import {
  CARD_SOUND_MAX_BYTES,
  CARD_SOUND_MAX_MS,
  CARD_SOUND_PREFIX,
  MAX_CARD_SOUNDS,
  cardSoundFilename,
  cardSoundKey,
  cardSoundUrl,
  fromSoundColumns,
  isCardSoundOwnedBy,
  type CardSound,
} from '@/lib/study/card-sound';

type Tx = Prisma.TransactionClient;

/** The audio types a claim accepts: exactly what the sniff can store. */
const AUDIO_TYPES: string[] = Object.values(AUDIO_CONTAINER_TYPE);
/** Slack on the multipart envelope when the size is judged from `Content-Length` alone. */
export const CARD_SOUND_ENVELOPE_BYTES = 64 * 1024;

export type SoundUploadResult =
  | { ok: true; url: string; durationMs: number; bytes: number }
  | { ok: false; status: 400 | 413 | 415 | 429; error: string };

export interface SoundUploadInput {
  audio: File | null;
  durationMs: number;
}

export interface SoundUploadContext {
  /** Known tier: the daily allowance is checked against it. Left out, as the picture route leaves it, no tier is judged. */
  tier?: Tier;
  /** The allowance's limiter (tests). */
  limit?: QuotaDeps['limit'];
}

/** Whether a declared body length is already too large to read (the check before `formData()`). */
export const soundBodyTooLarge = (contentLength: number): boolean =>
  Number.isFinite(contentLength) && contentLength > CARD_SOUND_MAX_BYTES + CARD_SOUND_ENVELOPE_BYTES;

/** Store one sound for the member. Nothing is attached to a card yet. */
export async function uploadCardSound(
  userId: string,
  input: SoundUploadInput,
  ctx: SoundUploadContext = {},
): Promise<SoundUploadResult> {
  const { audio } = input;
  if (!audio || audio.size === 0) return { ok: false, status: 400, ...refusalBody('VOICE_MISSING') };
  // The size comes from the file's declared size, before a byte of it is read.
  if (audio.size > CARD_SOUND_MAX_BYTES) {
    return { ok: false, status: 413, ...refusalBody('STUDY_SOUND_TOO_LARGE') };
  }
  const { durationMs } = input;
  if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > CARD_SOUND_MAX_MS) {
    return { ok: false, status: 400, ...refusalBody('STUDY_SOUND_TOO_LONG') };
  }
  if (ctx.tier) {
    const { allowed } = await checkDailyUploadQuota({ limit: ctx.limit ?? keyedLimit }, { userId, tier: ctx.tier });
    if (!allowed) return { ok: false, status: 429, ...refusalBody('STUDY_UPLOAD_LIMIT') };
  }
  const bytes = Buffer.from(await audio.arrayBuffer());
  // The size again, on the bytes: a client can lie about `size`.
  if (bytes.length > CARD_SOUND_MAX_BYTES) {
    return { ok: false, status: 413, ...refusalBody('STUDY_SOUND_TOO_LARGE') };
  }
  const container = sniffAudioContainer(bytes);
  if (!container) return { ok: false, status: 415, ...refusalBody('AUDIO_FORMAT_UNSUPPORTED') };

  const filename = `${userId}-${nanoid()}.${AUDIO_CONTAINER_EXT[container]}`;
  const key = cardSoundKey(filename);
  const url = cardSoundUrl(filename);
  await putObject(key, bytes, AUDIO_CONTAINER_TYPE[container]);
  await prisma.media.create({
    data: {
      id: newMediaId(),
      userId,
      key,
      url,
      contentType: AUDIO_CONTAINER_TYPE[container],
      bytes: bytes.length,
      status: 'PENDING',
    },
  });
  return { ok: true, url, durationMs: Math.round(durationMs), bytes: bytes.length };
}

export type SoundAttachFailure = {
  ok: false;
  status: 400 | 409;
  error: string;
  code: 'LIMIT' | 'MEDIA_NOT_FOUND';
};

const HAS_SOUND = {
  OR: [{ frontSoundUrl: { not: null } }, { backSoundUrl: { not: null } }],
} satisfies Prisma.FlashcardWhereInput;

/** Authored cards of the member that carry a sound: the number the cap bounds. */
export async function countSoundedCards(tx: Tx, userId: string): Promise<number> {
  return tx.flashcard.count({ where: { sourceId: null, deck: { userId }, ...HAS_SOUND } });
}

/**
 * Take the member's sound lock, check the cap and claim the sounds a save introduces. `urls` are the addresses new
 * to the card(s) being saved; `adding` is how many cards will newly carry a sound. A sound must be the member's own
 * `PENDING` upload of an audio type within the size cap and less than a day old; it is claimed once, by
 * compare-and-set, so a second card (or a second request) cannot claim it again. Run it inside the transaction that
 * writes the cards.
 */
export async function attachCardSounds(
  tx: Tx,
  userId: string,
  plan: { urls: readonly string[]; adding: number; now?: Date },
): Promise<{ ok: true } | SoundAttachFailure> {
  if (plan.urls.length === 0 && plan.adding <= 0) return { ok: true };
  await lockKey(tx, `card-sounds:${userId}`);
  if (plan.adding > 0) {
    const have = await countSoundedCards(tx, userId);
    if (have + plan.adding > MAX_CARD_SOUNDS) {
      return { ok: false, status: 409, code: 'LIMIT', error: `At most ${MAX_CARD_SOUNDS} cards can carry a sound` };
    }
  }
  const cutoff = orphanCutoff(plan.now ?? new Date());
  for (const url of new Set(plan.urls)) {
    const claimed = await tx.media.updateMany({
      where: {
        userId,
        url,
        status: 'PENDING',
        postId: null,
        contentType: { in: AUDIO_TYPES },
        bytes: { lte: CARD_SOUND_MAX_BYTES },
        // The day-old refusal: past the sweep's threshold the object may already be gone.
        createdAt: { gte: cutoff },
      },
      data: { status: 'ATTACHED' },
    });
    if (claimed.count === 0)
      return { ok: false, status: 400, code: 'MEDIA_NOT_FOUND', ...refusalBeside('STUDY_SOUND_REUPLOAD') };
  }
  return { ok: true };
}

/** The object key of a sound address, or null when it is not one this module stored. */
export function soundObjectKey(url: string | null | undefined): string | null {
  const name = url ? cardSoundFilename(url) : null;
  return name ? cardSoundKey(name) : null;
}

/**
 * Forget the sounds a card no longer shows. Call it AFTER the change that dropped the reference, inside the same
 * transaction: a sound no card still names has its `Media` row deleted and its key returned for
 * `deleteCardSoundObjects` to remove once the transaction commits. An address that is not the member's own stored
 * sound, or one a card still shows, releases nothing.
 */
export async function releaseCardSounds(
  tx: Tx,
  userId: string,
  urls: readonly (string | null | undefined)[],
): Promise<string[]> {
  const keys: string[] = [];
  for (const url of [...new Set(urls.filter((u): u is string => !!u))].sort()) {
    const key = soundObjectKey(url);
    if (!key) continue;
    const references = await tx.flashcard.count({ where: { OR: [{ frontSoundUrl: url }, { backSoundUrl: url }] } });
    if (references > 0) continue;
    await tx.media.deleteMany({ where: { userId, url, status: 'ATTACHED', postId: null } });
    // A row gone (or never there) still has its object removed: the address came from the card's own columns.
    keys.push(key);
  }
  return keys;
}

/** After the commit, and never fatal: a failed delete leaves an object for a later sweep, not a broken save. */
export async function deleteCardSoundObjects(keys: readonly string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => {})));
}

/** The recorder's sound as audio, or null: not theirs, no such row, or the object is gone. */
export async function readCardSound(
  userId: string,
  filename: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const url = cardSoundUrl(filename);
  if (!cardSoundFilename(url) || !isCardSoundOwnedBy(filename, userId)) return null;
  const row = await prisma.media.findFirst({ where: { userId, url }, select: { key: true } });
  if (!row || row.key !== cardSoundKey(filename)) return null;
  const object = await getObject(row.key);
  if (!object) return null;
  const ext = filename.slice(filename.lastIndexOf('.') + 1);
  const container = (Object.keys(AUDIO_CONTAINER_EXT) as (keyof typeof AUDIO_CONTAINER_EXT)[]).find(
    (c) => AUDIO_CONTAINER_EXT[c] === ext,
  );
  // From the stored extension (written from sniffed bytes), never from the object's metadata.
  return { body: object.body, contentType: container ? AUDIO_CONTAINER_TYPE[container] : 'application/octet-stream' };
}

/** The member's cards that carry a sound, for the account export: one row per side. */
export async function exportCardSounds(userId: string) {
  const rows = await prisma.flashcard.findMany({
    where: { sourceId: null, deck: { userId }, ...HAS_SOUND },
    orderBy: [{ deckId: 'asc' }, { position: 'asc' }],
    select: {
      id: true,
      deckId: true,
      front: true,
      frontSoundUrl: true,
      frontSoundText: true,
      frontSoundMs: true,
      backSoundUrl: true,
      backSoundText: true,
      backSoundMs: true,
      deck: { select: { title: true } },
    },
  });
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const { frontSound, backSound } = fromSoundColumns(row);
    const out: {
      deckId: string;
      deck: string;
      cardId: string;
      side: 'front' | 'back';
      url: string;
      transcript: string;
      durationMs: number;
    }[] = [];
    const push = (side: 'front' | 'back', sound: CardSound | null) => {
      if (sound) out.push({ deckId: row.deckId, deck: row.deck.title, cardId: row.id, side, ...sound });
    };
    push('front', frontSound);
    push('back', backSound);
    return out;
  });
}

/**
 * The erasure's operations for the transaction in `anonymizeAccount` (s10-02): the cards stay (decks are an open
 * owner decision) but the member's recordings are personal data heard by nobody else, so the six columns are
 * nulled on every card in the member's decks. The member's sound `Media` rows go back to `PENDING`, so if the
 * object deletion after the commit never runs, the media sweep's orphan rule still reclaims them.
 */
export function cardSoundErasureOps(userId: string) {
  return [
    prisma.flashcard.updateMany({
      where: { deck: { userId }, ...HAS_SOUND },
      data: {
        frontSoundUrl: null,
        frontSoundText: null,
        frontSoundMs: null,
        backSoundUrl: null,
        backSoundText: null,
        backSoundMs: null,
      },
    }),
    prisma.media.updateMany({
      where: { userId, key: { startsWith: CARD_SOUND_PREFIX } },
      data: { status: 'PENDING', postId: null, attachedAt: null },
    }),
  ];
}

/** After the transaction: delete every stored sound object the member made, then its rows. Safe to run twice. */
export async function deleteMemberCardSoundObjects(userId: string): Promise<void> {
  const rows = await prisma.media.findMany({
    where: { userId, key: { startsWith: CARD_SOUND_PREFIX } },
    select: { id: true, key: true },
  });
  const found = Array.isArray(rows) ? rows : [];
  if (found.length === 0) return;
  // A row is dropped only once its object is gone: a failed delete keeps the PENDING row, so the media sweep
  // (orphan rule) can still reclaim the recording later instead of leaving an object nothing points at.
  const gone: string[] = [];
  await Promise.all(
    found.map(async (row) => {
      try {
        await deleteObject(row.key);
        gone.push(row.id);
      } catch {
        // kept for the sweep
      }
    }),
  );
  if (gone.length > 0) await prisma.media.deleteMany({ where: { id: { in: gone } } });
}
