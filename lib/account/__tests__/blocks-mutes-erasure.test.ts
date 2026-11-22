import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `UserBlock` and `UserMute` (which only cascade from the user)
 * must be deleted explicitly, and only where the member is the blocker or muter (s05-14).
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
  await anonymizeAccount('user-1');
  const calls = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]![0] as Op[];
}

describe('anonymizeAccount (blocks and mutes)', () => {
  it('deletes the blocks and mutes the account made', async () => {
    const all = await ops();
    expect(all.find((o) => o.model === 'userBlock' && o.method === 'deleteMany')!.args).toEqual({
      where: { blockerId: 'user-1' },
    });
    expect(all.find((o) => o.model === 'userMute' && o.method === 'deleteMany')!.args).toEqual({
      where: { muterId: 'user-1' },
    });
  });

  it('keeps the rows where other members blocked or muted the account', async () => {
    const touching = (await ops()).filter((o) => o.model === 'userBlock' || o.model === 'userMute');
    expect(touching).toHaveLength(2);
    for (const op of touching) {
      expect(op.method).toBe('deleteMany');
      expect(JSON.stringify(op.args)).not.toMatch(/blockedId|mutedId|OR/);
    }
  });
});
