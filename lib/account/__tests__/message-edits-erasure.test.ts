import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, and `ChatMessageEdit` has no `User` relation (it hangs off the
 * message), so the erasure coverage test never sees it. The operation in `anonymizeAccount` and this test are the
 * record: every earlier version of a message the erased member sent goes, the messages stay, other members' versions
 * are not touched.
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
import { messageEditErasureOps } from '@/lib/messages/edit-history.server';

describe('anonymizeAccount (message edit history)', () => {
  it('deletes the versions of the erased member’s own messages, and only those', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'chatMessageEdit');
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.method).toBe('deleteMany');
    expect(op.args.where).toEqual({ message: { senderId: 'user-1' } });
    expect(JSON.stringify(op.args.where)).not.toContain('user-2');
  });

  it('never touches the messages themselves (they stay under "Deleted user")', () => {
    const ops = messageEditErasureOps('user-1') as unknown as Op[];
    expect(ops.every((o) => o.model === 'chatMessageEdit')).toBe(true);
  });
});
