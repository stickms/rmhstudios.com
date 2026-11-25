/**
 * Slice It songs and song comments in the site's report queue (s14-07).
 *
 * - `songReportable` / `songCommentReportable`: whose item a report is about. Both answer null for anything a member
 *   may not report (missing, private, taken down), so the report flow never confirms that a hidden song exists.
 * - `songCommentAuthor`: the comment's author, under the same visibility rule (the report route's owner lookup).
 * - `takeDownSongComment`: a moderator's removal of a comment; the same delete its author can do. Idempotent.
 * - `songReportPreviews` / `songCommentPreviews`: what a moderator reads in the queue (never the audio).
 *
 * A reported song's takedown is `takeDownSong` in `library.server.ts` (final: the audio is deleted, the scores stay).
 */
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';

/** The reason the report queue gives a song it takes down. */
export const SONG_REPORT_TAKEDOWN_REASON = 'Removed after a report';
/** How much of a reported comment a moderator reads. */
export const COMMENT_PREVIEW_CHARS = 280;

export type SongReportTarget = { ok: true; authorId: string } | { ok: false; reason: 'not-found' | 'own' };

/** The uploader of a song a member may report: it exists, is public and has not been taken down. */
export async function songReportable(songId: string): Promise<string | null> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { uploadedBy: true, isPublic: true, takenDownAt: true },
  });
  return song && song.isPublic && song.takenDownAt === null ? song.uploadedBy : null;
}

/** The author of a comment a member may report: it exists and its song is public and not taken down. */
export async function songCommentAuthor(commentId: string): Promise<string | null> {
  const comment = await prisma.songComment.findUnique({
    where: { id: commentId },
    select: { userId: true, song: { select: { isPublic: true, takenDownAt: true } } },
  });
  return comment && comment.song.isPublic && comment.song.takenDownAt === null ? comment.userId : null;
}

/** The report route's gate for a comment: its author, or why it is refused (a missing and a hidden one look alike). */
export async function songCommentReportable(commentId: string, reporterId: string): Promise<SongReportTarget> {
  const authorId = await songCommentAuthor(commentId);
  if (!authorId) return { ok: false, reason: 'not-found' };
  if (authorId === reporterId) return { ok: false, reason: 'own' };
  return { ok: true, authorId };
}

/** The report route's gate for a song, with the same answers as {@link songCommentReportable}. */
export async function songReportTarget(songId: string, reporterId: string): Promise<SongReportTarget> {
  const authorId = await songReportable(songId);
  if (!authorId) return { ok: false, reason: 'not-found' };
  if (authorId === reporterId) return { ok: false, reason: 'own' };
  return { ok: true, authorId };
}

/** A moderator removes a comment. A comment that is already gone is not an error, so a repeated decision is safe. */
export async function takeDownSongComment(commentId: string): Promise<{ deleted: boolean }> {
  const { count } = await prisma.songComment.deleteMany({ where: { id: commentId } });
  return { deleted: count > 0 };
}

/** One line per reported song: its title, artist and uploader, and its id for the Slice It admin page. */
export async function songReportPreviews(songIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (songIds.length === 0) return out;
  const rows = await prisma.song.findMany({
    where: { id: { in: songIds } },
    select: { id: true, title: true, artist: true, uploader: { select: userDisplaySelect } },
  });
  for (const row of rows) {
    const uploader = resolveUserDisplay(row.uploader).name || 'Unknown';
    out.set(row.id, `${row.title} by ${row.artist}. Uploaded by ${uploader}. Song ${row.id}`);
  }
  return out;
}

/** One line per reported comment: its text (cut to 280 characters) and the title of the song it is on. */
export async function songCommentPreviews(commentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (commentIds.length === 0) return out;
  const rows = await prisma.songComment.findMany({
    where: { id: { in: commentIds } },
    select: { id: true, content: true, song: { select: { title: true } } },
  });
  for (const row of rows) {
    const text =
      row.content.length > COMMENT_PREVIEW_CHARS ? `${row.content.slice(0, COMMENT_PREVIEW_CHARS - 1)}…` : row.content;
    out.set(row.id, `${text} (on ${row.song.title})`);
  }
  return out;
}
