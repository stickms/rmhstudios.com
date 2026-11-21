import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `MessageRequest` (which only
 * cascades from the user) must be deleted explicitly, in both directions (s04-16).
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

async function ops(): Promise<Op[]> {
  await anonymizeAccount('user-1');
  const calls = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]![0] as Op[];
}

describe('anonymizeAccount (message requests)', () => {
  it('deletes requests the account sent or received', async () => {
    const op = (await ops()).find((o) => o.model === 'messageRequest' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({
      where: { OR: [{ senderId: 'user-1' }, { recipientId: 'user-1' }] },
    });
  });

  it('deletes the chat of a request of theirs still waiting, before the request rows', async () => {
    const all = await ops();
    const chat = all.findIndex((o) => o.model === 'chat' && o.method === 'deleteMany');
    const rows = all.findIndex((o) => o.model === 'messageRequest' && o.method === 'deleteMany');
    expect(chat).toBeGreaterThanOrEqual(0);
    expect(chat).toBeLessThan(rows);
    expect(all[chat]!.args).toEqual({
      where: {
        messageRequest: { is: { senderId: 'user-1', status: { in: ['draft', 'pending'] } } },
      },
    });
  });
});
