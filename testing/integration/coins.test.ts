/**
 * Coin transfers — real money-adjacent state. A tip must move exactly the
 * amount, write the ledger row, and leave every balance untouched when it is
 * refused.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, closeDb, db } from './lib/client';

afterAll(closeDb);

const alice = () => new Client(inject('alice').cookies);
const bob = () => new Client(inject('bob').cookies);

async function balance(client: Client): Promise<number> {
  const res = await client.get('/api/coins');
  expect(res.status).toBe(200);
  return Number(res.body.coins);
}

async function tipsFromAliceToBob(): Promise<{ n: number; total: number }> {
  const { rows } = await db().query(
    'select count(*)::int as n, coalesce(sum(amount), 0)::int as total from coin_transaction where "senderId" = $1 and "recipientId" = $2',
    [inject('alice').id, inject('bob').id],
  );
  return rows[0];
}

const START = 40;

beforeAll(async () => {
  // No public endpoint mints coins on demand, so the starting balance is seeded.
  // The profile row is created lazily (not at sign-up), hence the upsert.
  await db().query(
    `insert into user_profile (id, "userId", coins, "updatedAt") values ($1, $2, $3, now())
     on conflict ("userId") do update set coins = excluded.coins`,
    [`it-profile-${inject('alice').id}`, inject('alice').id, START],
  );
});

describe('coins', () => {
  it('tips move exactly the amount and write one ledger row', async () => {
    const bobBefore = await balance(bob());
    const ledgerBefore = await tipsFromAliceToBob();

    const tip = await alice().post('/api/coins/tip', { recipientId: inject('bob').id, amount: 25, note: 'thanks' });
    expect(tip.status).toBe(200);
    expect(Number(tip.body.newBalance)).toBe(START - 25);

    expect(await balance(alice())).toBe(START - 25);
    expect(await balance(bob())).toBe(bobBefore + 25);
    const ledgerAfter = await tipsFromAliceToBob();
    expect(ledgerAfter.n).toBe(ledgerBefore.n + 1);
    expect(ledgerAfter.total).toBe(ledgerBefore.total + 25);
  });

  it('refuses an overdraft and a self-tip, changing nothing', async () => {
    const aliceBefore = await balance(alice());
    const bobBefore = await balance(bob());
    const ledgerBefore = await tipsFromAliceToBob();

    const overdraft = await alice().post('/api/coins/tip', { recipientId: inject('bob').id, amount: aliceBefore + 1 });
    expect(overdraft.status).toBe(400);
    expect(overdraft.body.error).toMatch(/not enough/i);

    const self = await alice().post('/api/coins/tip', { recipientId: inject('alice').id, amount: 1 });
    expect(self.status).toBe(400);

    expect(await balance(alice())).toBe(aliceBefore);
    expect(await balance(bob())).toBe(bobBefore);
    expect(await tipsFromAliceToBob()).toEqual(ledgerBefore);
  });
});
