import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a member's unpublished Connections grids (which only cascade
 * from the user) must be deleted explicitly. Published grids are content other members use: they stay.
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

async function transactionOps(): Promise<Op[]> {
  await anonymizeAccount('user-1');
  return (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
}

describe('anonymizeAccount (Connections drafts)', () => {
  it('deletes the member’s drafts and nothing else of their grids', async () => {
    const grid = (await transactionOps()).filter((o) => o.model === 'connectionsGrid');
    expect(grid).toHaveLength(1);
    expect(grid[0]!.method).toBe('deleteMany');
    expect(grid[0]!.args.where).toEqual({ authorId: 'user-1', draft: true });
  });

  it('leaves published grids to stay under "Deleted user" (no update, no delete without the draft filter)', async () => {
    const grid = (await transactionOps()).filter((o) => o.model === 'connectionsGrid');
    for (const op of grid) {
      expect(op.args.where, 'every grid operation is scoped to drafts').toMatchObject({ draft: true });
    }
  });

  it('keeps erasing the member’s own plays', async () => {
    const plays = (await transactionOps()).filter((o) => o.model === 'connectionsPlay');
    expect(plays.length).toBeGreaterThan(0);
  });
});
