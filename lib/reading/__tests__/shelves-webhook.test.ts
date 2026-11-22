import { beforeEach, describe, expect, it, vi } from 'vitest';

// s08-12: `reading.finished` is emitted the first time a book is shelved as read, after the write, and not otherwise.
const h = vi.hoisted(() => ({
  existing: null as null | { finishedAt: Date | null; pages: number },
  upsertFails: false,
  emit: vi.fn(async () => {}),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    readingShelfEntry: {
      findUnique: async () => h.existing,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        if (h.upsertFails) throw new Error('db down');
        return {
          docSlug: 'b',
          title: 'Book',
          shelf: create.shelf,
          pages: 1,
          finishedAt: create.finishedAt,
          updatedAt: new Date(),
        };
      },
    },
  },
}));
vi.mock('@/lib/library/library.server', () => ({
  getBook: async (slug: string) => (slug === 'b' ? { slug, title: 'Book', pages: 10 } : undefined),
}));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));
vi.mock('@/lib/webhooks/activity-emit.server', () => ({ emitReadingFinished: h.emit }));

import { setShelf } from '../shelves.server';

beforeEach(() => {
  h.existing = null;
  h.upsertFails = false;
  h.emit.mockClear();
});

describe('reading.finished emit', () => {
  it('emits on the first finish', async () => {
    const r = await setShelf('u1', { slug: 'b', title: 'Book', shelf: 'read', pages: 10 });
    expect(r.ok).toBe(true);
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ docKind: 'library', docKey: 'b', title: 'Book' }),
    );
  });

  it('does not emit again for a book already finished, or for other shelves', async () => {
    h.existing = { finishedAt: new Date(0), pages: 10 };
    await setShelf('u1', { slug: 'b', title: 'Book', shelf: 'read', pages: 10 });
    h.existing = null;
    await setShelf('u1', { slug: 'b', title: 'Book', shelf: 'reading', pages: 10 });
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('does not emit for an unknown book or a failed write', async () => {
    expect((await setShelf('u1', { slug: 'zz', title: 'x', shelf: 'read', pages: 1 })).ok).toBe(false);
    h.upsertFails = true;
    await setShelf('u1', { slug: 'b', title: 'Book', shelf: 'read', pages: 10 }).catch(() => {});
    expect(h.emit).not.toHaveBeenCalled();
  });
});
