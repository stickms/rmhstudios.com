/**
 * Pictures on flashcards (s08-15), the pure half: the cap, the shape of a picture, the rules a card's pictures must
 * meet, how a generated sibling reads its source's, and the part of the origin hash a picture contributes.
 * Client-safe; the upload, attach and release are in `card-images.server.ts`.
 *
 * A picture is an upload from the `flashcard` ingest surface plus a description. The description is what a screen
 * reader reads in review, so a picture without one is never saved. Pictures live on the AUTHORED card only; its
 * siblings (the reverse of a reversible card, the cards of a cloze text) read the source's, so a URL is never copied
 * into a sibling. A copied deck shares the picture objects (same URL).
 */
import { CDN_BASE } from '@/lib/storage/asset';

/** Most authored cards one member may have carrying a picture they uploaded: the storage bound. */
export const MAX_CARD_IMAGES = 500;
/** Longest description, and the column's width. */
export const CARD_IMAGE_ALT_MAX = 1000;
/** Longest stored image address. */
export const CARD_IMAGE_URL_MAX = 500;

export type CardImageSide = 'front' | 'back';

/** One picture as a card carries it and the API returns it. */
export interface CardImage {
  url: string;
  alt: string;
}

/** What a card says about its pictures. `null` and absent both mean no picture on that side. */
export interface CardPictures {
  frontImage?: CardImage | null | undefined;
  backImage?: CardImage | null | undefined;
}

/** The four stored columns of a card. */
export interface CardImageColumns {
  frontImageUrl: string | null;
  frontImageAlt: string | null;
  backImageUrl: string | null;
  backImageAlt: string | null;
}

export const NO_PICTURES: CardImageColumns = {
  frontImageUrl: null,
  frontImageAlt: null,
  backImageUrl: null,
  backImageAlt: null,
};

/** Columns to select to read a card's pictures. */
export const CARD_IMAGE_SELECT = {
  frontImageUrl: true,
  frontImageAlt: true,
  backImageUrl: true,
  backImageAlt: true,
} as const;

const FILENAME = /^[A-Za-z0-9._-]+$/;
const FEED_PROXY = '/api/feed/image/';
const FEED_PREFIX = 'rmharks/';

/**
 * Whether `url` is an address the `flashcard` ingest surface can have produced: the site's own image proxy, or the
 * CDN's feed image space. Anything else (a remote address, a script URL) is refused before the database is asked.
 */
export function isCardImageUrl(url: string, cdnBase: string = CDN_BASE): boolean {
  if (url.length === 0 || url.length > CARD_IMAGE_URL_MAX) return false;
  if (url.startsWith(FEED_PROXY)) return FILENAME.test(url.slice(FEED_PROXY.length));
  if (cdnBase && url.startsWith(`${cdnBase}/${FEED_PREFIX}`)) {
    return FILENAME.test(url.slice(cdnBase.length + 1 + FEED_PREFIX.length));
  }
  return false;
}

export type CardImageProblem =
  | { code: 'ALT_REQUIRED'; side: CardImageSide }
  | { code: 'ALT_TOO_LONG'; side: CardImageSide }
  | { code: 'URL_INVALID'; side: CardImageSide }
  /** A cloze card's front is its text; only the back takes a picture. */
  | { code: 'CLOZE_FRONT'; side: 'front' };

/**
 * The first reason a card's pictures cannot be saved, or null. A picture needs a description (after trimming), a
 * cloze card's front takes none, and the address must be one the flashcard surface can have stored. Front first.
 */
export function cardImageProblem(
  kind: string,
  pictures: CardPictures,
  isUrl: (url: string) => boolean = (url) => isCardImageUrl(url),
): CardImageProblem | null {
  if (pictures.frontImage && kind === 'cloze') return { code: 'CLOZE_FRONT', side: 'front' };
  for (const side of ['front', 'back'] as const) {
    const image = side === 'front' ? pictures.frontImage : pictures.backImage;
    if (!image) continue;
    if (!isUrl(image.url)) return { code: 'URL_INVALID', side };
    const alt = image.alt.trim();
    if (alt.length === 0) return { code: 'ALT_REQUIRED', side };
    if (alt.length > CARD_IMAGE_ALT_MAX) return { code: 'ALT_TOO_LONG', side };
  }
  return null;
}

/** The pictures with descriptions trimmed, absent sides as null. */
export function normalizePictures(pictures: CardPictures): {
  frontImage: CardImage | null;
  backImage: CardImage | null;
} {
  const clean = (image: CardImage | null | undefined): CardImage | null =>
    image ? { url: image.url, alt: image.alt.trim() } : null;
  return { frontImage: clean(pictures.frontImage), backImage: clean(pictures.backImage) };
}

/** A pair of pictures to the four columns. */
export function toColumns(pictures: CardPictures): CardImageColumns {
  const { frontImage, backImage } = normalizePictures(pictures);
  return {
    frontImageUrl: frontImage?.url ?? null,
    frontImageAlt: frontImage?.alt ?? null,
    backImageUrl: backImage?.url ?? null,
    backImageAlt: backImage?.alt ?? null,
  };
}

/** The four columns to a pair of pictures. A URL without a description reads as no picture. */
export function fromColumns(row: Partial<CardImageColumns>): {
  frontImage: CardImage | null;
  backImage: CardImage | null;
} {
  return {
    frontImage: row.frontImageUrl ? { url: row.frontImageUrl, alt: row.frontImageAlt ?? '' } : null,
    backImage: row.backImageUrl ? { url: row.backImageUrl, alt: row.backImageAlt ?? '' } : null,
  };
}

/** Whether a card carries at least one picture. */
export const hasPictures = (row: Partial<CardImageColumns>): boolean => !!row.frontImageUrl || !!row.backImageUrl;

/** The URLs a card references, front then back, without repeats. */
export function pictureUrls(row: Partial<CardImageColumns>): string[] {
  const urls = [row.frontImageUrl, row.backImageUrl].filter((u): u is string => !!u);
  return [...new Set(urls)];
}

/**
 * The part of an authored card's origin hash a picture contributes: nothing for a card with no picture (so every
 * hash taken before pictures existed still matches), otherwise the URLs and descriptions. Changing a picture or its
 * description therefore changes the hash, and the copier is offered the update.
 */
export function pictureHashInput(row: Partial<CardImageColumns>): (string | null)[] | null {
  if (!hasPictures(row)) return null;
  return [row.frontImageUrl ?? null, row.frontImageAlt ?? null, row.backImageUrl ?? null, row.backImageAlt ?? null];
}

/** The stored fields that say which picture a row shows. */
interface SiblingShape {
  kind: string;
  sourceId: string | null;
  clozeIndex: number | null;
}

/**
 * The pictures a stored card shows. An authored card shows its own; a generated sibling reads its source's: the
 * reverse of a reversible card swaps the sides (the source's back picture is the sibling's front), and a cloze
 * sibling shows the source's back picture on its back and none on its front.
 */
export function picturesOfRow(
  row: SiblingShape & Partial<CardImageColumns>,
  source: Partial<CardImageColumns> | null | undefined,
): { frontImage: CardImage | null; backImage: CardImage | null } {
  if (row.sourceId === null) return fromColumns(row);
  const own = fromColumns(source ?? {});
  if (row.kind === 'reversible' && row.clozeIndex === null)
    return { frontImage: own.backImage, backImage: own.frontImage };
  if (row.kind === 'cloze') return { frontImage: null, backImage: own.backImage };
  return own;
}
