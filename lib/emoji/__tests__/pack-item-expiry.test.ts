import { describe, it, expect, vi } from 'vitest';
import { ORPHAN_TTL_MS } from '@/lib/media/sweep-policy';

const h = vi.hoisted(() => ({ createdAt: new Date() }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    emojiPack: {
      findUnique: vi.fn(async () => ({ id: 'pack_1', slug: 's', ownerId: 'u1', itemCount: 0, status: 'DRAFT' })),
    },
    media: {
      findUnique: vi.fn(async () => ({
        id: 'media_a',
        userId: 'u1',
        url: '/x.webp',
        status: 'PENDING',
        contentType: 'image/webp',
        createdAt: h.createdAt,
      })),
    },
    emojiPackItem: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(),
  },
}));

import { addItem } from '@/lib/emoji/packs.server';
import { prisma } from '@/lib/prisma.server';

describe('adding a pack item from an upload past the sweep threshold', () => {
  it('is refused as not found, before anything is claimed', async () => {
    h.createdAt = new Date(Date.now() - ORPHAN_TTL_MS - 60_000);
    await expect(addItem('u1', 's', { name: 'x', kind: 'emoji', mediaId: 'media_a', alt: '' })).rejects.toMatchObject({
      message: 'Media not found.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
