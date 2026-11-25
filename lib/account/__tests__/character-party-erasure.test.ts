import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the party tables (which only cascade from the user) are
 * deleted explicitly: the parties the member runs and the memberships they hold. Another member's characters and
 * memberships are never in the filter.
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

describe('anonymizeAccount (RMHCharacters parties)', () => {
  it('deletes the parties the member runs (their members first) and the member’s own memberships', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const members = tx.filter((o) => o.model === 'rmhCharacterPartyMember' && o.method === 'deleteMany');
    const parties = tx.filter((o) => o.model === 'rmhCharacterParty' && o.method === 'deleteMany');
    expect(members.map((o) => o.args)).toEqual([
      { where: { party: { ownerId: 'user-1' } } },
      { where: { userId: 'user-1' } },
    ]);
    expect(parties.map((o) => o.args)).toEqual([{ where: { ownerId: 'user-1' } }]);
    // foreign-key order: the party's members go before the party
    expect(tx.indexOf(members[0]!)).toBeLessThan(tx.indexOf(parties[0]!));
  });

  it('never touches the characters themselves (other members’ sheets stay)', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    for (const o of tx.filter((x) => x.model.startsWith('rmhCharacterParty'))) {
      expect(JSON.stringify(o.args)).not.toContain('characterId');
    }
  });
});
