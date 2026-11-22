import { describe, expect, it, vi } from 'vitest';

/**
 * Sprint 09 15: the member's private tools, lists and study data are erased with the account, each by the member's
 * own id (both columns for close friends), the partial tables keep what they must, and nothing else is touched.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: unknown };
}

const h = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  const prismaMock = new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
  return { prismaMock };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: h.prismaMock }));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/account/deletion.server', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  scheduleDeletion: vi.fn(async () => new Date('2026-12-22')),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { listsErasureOps } from '@/lib/account/erasure-lists.server';
import { ERASURE_REGISTRY, TODO_CEILING } from '@/lib/account/erasure-registry';

const U = 'user-1';
const EXPECTED: Array<[string, string, Record<string, unknown>]> = [
  ['aiPersonaMessage', 'deleteMany', { userId: U }],
  ['aiPersona', 'deleteMany', { ownerId: U, isPublic: false, messages: { none: { userId: { not: U } } } }],
  ['emojiPackSubscription', 'deleteMany', { userId: U }],
  ['feedSignal', 'deleteMany', { userId: U }],
  ['postAutoDelete', 'deleteMany', { userId: U }],
  ['marathonList', 'deleteMany', { userId: U }],
  ['memberMemory', 'deleteMany', { userId: U }],
  ['readingSubscription', 'deleteMany', { userId: U }],
  ['savingsGoal', 'deleteMany', { userId: U }],
  ['wishlistEntry', 'deleteMany', { userId: U }],
  ['customFeed', 'deleteMany', { ownerId: U, isPublic: false, visibility: { not: 'PUBLIC' } }],
  ['communityOnboardingAnswer', 'deleteMany', { userId: U }],
  ['communityJoinRequest', 'deleteMany', { userId: U, status: 'PENDING' }],
  ['communityJoinRequest', 'updateMany', { userId: U, status: { not: 'PENDING' }, message: { not: null } }],
  ['rmhStudyProfile', 'deleteMany', { userId: U }],
  ['flashcardTestResult', 'deleteMany', { userId: U }],
  ['studyBuddyRequest', 'deleteMany', { userId: U }],
  ['closeFriend', 'deleteMany', { ownerId: U }],
  ['closeFriend', 'deleteMany', { memberId: U }],
  ['sharedMoment', 'deleteMany', { userId: U }],
];

describe('listsErasureOps', () => {
  const ops = listsErasureOps(U) as unknown as Op[];

  it('gives every table its operation with the right where, close friends both ways', () => {
    expect(ops.map((o) => [o.model, o.method, o.args.where])).toEqual(EXPECTED);
  });

  it('keeps public personas, public feeds (either flag), and other members tuning', () => {
    expect(ops.find((o) => o.model === 'aiPersona')!.args.where).toMatchObject({
      isPublic: false,
      messages: { none: { userId: { not: U } } },
    });
    expect(ops.find((o) => o.model === 'customFeed')!.args.where).toMatchObject({
      isPublic: false,
      visibility: { not: 'PUBLIC' },
    });
    // No FeedSignal operation names the member as a target.
    const sig = ops.filter((o) => o.model === 'feedSignal');
    expect(sig).toHaveLength(1);
    expect(sig[0]!.args.where).toEqual({ userId: U });
  });

  it('clears the message of decided join requests instead of deleting them', () => {
    const up = ops.find((o) => o.method === 'updateMany')!;
    expect(up.model).toBe('communityJoinRequest');
    expect(up.args.data).toEqual({ message: null });
    expect(JSON.stringify(up.args.where)).toContain('PENDING');
  });

  it('touches nothing else', () => {
    const allowed = new Set(EXPECTED.map(([m]) => m));
    expect(ops.every((o) => allowed.has(o.model))).toBe(true);
    expect(ops.some((o) => o.model === 'studyBuddyMatch' || o.model === 'customFeedMember')).toBe(false);
  });

  it('runs inside anonymizeAccount', async () => {
    const fn = h.prismaMock.$transaction as ReturnType<typeof vi.fn>;
    fn.mockClear();
    await anonymizeAccount(U);
    const all = fn.mock.calls[0]![0] as Op[];
    for (const [m, method, w] of EXPECTED) {
      expect(
        all.some((o) => o.model === m && o.method === method && JSON.stringify(o.args.where) === JSON.stringify(w)),
      ).toBe(true);
    }
  });

  it('classifies all 18 tables as erase and the ceiling equals the todo entries left', () => {
    const models = [...new Set(EXPECTED.map(([m]) => m[0]!.toUpperCase() + m.slice(1)))];
    for (const m of models) expect(ERASURE_REGISTRY[m]?.decision).toBe('erase');
    expect(models).toHaveLength(18);
    const todo = Object.values(ERASURE_REGISTRY).filter((e) => e.decision === 'todo').length;
    expect(TODO_CEILING).toBe(todo);
  });
});
