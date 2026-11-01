import { describe, expect, it } from 'vitest';
import { singleFlight } from './single-flight';

describe('singleFlight', () => {
  it('runs once for concurrent callers and hands them the same result', async () => {
    let calls = 0;
    const connect = singleFlight(async () => {
      calls += 1;
      await Promise.resolve();
      return { id: calls };
    });
    const [a, b] = await Promise.all([connect(), connect()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it('starts fresh after settling, including after a rejection', async () => {
    let calls = 0;
    const connect = singleFlight(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return calls;
    });
    await expect(connect()).rejects.toThrow('boom');
    await expect(connect()).resolves.toBe(2);
    await expect(connect()).resolves.toBe(3);
  });
});
