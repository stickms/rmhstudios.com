/**
 * The per-address limit on wrong passwords (`lib/auth/sign-in-throttle.server.ts`): ten wrong passwords
 * lock password sign-in for that address, a correct one or a completed reset clears the count, an unknown
 * address locks exactly like a real one (no enumeration), and Redis is used when it answers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  redisIncrBy: vi.fn(async (..._a: unknown[]): Promise<number | null> => null),
  redisGetDel: vi.fn(async (_k: string): Promise<string | null> => null),
}));
vi.mock('@/lib/redis.server', () => ({ redisIncrBy: h.redisIncrBy, redisGetDel: h.redisGetDel }));

import {
  MAX_FAILURES,
  WINDOW_MS,
  assertSignInAllowed,
  clearSignInFailures,
  recordSignInFailure,
  throttleKey,
} from '@/lib/auth/sign-in-throttle.server';

let n = 0;
const fresh = () => `person${++n}@example.com`;

async function fail(email: string, times: number) {
  for (let i = 0; i < times; i++) await recordSignInFailure(email);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.redisIncrBy.mockResolvedValue(null);
});

describe('sign-in throttle (in-process)', () => {
  it(`allows ${MAX_FAILURES - 1} wrong passwords and locks at ${MAX_FAILURES}`, async () => {
    const email = fresh();
    await fail(email, MAX_FAILURES - 1);
    await expect(assertSignInAllowed(email)).resolves.toBeUndefined();
    await fail(email, 1);
    await expect(assertSignInAllowed(email)).rejects.toMatchObject({
      statusCode: 429,
      body: { code: 'SIGN_IN_LOCKED' },
    });
  });

  it('treats case and surrounding space as the same address', async () => {
    const email = fresh();
    await fail(`  ${email.toUpperCase()} `, MAX_FAILURES);
    await expect(assertSignInAllowed(email)).rejects.toMatchObject({ statusCode: 429 });
    expect(throttleKey(email)).toBe(throttleKey(` ${email.toUpperCase()}`));
  });

  it('does not store the address itself', () => {
    expect(throttleKey('someone@example.com')).not.toContain('someone');
  });

  it('a correct password (or a reset) clears the count', async () => {
    const email = fresh();
    await fail(email, MAX_FAILURES);
    await clearSignInFailures(email);
    await expect(assertSignInAllowed(email)).resolves.toBeUndefined();
    expect(h.redisGetDel).toHaveBeenCalledWith(throttleKey(email));
  });

  it('one address being locked does not lock another', async () => {
    const a = fresh();
    await fail(a, MAX_FAILURES);
    await expect(assertSignInAllowed(fresh())).resolves.toBeUndefined();
  });

  it('ignores a missing or non-string address', async () => {
    await expect(assertSignInAllowed(undefined)).resolves.toBeUndefined();
    await expect(recordSignInFailure(42)).resolves.toBeUndefined();
  });

  it('unlocks when the window ends', async () => {
    vi.useFakeTimers();
    try {
      const email = fresh();
      await fail(email, MAX_FAILURES);
      await expect(assertSignInAllowed(email)).rejects.toMatchObject({ statusCode: 429 });
      vi.advanceTimersByTime(WINDOW_MS + 1);
      await expect(assertSignInAllowed(email)).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('sign-in throttle (Redis)', () => {
  it('reads and counts on the state plane, with the window as TTL', async () => {
    const email = fresh();
    h.redisIncrBy.mockResolvedValueOnce(1);
    await recordSignInFailure(email);
    expect(h.redisIncrBy).toHaveBeenLastCalledWith(throttleKey(email), 1, WINDOW_MS);
    h.redisIncrBy.mockResolvedValueOnce(MAX_FAILURES);
    await expect(assertSignInAllowed(email)).rejects.toMatchObject({ statusCode: 429 });
    expect(h.redisIncrBy).toHaveBeenLastCalledWith(throttleKey(email), 0, WINDOW_MS);
  });
});
