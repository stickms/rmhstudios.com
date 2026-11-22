import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so nothing cascades. Bug reports the member wrote stay as
 * published content (their reporter row becomes "Deleted user"); their "I see this too" marks are deleted and every
 * issue they counted on gets its count decremented, in the same transaction.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) =>
          // The marks are read before the transaction, so this one read answers with real rows.
          name === 'buildIssueVote' && method === 'findMany'
            ? Promise.resolve([{ issueId: 'issue-1' }, { issueId: 'issue-2' }])
            : { model: name, method, args },
      },
    );
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (build issues)', () => {
  async function ops(): Promise<Op[]> {
    await anonymizeAccount('user-1');
    return (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
  }

  it('deletes the member\'s "I see this too" marks', async () => {
    const tx = await ops();
    const marks = tx.filter((o) => o.model === 'buildIssueVote');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ method: 'deleteMany', args: { where: { userId: 'user-1' } } });
  });

  it('decrements the count of each issue the member counted on, never below zero', async () => {
    const tx = await ops();
    const counts = tx.filter((o) => o.model === 'buildIssue');
    expect(counts.map((o) => o.method)).toEqual(['updateMany', 'updateMany']);
    expect(counts.map((o) => o.args)).toEqual([
      { where: { id: 'issue-1', voteCount: { gt: 0 } }, data: { voteCount: { decrement: 1 } } },
      { where: { id: 'issue-2', voteCount: { gt: 0 } }, data: { voteCount: { decrement: 1 } } },
    ]);
  });

  it('keeps the issues the member wrote and anonymises their reporter row in place as "Deleted user"', async () => {
    const tx = await ops();
    // No delete of any issue, whatever its reporter.
    expect(tx.some((o) => o.model === 'buildIssue' && o.method.startsWith('delete'))).toBe(false);
    const user = tx.find((o) => o.model === 'user' && o.method === 'update');
    expect(user).toBeDefined();
    expect((user!.args as { data: { name: string } }).data.name).toBe('Deleted user');
  });
});
