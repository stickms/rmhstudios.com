import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, and `RmhTubeChatMessage` has a plain `userId` with no `User`
 * relation, so the erasure coverage test never sees it. The operation in `anonymizeAccount` and this test are the
 * record: the erased member's messages lose their name in every room, the text stays, others' rows are not touched.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> };
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
import { DELETED_CHAT_NAME, chatMessageErasureOps } from '@/lib/rmhtube/chat-reports.server';

describe('anonymizeAccount (RMHTube chat)', () => {
  it('de-identifies only the erased member’s messages, keeping the text', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'rmhTubeChatMessage');
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.method).toBe('updateMany');
    expect(op.args.where).toMatchObject({ userId: 'user-1' });
    expect(op.args.data).toEqual({ userName: 'Deleted user' });
    expect(op.args.data).not.toHaveProperty('content');
    expect(JSON.stringify(op.args.where)).not.toContain('user-2');
  });

  it('is idempotent: rows already de-identified are not rewritten', () => {
    const [op] = chatMessageErasureOps('user-1') as unknown as Op[];
    expect(op!.args.where).toEqual({ userId: 'user-1', NOT: { userName: DELETED_CHAT_NAME } });
  });
});
