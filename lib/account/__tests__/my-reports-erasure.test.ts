import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the free text a member typed on the reports they filed
 * does not go with a cascade: it is scrubbed explicitly, and the report stays as the moderators' record.
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

describe('anonymizeAccount (reports filed)', () => {
  it('clears the details the account typed on its reports and keeps the reports', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const scrub = tx.find((o) => o.model === 'contentReport' && o.method === 'updateMany');
    expect(scrub?.args).toEqual({ where: { reporterId: 'user-1' }, data: { details: null } });
    expect(tx.some((o) => o.model === 'contentReport' && o.method.startsWith('delete'))).toBe(false);
  });
});
