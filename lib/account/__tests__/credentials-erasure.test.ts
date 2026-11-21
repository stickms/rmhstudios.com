import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so every credential and outbound-access row
 * that only cascades from the user must be deleted explicitly, or it keeps working for a tombstone
 * (an API key keeps authenticating, a webhook keeps POSTing to a third party).
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
      { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) },
    );
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

async function opsOf(): Promise<Op[]> {
  await anonymizeAccount('user-1');
  const calls = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]![0] as Op[];
}

const find = (ops: Op[], model: string, method = 'deleteMany') =>
  ops.filter((o) => o.model === model && o.method === method);

describe('anonymizeAccount (credentials and outbound access)', () => {
  it.each([
    ['developerApiKey', { userId: 'user-1' }],
    ['webhookEndpoint', { userId: 'user-1' }],
    ['rmhCodeToken', { userId: 'user-1' }],
    ['recoveryCode', { userId: 'user-1' }],
    ['recoveryRequest', { userId: 'user-1' }],
    ['calendarFeed', { userId: 'user-1' }],
    ['account', { userId: 'user-1' }],
    ['passkey', { userId: 'user-1' }],
    ['session', { userId: 'user-1' }],
    ['pushSubscription', { userId: 'user-1' }],
    ['verification', { value: 'user-1' }],
    ['communityInvite', { createdById: 'user-1' }],
    ['doctrineRecruitmentCode', { recruiterId: 'user-1' }],
    ['tf2HudShare', { hud: { ownerId: 'user-1' } }],
  ])('deletes %s scoped to the account', async (model, where) => {
    const ops = find(await opsOf(), model);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.args).toEqual({ where });
  });

  it('removes trusted contacts in both directions', async () => {
    const ops = find(await opsOf(), 'trustedContact');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.args).toEqual({ where: { OR: [{ userId: 'user-1' }, { contactId: 'user-1' }] } });
  });

  it('skips queued campaign mail for the account', async () => {
    const ops = find(await opsOf(), 'emailCampaignRecipient', 'updateMany');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.args).toEqual({
      where: { userId: 'user-1', status: { in: ['pending', 'claimed'] } },
      data: { status: 'skipped' },
    });
  });

  it('keeps billing records (subscription rows are not deleted)', async () => {
    expect(find(await opsOf(), 'subscription')).toHaveLength(0);
  });
});
