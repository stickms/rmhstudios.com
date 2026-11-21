import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `EventCohost` (which only cascades from the user and
 * from the event) must be deleted explicitly: the rows the member holds as an invitee or co-host, and every
 * row on the events they host, which stay behind with their host de-identified. Nobody else's rows go.
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

describe('anonymizeAccount (event co-hosts)', () => {
  it('deletes the member’s co-host rows and the rows on events they host, in the erasure transaction', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'eventCohost');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.method).toBe('deleteMany');
    expect(ops[0]!.args).toEqual({ where: { OR: [{ userId: 'user-1' }, { event: { hostId: 'user-1' } }] } });
  });

  it('puts the delete in the same batch as the rest of the erasure, never as raw SQL', async () => {
    await anonymizeAccount('user-2');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    expect(tx.some((o) => o.method === '$executeRaw')).toBe(false);
    expect(tx.find((o) => o.model === 'eventCohost')!.args).toEqual({
      where: { OR: [{ userId: 'user-2' }, { event: { hostId: 'user-2' } }] },
    });
  });
});
