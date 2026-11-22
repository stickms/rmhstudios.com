import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a member's `FlashcardReminder` (which only
 * cascades from the user) must be deleted explicitly.
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

describe('anonymizeAccount (flashcard reminder)', () => {
  it('deletes the account’s reminder setting', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = tx.find((o) => o.model === 'flashcardReminder' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({ where: { userId: 'user-1' } });
  });
});
