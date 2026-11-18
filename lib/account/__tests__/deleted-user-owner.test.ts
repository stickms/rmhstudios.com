import { describe, expect, it, vi } from 'vitest';

/**
 * Vibes of a deleted account are not erased (remixes and feed embeds depend on them): they move to
 * the shared "Deleted user" owner, while the person's own per-user vibe state is deleted.
 */

type Op = { model: string; method: string; args: unknown };

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) },
    );
  return new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { DELETED_ACCOUNT_BAN_REASON, isDeletedAccount } from '@/lib/account-lifecycle';
import { canEditVibe } from '@/lib/rmhvibe/ownership';

const tx = () =>
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];

describe('deleted account vibes', () => {
  it('reassigns owned vibe pages to the Deleted user and deletes user-scope vibe state', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount('user-1');
    const ops = tx();
    expect(ops.find((o) => o.model === 'vibePage' && o.method === 'updateMany')?.args).toEqual({
      where: { ownerId: 'user-1' },
      data: { ownerId: DELETED_USER_ID },
    });
    expect(ops.find((o) => o.model === 'vibeKv' && o.method === 'deleteMany')?.args).toEqual({
      where: { scope: 'user', ownerKey: 'user-1' },
    });
  });

  it('never anonymises the Deleted user itself', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount(DELETED_USER_ID);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('is a tombstone for every tombstone-aware check, even without a ban reason', () => {
    expect(isDeletedAccount({ id: DELETED_USER_ID })).toBe(true);
    expect(isDeletedAccount({ id: DELETED_USER_ID, banReason: DELETED_ACCOUNT_BAN_REASON })).toBe(
      true,
    );
    expect(isDeletedAccount({ id: 'user-1', banReason: null })).toBe(false);
  });

  it('is nobody’s session, so others remix instead of editing', () => {
    expect(canEditVibe(DELETED_USER_ID, 'user-1')).toBe(false);
    expect(canEditVibe(DELETED_USER_ID, null)).toBe(false);
  });
});
