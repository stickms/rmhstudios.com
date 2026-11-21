import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';

describe('lockKey', () => {
  it('takes a transaction-scoped advisory lock on the hashed key, as a bound parameter', async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const executeRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join('$'), values });
      return Promise.resolve(1);
    });
    const tx = { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient;

    await lockKey(tx, 'reader-marks:user_1');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(calls[0]?.sql).toBe('SELECT pg_advisory_xact_lock(hashtext($))');
    // The key travels as a parameter, never spliced into the SQL text.
    expect(calls[0]?.values).toEqual(['reader-marks:user_1']);
  });

  it('propagates a failure so the surrounding transaction rolls back', async () => {
    const tx = {
      $executeRaw: () => Promise.reject(new Error('lock timeout')),
    } as unknown as Prisma.TransactionClient;
    await expect(lockKey(tx, 'k')).rejects.toThrow('lock timeout');
  });
});
