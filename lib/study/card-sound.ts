/**
 * Sound on flashcards (s10-02), the pure half: the limits, the shape of a sound, the rules a card's sounds must meet,
 * how a generated sibling reads its source's, and who may be told a sound exists. Client-safe; the upload, claim and
 * release are in `card-sound.server.ts`.
 *
 * A sound is one short recording per card side plus the transcript that is its text alternative. It is private to
 * the member who recorded it (the owner's audio decision is open): copies and deck sync never carry it, and every
 * payload another member receives leaves it out. `soundFields` is the one place that decides, and
 * `CARD_SOUND_READ_PATHS` lists every server file that reads the columns.
 */

/** Most authored cards one member may have carrying a sound they recorded: the storage bound (200 x 2 x 512 KB). */
export const MAX_CARD_SOUNDS = 200;
/** Largest stored sound, in bytes. Checked from `Content-Length` before the body is read, then on the bytes. */
export const CARD_SOUND_MAX_BYTES = 512 * 1024;
/** Longest sound, in milliseconds. The declared length is a hint; the byte cap is the real bound. */
export const CARD_SOUND_MAX_MS = 15_000;
/** Longest transcript, and the column's width. */
export const CARD_SOUND_TEXT_MAX = 500;
/** Longest stored sound address. */
export const CARD_SOUND_URL_MAX = 500;
/** Where a sound's object is stored: `card-sound/<userId>-<cuid>.<ext>`. */
export const CARD_SOUND_PREFIX = 'card-sound/';
/** Where a sound is played from: the owner-only route that serves the stored object. */
export const CARD_SOUND_URL_BASE = '/api/study/card-sound/';

export type CardSoundSide = 'front' | 'back';

/** One sound as a card carries it and the API returns it. */
export interface CardSound {
  url: string;
  transcript: string;
  durationMs: number;
}

/** What a card says about its sounds. `null` and absent both mean no sound on that side. */
export interface CardSounds {
  frontSound?: CardSound | null | undefined;
  backSound?: CardSound | null | undefined;
}

/** The six stored columns of a card. */
export interface CardSoundColumns {
  frontSoundUrl: string | null;
  frontSoundText: string | null;
  frontSoundMs: number | null;
  backSoundUrl: string | null;
  backSoundText: string | null;
  backSoundMs: number | null;
}

export const NO_SOUNDS: CardSoundColumns = {
  frontSoundUrl: null,
  frontSoundText: null,
  frontSoundMs: null,
  backSoundUrl: null,
  backSoundText: null,
  backSoundMs: null,
};

/** Columns to select to read a card's sounds. Only a path that then applies `soundFields` may select them. */
export const CARD_SOUND_SELECT = {
  frontSoundUrl: true,
  frontSoundText: true,
  frontSoundMs: true,
  backSoundUrl: true,
  backSoundText: true,
  backSoundMs: true,
} as const;

/**
 * Every server file that selects the sound columns, each of which sends them to the card's owner only (or exports
 * or erases them). `lib/study/__tests__/card-sound-sync.test.ts` scans the source tree: a file that names a sound
 * column and is not listed here (or in the writers below) fails it, so a new reader cannot leak one.
 */
export const CARD_SOUND_READ_PATHS = [
  'lib/study.server.ts',
  'lib/study/queue.server.ts',
  'lib/study/api/study.decks.$id.review.server.ts',
  'lib/api/v1/study.server.ts',
] as const;

/** The files that write, export, erase or sweep the columns (never read them for another viewer). */
export const CARD_SOUND_OWNER_ONLY_PATHS = [
  'lib/study/card-sound.ts',
  'lib/study/card-sound.server.ts',
  'lib/study/deck-editor.server.ts',
  'lib/account/deletion.server.ts',
  'lib/media/sweep.server.ts',
  'lib/media/sweep-surfaces.ts',
] as const;

const FILENAME = /^[A-Za-z0-9._-]+$/;

/** The stored file name of a sound address, or null when `url` is not one the sound upload can have produced. */
export function cardSoundFilename(url: string): string | null {
  if (url.length === 0 || url.length > CARD_SOUND_URL_MAX || !url.startsWith(CARD_SOUND_URL_BASE)) return null;
  const name = url.slice(CARD_SOUND_URL_BASE.length);
  return FILENAME.test(name) && !name.includes('..') && name !== '.' ? name : null;
}

/** Whether `url` is an address the sound upload can have produced. */
export const isCardSoundUrl = (url: string): boolean => cardSoundFilename(url) !== null;

/** The object key and the address of a stored sound file name. */
export const cardSoundKey = (filename: string): string => `${CARD_SOUND_PREFIX}${filename}`;
export const cardSoundUrl = (filename: string): string => `${CARD_SOUND_URL_BASE}${filename}`;

/** Whether the file name says it belongs to `userId` (the key starts with the recorder's id). */
export const isCardSoundOwnedBy = (filename: string, userId: string): boolean =>
  userId.length > 0 && filename.startsWith(`${userId}-`);

export type CardSoundProblem =
  /** The transcript is what a screen reader reads in place of the sound; a sound without one is never saved. */
  | { code: 'TEXT_REQUIRED'; side: CardSoundSide }
  | { code: 'TEXT_TOO_LONG'; side: CardSoundSide }
  | { code: 'URL_INVALID'; side: CardSoundSide }
  | { code: 'DURATION_INVALID'; side: CardSoundSide }
  /** A cloze or occlusion card's front is generated per sibling; only the back takes a sound. */
  | { code: 'FRONT_NOT_ALLOWED'; side: 'front' };

