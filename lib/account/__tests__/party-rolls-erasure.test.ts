import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `RmhCharacterPartyRoll` (which only cascades from the user and
 * the party) is deleted explicitly: the rolls the member made in any party, and every roll in a party they run. Another
 * member's rolls in someone else's party are never in the filter.
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

describe('anonymizeAccount (table rolls)', () => {
  it('deletes the member’s rolls in any party and every roll in a party they run', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const rolls = tx.filter((o) => o.model === 'rmhCharacterPartyRoll' && o.method === 'deleteMany');
    expect(rolls.map((o) => o.args)).toEqual([
      { where: { userId: 'user-1' } },
      { where: { party: { ownerId: 'user-1' } } },
    ]);
  });

  it('never touches the characters or the memberships themselves', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    for (const o of tx.filter((x) => x.model === 'rmhCharacterPartyRoll')) {
      expect(o.method).toBe('deleteMany');
      expect(JSON.stringify(o.args)).not.toContain('characterId');
    }
  });
});
