/**
 * The data export's guestbook and announcement comments (sprint 15, feature 06): what the member wrote, in the plain
 * words of the row. Entries they wrote in other members' guestbooks (the owner's handle, the text, when, and whether
 * the owner hid it), and comments they wrote under announcements (the post's title, the text, when, and whether it
 * has been deleted). Entries OTHER members wrote in the member's own guestbook belong to those members and are not
 * here.
 */
import { prisma } from '@/lib/prisma.server';

/** Rows per list; a member who wrote more still gets their newest ones, in a bounded response. */
const EXPORT_ROWS = 5000;

export async function exportGuestbookAndComments(userId: string): Promise<{
  guestbookEntries: {
    ownerHandle: string | null;
    body: string;
    createdAt: string;
    hiddenByOwner: boolean;
  }[];
  announcementComments: {
    postTitle: string;
    content: string;
    createdAt: string;
    deleted: boolean;
  }[];
}> {
  const [entries, comments] = await Promise.all([
    prisma.guestbookEntry.findMany({
      where: { authorId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_ROWS,
      select: { body: true, createdAt: true, hiddenAt: true, owner: { select: { handle: true, username: true } } },
    }),
    prisma.blogComment.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_ROWS,
      select: { content: true, createdAt: true, deletedAt: true, post: { select: { title: true } } },
    }),
  ]);
  return {
    guestbookEntries: entries.map((e) => ({
      ownerHandle: e.owner.handle ?? e.owner.username ?? null,
      body: e.body,
      createdAt: e.createdAt.toISOString(),
      hiddenByOwner: e.hiddenAt !== null,
    })),
    announcementComments: comments.map((c) => ({
      postTitle: c.post.title,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      deleted: c.deletedAt !== null,
    })),
  };
}
