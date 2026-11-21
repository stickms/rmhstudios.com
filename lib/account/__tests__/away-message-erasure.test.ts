import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `AwayMessage` and `AwayReplySent` (which only cascade from
 * the user) must be deleted explicitly, and the export carries the away message.
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
import { exportAwayMessage } from '@/lib/messages/away.server';

describe('anonymizeAccount (away message)', () => {
  it('deletes the away message and its reply markers', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const markers = tx.find((o) => o.model === 'awayReplySent' && o.method === 'deleteMany');
    expect(markers?.args).toEqual({ where: { away: { userId: 'user-1' } } });
    const away = tx.find((o) => o.model === 'awayMessage' && o.method === 'deleteMany');
    expect(away?.args).toEqual({ where: { userId: 'user-1' } });
  });
});

describe('exportAwayMessage', () => {
  it('returns the text and dates, or null when none is set', async () => {
    const find = vi.fn();
    (prismaMock as Record<string, unknown>)['awayMessage'] = { findUnique: find };
    find.mockResolvedValueOnce(null);
    expect(await exportAwayMessage('u')).toBeNull();
    find.mockResolvedValueOnce({
      body: 'Back soon',
      startsAt: new Date('2026-12-01T00:00:00Z'),
      endsAt: new Date('2026-12-05T00:00:00Z'),
      tz: 'UTC',
      showOnProfile: true,
      createdAt: new Date('2026-11-30T00:00:00Z'),
    });
    expect(await exportAwayMessage('u')).toMatchObject({ body: 'Back soon', endsAt: '2026-12-05T00:00:00.000Z' });
  });
});
