/**
 * Describe images after posting (sprint 05 #16) — the pure half, shared by the
 * endpoint, the dialog and the settings list.
 *
 * A post's `imageAlts` is index-aligned with `imageUrls`; an empty string means
 * "no description". Editing descriptions is accessibility metadata, not a
 * content edit, so none of this touches `editedAt` or the edit history.
 */
import {
  MAX_IMAGE_ALT_LENGTH,
  MAX_RMHARK_IMAGES,
} from '@/lib/rmhark-limits';
import { missingAltIndexes } from '@/lib/feed/alt-text';

export {
  MAX_IMAGE_ALT_LENGTH,
  MAX_RMHARK_IMAGES,
};

/** Rows the settings list returns per page. */
export const MISSING_ALT_PAGE_SIZE = 20;
/** Candidate posts read per keyset batch (images present; descriptions checked in JS). */
export const MISSING_ALT_BATCH_SIZE = 100;
/** Batches read for one page before it answers short with a cursor, so one request never walks a whole history. */
export const MISSING_ALT_MAX_BATCHES = 5;
/** The count shows this many, then "99+". */
export const MISSING_ALT_COUNT_CAP = 99;

// Unicode "Other, control" (C0, DEL, C1) and the line and paragraph separators.
const CONTROL_CHARS =
  /[\p{Cc}\u2028\u2029]+/gu;

/** One description as stored: plain text on a single line, control characters turned into spaces, trimmed, capped. */
export function sanitizeAlt(
  raw: string,
): string {
  return raw
    .replace(
      CONTROL_CHARS,
      ' ',
    )
    .trim()
    .slice(
      0,
      MAX_IMAGE_ALT_LENGTH,
    )
    .trim();
}

/** The submitted list covers exactly the post's images, so a description can never land on the wrong picture. */
export function altsMatchImages(
  imageUrls: readonly string[],
  alts: readonly string[],
): boolean {
  return (
    imageUrls.length >
      0 &&
    alts.length ===
      imageUrls.length
  );
}

/** The stored form of a submitted list. */
export function sanitizeAlts(
  alts: readonly string[],
): string[] {
  return alts.map(
    sanitizeAlt,
  );
}

/** A stored list read back for editing: exactly one entry per image, a short list padded with empty strings. */
export function alignAlts(
  imageUrls: readonly string[],
  imageAlts:
    | readonly string[]
    | null
    | undefined,
): string[] {
  return imageUrls.map(
    (
      _,
      i,
    ) =>
      imageAlts?.[
        i
      ] ??
      '',
  );
}

/** How many of the post's images still have no description. */
export function missingAltCount(
  imageUrls: readonly string[],
  imageAlts:
    | readonly string[]
    | null
    | undefined,
): number {
  return missingAltIndexes(
    imageUrls,
    imageAlts ??
      undefined,
  )
    .length;
}

/** The count the settings section shows: capped, with a flag so the label can say "99+". */
export function capMissingCount(
  n: number,
): {
  count: number;
  capped: boolean;
} {
  const whole =
    Math.max(
      0,
      Math.floor(
        n,
      ),
    );
  return whole >
    MISSING_ALT_COUNT_CAP
    ? {
        count:
          MISSING_ALT_COUNT_CAP,
        capped: true,
      }
    : {
        count:
          whole,
        capped: false,
      };
}

const FIRST_LINE_MAX = 80;

/** The first non-empty line of a post, shortened for a list row. Empty for a post with no text. */
export function firstLineOf(
  content: string,
): string {
  const line =
    content
      .split(
        /\r?\n/,
      )
      .map(
        (
          l,
        ) =>
          l.trim(),
      )
      .find(
        (
          l,
        ) =>
          l.length >
          0,
      );
  if (
    !line
  )
    return '';
  return line.length >
    FIRST_LINE_MAX
    ? `${line.slice(0, FIRST_LINE_MAX - 1).trimEnd()}…`
    : line;
}

export interface MissingAltRow {
  id: string;
  /** First line of the post's text; empty when it has none. */
  firstLine: string;
  createdAt: string;
  imageUrls: string[];
  /** One entry per image, empty where there is no description. */
  imageAlts: string[];
  /** Images still without a description. */
  missing: number;
}

export interface MissingAltPage {
  rows: MissingAltRow[];
  /** Posts with an undescribed image, capped at {@link MISSING_ALT_COUNT_CAP}. Null on pages after the first. */
  total:
    | number
    | null;
  /** More than the cap exist. */
  capped: boolean;
  /** Pass back as `after` for the next page; null at the end. */
  nextCursor:
    | string
    | null;
}

/** The first image that still needs a description, for the row's thumbnail; the first image when all are done. */
export function thumbnailIndex(
  row: Pick<
    MissingAltRow,
    | 'imageUrls'
    | 'imageAlts'
  >,
): number {
  const first =
    missingAltIndexes(
      row.imageUrls,
      row.imageAlts,
    )[0];
  return (
    first ??
    0
  );
}

const CURSOR_SEP =
  '|';

/** A keyset position: the last post a page covered. */
export function encodeCursor(
  createdAt: Date,
  id: string,
): string {
  return `${createdAt.toISOString()}${CURSOR_SEP}${id}`;
}

export function decodeCursor(
  cursor: string,
): {
  createdAt: Date;
  id: string;
} | null {
  const at =
    cursor.indexOf(
      CURSOR_SEP,
    );
  if (
    at <
    1
  )
    return null;
  const createdAt =
    new Date(
      cursor.slice(
        0,
        at,
      ),
    );
  const id =
    cursor.slice(
      at +
        1,
    );
  if (
    Number.isNaN(
      createdAt.getTime(),
    ) ||
    id.length ===
      0 ||
    id.length >
      64
  )
    return null;
  return {
    createdAt,
    id,
  };
}
