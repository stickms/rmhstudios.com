import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `DeckSuggestion` (which only cascades from the user) must be
 * deleted explicitly: the suggestions the member made go, and open ones leave the deck author's list.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (deck suggestions)', () => {
  it('deletes the suggestions the member made, whatever their status', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'deckSuggestion');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.method).toBe('deleteMany');
    // Only rows where the member is the suggester: suggestions to their own decks belong to the decks.
    expect(ops[0]!.args).toEqual({ where: { suggesterId: 'user-1' } });
  });
});
