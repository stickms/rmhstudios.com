import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `DeckEditor` (which only cascades from the user, and from the
 * deck) must be deleted explicitly (s11-10): the member's own rows as an editor or invitee go, and nothing else of
 * the deck does. Rows on a deck the member owns stay with the deck (`FlashcardDeck` is the open public-decks decision),
 * so no operation touches `invitedById` or a deck.
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
import { ERASURE_REGISTRY } from '@/lib/account/erasure-registry';

const operations = async (userId: string): Promise<Op[]> => {
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
  await anonymizeAccount(userId);
  return (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
};

describe('anonymizeAccount (deck editors)', () => {
  it('deletes the member’s own rows as an editor or an invitee, and only those', async () => {
    const tx = await operations('user-1');
    const ops = tx.filter((o) => o.model === 'deckEditor');
    expect(ops).toEqual([{ model: 'deckEditor', method: 'deleteMany', args: { where: { userId: 'user-1' } } }]);
  });

  it('leaves the member’s own decks and the rows on them alone (decks stay at deletion today)', async () => {
    const tx = await operations('user-1');
    expect(tx.filter((o) => o.model === 'flashcardDeck' && o.method !== 'updateMany')).toEqual([]);
    // The one deck write there is, the folder clear, names no editor and removes no row of an editor's.
    const written = tx.filter((o) => o.model === 'flashcardDeck');
    for (const op of written) expect(JSON.stringify(op.args)).not.toMatch(/invitedById|editors/);
  });

  it('is classified `erase` in the registry, with the rows it keeps named', () => {
    const entry = ERASURE_REGISTRY.DeckEditor;
    expect(entry).toBeDefined();
    expect(entry!.decision).toBe('erase');
    expect(entry!.scope).toMatch(/userId/);
    expect(entry!.scope).toMatch(/stay/);
  });
});
