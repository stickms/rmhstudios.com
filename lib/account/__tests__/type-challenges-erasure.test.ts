import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `RmhTypeChallenge` (which only cascades from the user) must be
 * deleted explicitly, from both sides: a challenge is a two-person record with no public trace. The member's switch
 * and the inbox notices that name them go too.
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

async function ops(): Promise<Op[]> {
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
  await anonymizeAccount('user-1');
  return (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
}

describe('anonymizeAccount (typing challenges)', () => {
  it('deletes the challenges the member sent and the ones they received', async () => {
    const op = (await ops()).find((o) => o.model === 'rmhTypeChallenge' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({ where: { OR: [{ challengerId: 'user-1' }, { opponentId: 'user-1' }] } });
  });

  it('deletes the switch', async () => {
    const op = (await ops()).find((o) => o.model === 'rmhTypeChallengeOptOut' && o.method === 'deleteMany');
    expect(op!.args).toEqual({ where: { userId: 'user-1' } });
  });

  it("deletes the other side's inbox notices that name the member", async () => {
    const found = (await ops()).filter(
      (o) =>
        o.model === 'notification' &&
        o.method === 'deleteMany' &&
        JSON.stringify(o.args) === JSON.stringify({ where: { entityType: 'type-challenge', actorId: 'user-1' } }),
    );
    expect(found).toHaveLength(1);
  });
});
