import { expect, it } from 'vitest';
import { UsageMeter } from '../meter';
import { loadPolicy } from '../policy';

it('meters a per-second bucket and a UTC-day budget per user', () => {
  let now = 0;
  const m = new UsageMeter(
    {
      ...loadPolicy({}),
      bytesPerSecond: 1000,
      bytesPerDay: 2500,
    },
    () => now,
  );
  expect(m.allowance('u')).toBe(1000);
  m.consume('u', 1000);
  expect(m.allowance('u')).toBe(0);
  now = 500;
  expect(m.allowance('u')).toBe(500);
  now = 10_000;
  m.consume('u', 1000);
  m.consume('u', 500);
  expect(m.dayExhausted('u')).toBe(true);
  expect(m.allowance('u')).toBe(0);
  expect(m.allowance('other')).toBe(1000);
  now = 86_400_000 + 1;
  expect(m.dayExhausted('u')).toBe(false);
});

it('prune drops users whose day rolled and bucket refilled, keeps the rest', () => {
  let now = 0;
  const m = new UsageMeter(
    {
      ...loadPolicy({}),
      bytesPerSecond: 1000,
      bytesPerDay: 2500,
    },
    () => now,
  );
  m.consume('old', 100);
  now = 1000;
  m.consume('same-day', 100);
  m.prune();
  expect(m.size).toBe(2); // day has not rolled
  now = 86_400_000 + 1;
  m.consume('fresh', 1000); // active today, bucket empty
  m.prune();
  expect(m.size).toBe(1);
  expect(m.allowance('fresh')).toBe(0);
});
