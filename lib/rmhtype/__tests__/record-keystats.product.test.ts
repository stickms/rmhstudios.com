import { describe, expect, it } from 'vitest';
import { createKeyStatAccumulator, KEYSTAT_LIMITS } from '@/lib/rmhtype/keystats';
import { buildKeyStatsBody } from '@/lib/rmhtype/record-keystats';

function accumulate() {
  const acc = createKeyStatAccumulator();
  acc.record('a', 0, true);
  acc.record('a', 180, false);
  acc.record('b', 220, true);
  return acc.snapshot();
}

describe('buildKeyStatsBody', () => {
  it('gives one body with the three counters per key for a finished run', () => {
    const body = buildKeyStatsBody({ enabled: true, finished: true, aggregates: accumulate() });
    expect(body?.layout).toBe('qwerty');
    expect(body?.keys).toHaveLength(2);
    const a = body?.keys.find((k) => k.key === 'a');
    expect(a).toEqual({ key: 'a', attempts: 2, errors: 1, totalMs: 180 });
    for (const key of body?.keys ?? [])
      expect(Object.keys(key).sort()).toEqual(['attempts', 'errors', 'key', 'totalMs']);
  });

  it('gives none for an abandoned run', () => {
    expect(buildKeyStatsBody({ enabled: true, finished: false, aggregates: accumulate() })).toBeNull();
  });

  it('gives none when the switch is off, however the run ended', () => {
    expect(buildKeyStatsBody({ enabled: false, finished: true, aggregates: accumulate() })).toBeNull();
  });

  it('treats an unset switch as on (the default)', () => {
    expect(buildKeyStatsBody({ enabled: undefined, finished: true, aggregates: accumulate() })).not.toBeNull();
  });

  it('gives none when nothing was typed', () => {
    expect(buildKeyStatsBody({ enabled: true, finished: true, aggregates: [] })).toBeNull();
  });

  it('carries the layout it is given', () => {
    expect(
      buildKeyStatsBody({ enabled: true, finished: true, aggregates: accumulate(), layout: 'dvorak' })?.layout,
    ).toBe('dvorak');
  });

  it('sanitises: bounded key count, errors never above attempts, whole keys only', () => {
    const many = Array.from({ length: KEYSTAT_LIMITS.maxKeys + 40 }, (_v, i) => ({
      key: String.fromCodePoint(0x100 + i),
      attempts: 1,
      errors: 0,
      totalMs: 100,
    }));
    const body = buildKeyStatsBody({
      enabled: true,
      finished: true,
      aggregates: [
        ...many,
        { key: 'ab', attempts: 3, errors: 0, totalMs: 1 },
        { key: 'z', attempts: 2, errors: 9, totalMs: 1 },
      ],
    });
    expect(body?.keys.length).toBeLessThanOrEqual(KEYSTAT_LIMITS.maxKeys);
    expect(body?.keys.some((k) => k.key === 'ab')).toBe(false);
    for (const key of body?.keys ?? []) expect(key.errors).toBeLessThanOrEqual(key.attempts);
  });
});