/** The first reason a card's sounds cannot be saved, or null. Front first. */
export function cardSoundProblem(
  kind: string,
  sounds: CardSounds,
  isUrl: (url: string) => boolean = isCardSoundUrl,
): CardSoundProblem | null {
  if (sounds.frontSound && (kind === 'cloze' || kind === 'occlusion'))
    return { code: 'FRONT_NOT_ALLOWED', side: 'front' };
  for (const side of ['front', 'back'] as const) {
    const sound = side === 'front' ? sounds.frontSound : sounds.backSound;
    if (!sound) continue;
    if (!isUrl(sound.url)) return { code: 'URL_INVALID', side };
    // One stored object belongs to exactly one card side (no sharing, so no reference count).
    if (side === 'back' && sounds.frontSound && sounds.frontSound.url === sound.url)
      return { code: 'URL_INVALID', side };
    const text = sound.transcript.trim();
    if (text.length === 0) return { code: 'TEXT_REQUIRED', side };
    if (text.length > CARD_SOUND_TEXT_MAX) return { code: 'TEXT_TOO_LONG', side };
    if (!Number.isInteger(sound.durationMs) || sound.durationMs < 1 || sound.durationMs > CARD_SOUND_MAX_MS) {
      return { code: 'DURATION_INVALID', side };
    }
  }
  return null;
}

/** The sounds with transcripts trimmed, absent sides as null. */
export function normalizeSounds(sounds: CardSounds): { frontSound: CardSound | null; backSound: CardSound | null } {
  const clean = (s: CardSound | null | undefined): CardSound | null =>
    s ? { url: s.url, transcript: s.transcript.trim(), durationMs: s.durationMs } : null;
  return { frontSound: clean(sounds.frontSound), backSound: clean(sounds.backSound) };
}

/** A pair of sounds to the six columns. */
export function toSoundColumns(sounds: CardSounds): CardSoundColumns {
  const { frontSound, backSound } = normalizeSounds(sounds);
  return {
    frontSoundUrl: frontSound?.url ?? null,
    frontSoundText: frontSound?.transcript ?? null,
    frontSoundMs: frontSound?.durationMs ?? null,
    backSoundUrl: backSound?.url ?? null,
    backSoundText: backSound?.transcript ?? null,
    backSoundMs: backSound?.durationMs ?? null,
  };
}

/** The six columns to a pair of sounds. A URL without a transcript still plays: the player names it by its side. */
export function fromSoundColumns(row: Partial<CardSoundColumns>): {
  frontSound: CardSound | null;
  backSound: CardSound | null;
} {
  return {
    frontSound: row.frontSoundUrl
      ? { url: row.frontSoundUrl, transcript: row.frontSoundText ?? '', durationMs: row.frontSoundMs ?? 0 }
      : null,
    backSound: row.backSoundUrl
      ? { url: row.backSoundUrl, transcript: row.backSoundText ?? '', durationMs: row.backSoundMs ?? 0 }
      : null,
  };
}

/** Whether a card carries at least one sound. */
export const hasSounds = (row: Partial<CardSoundColumns>): boolean => !!row.frontSoundUrl || !!row.backSoundUrl;

/** The addresses a card references, front then back, without repeats. */
export function soundUrls(row: Partial<CardSoundColumns>): string[] {
  return [...new Set([row.frontSoundUrl, row.backSoundUrl].filter((u): u is string => !!u))];
}

interface SiblingShape {
  kind: string;
  sourceId: string | null;
  clozeIndex: number | null;
}

/**
 * The sounds a stored card shows. An authored card shows its own; a generated sibling reads its source's: the
 * reverse of a reversible card swaps the sides, a cloze or occlusion sibling shows the source's back sound on its
 * back and none on its front.
 */
export function soundsOfRow(
  row: SiblingShape & Partial<CardSoundColumns>,
  source: Partial<CardSoundColumns> | null | undefined,
): { frontSound: CardSound | null; backSound: CardSound | null } {
  if (row.sourceId === null) return fromSoundColumns(row);
  const own = fromSoundColumns(source ?? {});
  if (row.kind === 'reversible' && row.clozeIndex === null)
    return { frontSound: own.backSound, backSound: own.frontSound };
  if (row.kind === 'cloze' || row.kind === 'occlusion') return { frontSound: null, backSound: own.backSound };
  return own;
}

/**
 * The sound fields of a card payload: present only for a side that has a sound, and only when the viewer owns the
 * deck. Every other viewer's payload carries no sound field at all, so a recording's address never reaches another
 * member. `soundFields(…, false)` is `{}` whatever the row holds.
 */
export function soundFields(
  sounds: { frontSound: CardSound | null; backSound: CardSound | null },
  viewerOwnsDeck: boolean,
): { frontSound?: CardSound; backSound?: CardSound } {
  if (!viewerOwnsDeck) return {};
  return {
    ...(sounds.frontSound ? { frontSound: sounds.frontSound } : {}),
    ...(sounds.backSound ? { backSound: sounds.backSound } : {}),
  };
}

/** `m:ss` for a sound's length, for the label beside a play button. */
export function formatSoundLength(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The part of an authored card's origin hash a sound contributes: always nothing. A sound is not part of what a
 * copy receives, so changing one never offers a copier an update (`cardHash` ignores the columns; asserted).
 */
export const SOUND_HASH_INPUT = null;
