import { describe, expect, it, vi } from 'vitest';

/**
 * Sprint 09 16: the member's ratings, Doctrine reputation and puzzle results, contributor score, pick'em picks and
 * achievements are erased with the account, each by the member's own id, and nothing else is touched.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: unknown };
}

const h = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  const prismaMock = new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
      $executeRaw: vi.fn(async () => 0),
      $queryRaw: vi.fn(async () => []),
    } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
  return { prismaMock };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: h.prismaMock }));
vi.mock('@/lib/cached.server', () => ({ invalidateCached: vi.fn(async () => undefined) }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => null) }));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/account/deletion.server', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  scheduleDeletion: vi.fn(async () => new Date('2026-12-22')),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { boardsErasureOps } from '@/lib/account/erasure-boards.server';
import { ERASURE_REGISTRY, TODO_CEILING } from '@/lib/account/erasure-registry';

const U = 'user-1';
const EXPECTED: Array<[string, string, Record<string, unknown>]> = [
  ['eloRating', 'deleteMany', { userId: U }],
  ['rankedSeasonRating', 'deleteMany', { userId: U }],
  ['doctrineReputation', 'deleteMany', { userId: U }],
  ['doctrinePuzzleSubmission', 'deleteMany', { userId: U }],
  ['doctrinePuzzleReplay', 'deleteMany', { userId: U }],
  ['communityContributorScore', 'deleteMany', { userId: U }],
  ['bracketPick', 'deleteMany', { userId: U }],
  ['userAchievement', 'deleteMany', { userId: U }],
];

describe('boardsErasureOps', () => {
  const ops = boardsErasureOps(U) as unknown as Op[];

  it('gives every table its operation with the member id as the where', () => {
    expect(ops.map((o) => [o.model, o.method, o.args.where])).toEqual(EXPECTED);
  });

  it('touches nothing else: no opponent rating, puzzle, ledger or tournament row', () => {
    const touched = new Set(ops.map((o) => o.model));
    for (const other of ['rankedChallenge', 'doctrinePuzzle', 'doctrineReputationLedger', 'tournament', 'user']) {
      expect(touched.has(other), other).toBe(false);
    }
  });

  it('is wired into the anonymisation transaction', async () => {
    await anonymizeAccount(U);
    const tx = (h.prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    for (const [model, method, where] of EXPECTED) {
      expect(
        tx.some(
          (o) => o.model === model && o.method === method && JSON.stringify(o.args.where) === JSON.stringify(where),
        ),
      ).toBe(true);
    }
  });

  it('classifies every table as erase and the ceiling equals the todo entries left', () => {
    for (const [m] of EXPECTED) expect(ERASURE_REGISTRY[m[0]!.toUpperCase() + m.slice(1)]?.decision).toBe('erase');
    const todo = Object.values(ERASURE_REGISTRY).filter((e) => e.decision === 'todo').length;
    expect(TODO_CEILING).toBe(todo);
    expect(TODO_CEILING).toBe(17);
  });
});
