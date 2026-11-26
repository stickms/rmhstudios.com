/**
 * s15-06: the data export lists the entries a member wrote in other guestbooks and the comments they wrote under
 * announcements, never the entries other members wrote in their own guestbook.
 */
import { describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

const h = vi.hoisted(() => ({ entryWhere: [] as unknown[], commentWhere: [] as unknown[] }));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      guestbookEntry: {
        findMany: vi.fn(async ({ where }: { where: unknown }) => {
          h.entryWhere.push(where);
          return [
            {
              body: 'Hello',
              createdAt: new Date('2027-01-02T03:04:05Z'),
              hiddenAt: null,
              owner: { handle: 'owner', username: null },
            },
            {
              body: 'Hidden',
              createdAt: new Date('2027-01-01T00:00:00Z'),
              hiddenAt: new Date('2027-01-03T00:00:00Z'),
              owner: { handle: null, username: 'plain-name' },
            },
          ];
        }),
      },
      blogComment: {
        findMany: vi.fn(async ({ where }: { where: unknown }) => {
          h.commentWhere.push(where);
          return [
            {
              content: 'Nice',
              createdAt: new Date('2027-01-02T00:00:00Z'),
              deletedAt: null,
              post: { title: 'Big news' },
            },
            {
              content: 'Gone',
              createdAt: new Date('2027-01-01T00:00:00Z'),
              deletedAt: new Date('2027-01-04T00:00:00Z'),
              post: { title: 'Big news' },
            },
          ];
        }),
      },
    }),
  };
});

describe('exportGuestbookAndComments', () => {
  it('lists what the member wrote, in plain words, and only theirs', async () => {
    const { exportGuestbookAndComments } = await import('@/lib/guestbook/export.server');
    const out = await exportGuestbookAndComments('me');
    assertJsonSafe(out);
    expect(h.entryWhere).toEqual([{ authorId: 'me' }]);
    expect(h.commentWhere).toEqual([{ userId: 'me' }]);
    expect(out.guestbookEntries).toEqual([
      { ownerHandle: 'owner', body: 'Hello', createdAt: '2027-01-02T03:04:05.000Z', hiddenByOwner: false },
      { ownerHandle: 'plain-name', body: 'Hidden', createdAt: '2027-01-01T00:00:00.000Z', hiddenByOwner: true },
    ]);
    expect(out.announcementComments).toEqual([
      { postTitle: 'Big news', content: 'Nice', createdAt: '2027-01-02T00:00:00.000Z', deleted: false },
      { postTitle: 'Big news', content: 'Gone', createdAt: '2027-01-01T00:00:00.000Z', deleted: true },
    ]);
  });
});
