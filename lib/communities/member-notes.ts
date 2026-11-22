/**
 * Community moderator notes (s06-02), pure rules: limits, the author's edit window and which notes a
 * preview shows. No I/O.
 */

/** Longest note, in characters (the column is VARCHAR(500)). */
export const NOTE_MAX_LENGTH = 500;
/** Live (not deleted) notes per member per community; the next one is refused. */
export const NOTES_PER_MEMBER_MAX = 50;
/** An author may edit their note for this long after writing it. */
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;
/** The member list asks for at most this many counts at once. */
export const NOTE_COUNTS_MAX_IDS = 50;
/** The mod queue and sanction dialog show the latest this many notes inline. */
export const NOTE_PREVIEW_COUNT = 2;

export interface NoteDTO {
  id: string;
  subjectId: string;
  author: { id: string; name: string | null; handle: string | null } | null;
  body: string;
  banId: string | null;
  modItemId: string | null;
  createdAt: string;
  editedAt: string | null;
  /** True while the viewer is the author and the 15-minute window is open. */
  canEdit: boolean;
}

/** Whether a note written at `createdAt` can still be edited at `now`. */
export function withinEditWindow(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= NOTE_EDIT_WINDOW_MS;
}

/** When the edit window of a note closes. */
export function editWindowEnds(createdAt: Date): Date {
  return new Date(createdAt.getTime() + NOTE_EDIT_WINDOW_MS);
}

/** The latest `count` live notes, newest first. Deleted notes are never previewed. */
export function selectPreview<T extends { createdAt: Date | string; deletedAt?: Date | string | null }>(
  notes: readonly T[],
  count: number = NOTE_PREVIEW_COUNT,
): T[] {
  return notes
    .filter((n) => !n.deletedAt)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, count);
}

/** Deduplicated, trimmed ids from a comma-separated parameter. */
export function parseIdList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
