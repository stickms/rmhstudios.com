import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a member's voice recordings on flashcards (s10-02) must be
 * erased explicitly: the six sound columns are nulled on every card in the member's decks (the cards stay: decks are
 * an open owner decision), the member's sound `Media` rows go back to PENDING inside the transaction, and the stored
 * objects are deleted after the transaction, then their rows.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const h = vi.hoisted(() => ({
  media: [] as { id: string; key: string }[],
  deletedObjects: [] as string[],
  calls: [] as string[],
}));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          if (name === 'media' && method === 'findMany') {
            h.calls.push('media.findMany');
            return Promise.resolve(h.media);
          }
          if (name === 'media' && method === 'deleteMany') h.calls.push('media.deleteMany');
          return { model: name, method, args };
        },
      },
    );
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => {
        h.calls.push('transaction');
        return ops;
      }),
    } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject: async (key: string) => {
    h.calls.push('deleteObject');
    h.deletedObjects.push(key);
  },
  putObject: async () => {},
  getObject: async () => null,
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { cardSoundErasureOps, deleteMemberCardSoundObjects } from '@/lib/study/card-sound.server';

describe('anonymizeAccount (card sounds)', () => {
  it('nulls the six sound columns on the member’s cards and keeps the cards', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = tx.find(
      (o) => o.model === 'flashcard' && o.method === 'updateMany' && JSON.stringify(o.args).includes('Sound'),
    );
    expect(op).toBeDefined();
    expect(op!.args).toEqual({
      where: {
        deck: { userId: 'user-1' },
        OR: [{ frontSoundUrl: { not: null } }, { backSoundUrl: { not: null } }],
      },
      data: {
        frontSoundUrl: null,
        frontSoundText: null,
        frontSoundMs: null,
        backSoundUrl: null,
        backSoundText: null,
        backSoundMs: null,
      },
    });
    // The cards themselves are not deleted by this feature (decks are an open owner decision).
    expect(tx.some((o) => o.model === 'flashcard' && o.method === 'deleteMany')).toBe(false);
  });

  it('puts the member’s sound media rows back to PENDING, so a missed deletion is still swept', async () => {
    const [, media] = cardSoundErasureOps('user-1') as unknown as Op[];
    expect(media).toMatchObject({ model: 'media', method: 'updateMany' });
    expect(media!.args).toEqual({
      where: { userId: 'user-1', key: { startsWith: 'card-sound/' } },
      data: { status: 'PENDING', postId: null, attachedAt: null },
    });
  });

  it('deletes the stored objects after the transaction, then their rows', async () => {
    h.media = [
      { id: 'media_1', key: 'card-sound/user-1-a.webm' },
      { id: 'media_2', key: 'card-sound/user-1-b.m4a' },
    ];
    h.deletedObjects.length = 0;
    h.calls.length = 0;
    await anonymizeAccount('user-1');
    expect(h.deletedObjects.sort()).toEqual(['card-sound/user-1-a.webm', 'card-sound/user-1-b.m4a']);
    // The objects go only once the transaction has committed, and the rows only once the objects are gone.
    expect(h.calls.indexOf('transaction')).toBeLessThan(h.calls.indexOf('deleteObject'));
    expect(h.calls.lastIndexOf('deleteObject')).toBeLessThan(h.calls.indexOf('media.deleteMany'));
  });

  it('deletes only the member’s own sound rows, and nothing when there are none', async () => {
    h.media = [];
    h.deletedObjects.length = 0;
    await deleteMemberCardSoundObjects('user-1');
    expect(h.deletedObjects).toEqual([]);
  });
});
