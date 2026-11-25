import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a member's `StudioProjectShare` rows (and the opened marks
 * they left on other members' shares) never go by a database cascade: they must be deleted explicitly. A share is a
 * link to the member's work, so it goes with them; copies already opened live on the openers' devices.
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

describe('anonymizeAccount (Studio shares)', () => {
  it('deletes the member’s shares and the opened marks they left elsewhere', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    for (const m of ['studioProjectShare', 'studioProjectShareOpen']) {
      const op = tx.find((o) => o.model === m && o.method === 'deleteMany');
      expect(op, m).toBeDefined();
      expect(op!.args).toEqual({ where: { userId: 'user-1' } });
    }
  });

  it('deletes the opened marks before the shares they point at', async () => {
    await anonymizeAccount('user-2');
    const calls = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls;
    const tx = calls[calls.length - 1]![0] as Op[];
    const marks = tx.findIndex((o) => o.model === 'studioProjectShareOpen');
    const shares = tx.findIndex((o) => o.model === 'studioProjectShare');
    expect(marks).toBeGreaterThanOrEqual(0);
    expect(marks).toBeLessThan(shares);
  });
});
