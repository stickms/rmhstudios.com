/**
 * Moderator notes (s03-04), pure rules: how long a note can be edited, how many can be pinned,
 * and how a note's text is split for display. No I/O.
 */

/** A note may be edited by its author for this long after it was written. */
export const NOTE_EDIT_WINDOW_MS =
  24 *
  60 *
  60 *
  1000;

/** At most this many notes of one member are pinned at a time. */
export const MAX_PINNED_NOTES = 3;

/** Longest note, in characters (the column is VARCHAR(2000)). */
export const MAX_NOTE_LENGTH = 2000;

/** A note keeps at most this many earlier texts; past it the author writes a new note. */
export const MAX_NOTE_EDITS = 20;

/** Notes per page of the list. */
export const NOTES_PAGE_SIZE = 50;

export type EditRefusal =
  | 'deleted'
  | 'not-author'
  | 'window-closed'
  | 'too-many-edits';

/** Whether `viewerId` may edit a note now; the refusal says why not. Any admin may pin or delete, only the author edits. */
export function editRefusal(input: {
  authorId:
    | string
    | null;
  viewerId: string;
  createdAt: Date;
  deletedAt: Date | null;
  editCount: number;
  now?: Date;
}): EditRefusal | null {
  if (
    input.deletedAt
  )
    return 'deleted';
  if (
    input.authorId ===
      null ||
    input.authorId !==
      input.viewerId
  )
    return 'not-author';
  const now =
    (
      input.now ??
      new Date()
    ).getTime();
  if (
    now -
      input.createdAt.getTime() >
    NOTE_EDIT_WINDOW_MS
  )
    return 'window-closed';
  if (
    input.editCount >=
    MAX_NOTE_EDITS
  )
    return 'too-many-edits';
  return null;
}

/** When the author's edit window closes. */
export function editWindowEnds(
  createdAt: Date,
): Date {
  return new Date(
    createdAt.getTime() +
      NOTE_EDIT_WINDOW_MS,
  );
}

/** Whether one more note may be pinned given how many are pinned already. */
export function canPinAnother(
  pinnedNow: number,
): boolean {
  return (
    pinnedNow <
    MAX_PINNED_NOTES
  );
}

export type NoteSegment =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'link';
      text: string;
      href: string;
    };

const URL_PATTERN =
  /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION =
  /[.,;:!?)\]}]+$/;

/**
 * Split note text into plain and link segments, for display only. Only http and https are links, trailing
 * punctuation stays outside the link, and the note itself is stored and rendered as text.
 */
export function splitNoteText(
  text: string,
): NoteSegment[] {
  const out: NoteSegment[] =
    [];
  let last = 0;
  for (const match of text.matchAll(
    URL_PATTERN,
  )) {
    const start =
      match.index ??
      0;
    const raw =
      match[0];
    const link =
      raw.replace(
        TRAILING_PUNCTUATION,
        '',
      );
    if (
      !URL.canParse(
        link,
      )
    )
      continue;
    if (
      start >
      last
    )
      out.push(
        {
          kind: 'text',
          text: text.slice(
            last,
            start,
          ),
        },
      );
    out.push(
      {
        kind: 'link',
        text: link,
        href: link,
      },
    );
    last =
      start +
      link.length;
  }
  if (
    last <
    text.length
  )
    out.push(
      {
        kind: 'text',
        text: text.slice(
          last,
        ),
      },
    );
  return out;
}
