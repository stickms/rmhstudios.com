/**
 * A comment on a Slice It song, told to the song's uploader (s14-11).
 *
 * `song-comment`: "{{name}} commented on {{title}}", in the Replies category, linked to the library with the song's
 * title searched. Skipped: the uploader's own comment, a block either way, an uploader who muted the commenter (or is
 * banned or waiting to be deleted), and a private or taken-down song. Written after the comment is saved; a failure is
 * logged and never fails the comment. The comment's text is not in the notice.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { noticeName, reachableRecipients } from '@/lib/games/thread-notices.server';
import { userDisplaySelect } from '@/lib/user-display';

/** The longest title carried in a notice (the stored preview is cut at 280 characters). */
const TITLE_CHARS = 80;

export interface SongCommentNoticeInput {
  songId: string;
  commenterId: string;
}

/** Tell the uploader. Returns whether a notice was written (or refreshed). Never throws. */
export async function notifySongComment(comment: SongCommentNoticeInput): Promise<boolean> {
  try {
    const [song, commenter] = await Promise.all([
      prisma.song.findUnique({
        where: { id: comment.songId },
        select: { id: true, title: true, uploadedBy: true, isPublic: true, takenDownAt: true },
      }),
      prisma.user.findUnique({ where: { id: comment.commenterId }, select: userDisplaySelect }),
    ]);
    if (!song || !commenter) return false;
    if (!song.isPublic || song.takenDownAt !== null) return false;
    if (song.uploadedBy === comment.commenterId) return false;
    const [uploaderId] = await reachableRecipients(comment.commenterId, [song.uploadedBy]);
    if (!uploaderId) return false;
    await createNotification({
      // A SYSTEM row in the Replies category: the inbox leads with the notice, and the Replies switches govern it.
      type: 'SYSTEM',
      category: 'replies',
      userId: uploaderId,
      actorId: comment.commenterId,
      entityType: 'song',
      entityId: song.id,
      preview: notice('song-comment', { name: noticeName(commenter), title: song.title.slice(0, TITLE_CHARS) }),
      link: `/slice-it?q=${encodeURIComponent(song.title.slice(0, 120))}`,
      dedupeUnread: true,
    });
    return true;
  } catch (err) {
    console.error('[slice-it] notifySongComment failed:', err);
    return false;
  }
}
