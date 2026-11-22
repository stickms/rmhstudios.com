import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `deck_folder` rows (which only cascade from the user) are
 * deleted explicitly, and the member's decks are left with no folder rather than deleted. The export lists them.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (deck folders)', () => {
  it('deletes the member’s folders and un-files their decks, never deleting a deck', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const del = tx.find((o) => o.model === 'deckFolder' && o.method === 'deleteMany');
    expect(del).toBeDefined();
    expect(del!.args).toEqual({ where: { userId: 'user-1' } });
    const unfile = tx.find((o) => o.model === 'flashcardDeck' && o.method === 'updateMany');
    expect(unfile!.args).toEqual({ where: { userId: 'user-1', folderId: { not: null } }, data: { folderId: null } });
    expect(tx.indexOf(unfile!)).toBeLessThan(tx.indexOf(del!));
  });
});
