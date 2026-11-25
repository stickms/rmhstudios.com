import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `LightsOutBoardPlay` (which only cascades from the user) is
 * deleted explicitly: the member's best moves leave every board's fewest-moves list. The boards they made are
 * published content others play and stay under "Deleted user" (erasure registry, rule 3), so nothing deletes them.
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

describe('anonymizeAccount (Lights Out boards)', () => {
  it('deletes the account’s plays and keeps the boards it made', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const plays = tx.find((o) => o.model === 'lightsOutBoardPlay' && o.method === 'deleteMany');
    expect(plays?.args).toEqual({ where: { userId: 'user-1' } });
    expect(tx.filter((o) => o.model === 'lightsOutBoard')).toEqual([]);
  });

  it('classifies both models: boards kept, plays erased', () => {
    expect(ERASURE_REGISTRY.LightsOutBoard?.decision).toBe('keep');
    expect(ERASURE_REGISTRY.LightsOutBoardPlay?.decision).toBe('erase');
  });
});
