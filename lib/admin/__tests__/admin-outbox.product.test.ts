/** s05-03 outbox console: the pure shaping (topic order, ages, id lists). */
import { describe, expect, it } from 'vitest';
import { actionsForState, ageOf, formatAge, parseEventId, parseEventIds, sortTopics } from '@/lib/admin/outbox-admin';

const t = (topic: string, dead = 0) => ({
  topic,
  dead,
});

describe('sortTopics', () => {
  it('puts topics with dead events first, most dead first, then the rest by name', () => {
    expect(sortTopics([t('b'), t('c', 1), t('a'), t('d', 9), t('e', 1)]).map((x) => x.topic)).toEqual([
      'd',
      'c',
      'e',
      'a',
      'b',
    ]);
  });
  it('does not mutate its input', () => {
    const input = [t('b'), t('a', 1)];
    sortTopics(input);
    expect(input.map((x) => x.topic)).toEqual(['b', 'a']);
  });
});

describe('formatAge', () => {
  it('shows at most two units, largest first', () => {
    expect(formatAge(45_000)).toBe('45s');
    expect(formatAge(3 * 60_000 + 20_000)).toBe('3m');
    expect(formatAge(2 * 3600_000 + 5 * 60_000)).toBe('2h 5m');
    expect(formatAge(2 * 3600_000)).toBe('2h');
    expect(formatAge(4 * 86400_000 + 3 * 3600_000 + 59 * 60_000)).toBe('4d 3h');
    expect(formatAge(86400_000)).toBe('1d');
  });
  it('reads a negative, tiny or invalid age as 0s', () => {
    expect(formatAge(-5000)).toBe('0s');
    expect(formatAge(400)).toBe('0s');
    expect(formatAge(Number.NaN)).toBe('0s');
  });
});

describe('ageOf', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  it('is the age of the instant, or null when nothing is pending or the value is bad', () => {
    expect(ageOf('2026-11-21T09:55:00Z', now)).toBe('2h 5m');
    expect(ageOf(null, now)).toBeNull();
    expect(ageOf('not a date', now)).toBeNull();
  });
});

describe('event ids', () => {
  it('parses a comma list of bigint ids, deduplicated', () => {
    expect(parseEventIds('1, 2,2,9007199254740993')).toEqual([1n, 2n, 9007199254740993n]);
  });
  it('refuses empty, malformed, signed, over-large and over-long lists', () => {
    for (const bad of ['', '1,', 'a', '-1', '1.5', '0x10', '9223372036854775808', '1 2'])
      expect(parseEventIds(bad), bad).toBeNull();
    expect(
      parseEventIds(
        Array.from(
          {
            length: 101,
          },
          (_, i) => i + 1,
        ).join(','),
      ),
    ).toBeNull();
    expect(
      parseEventIds(
        Array.from(
          {
            length: 100,
          },
          (_, i) => i + 1,
        ).join(','),
      ),
    ).toHaveLength(100);
  });
  it('parses one id', () => {
    expect(parseEventId('42')).toBe(42n);
    expect(parseEventId('9223372036854775807')).toBe(9223372036854775807n);
    expect(parseEventId('9223372036854775808')).toBeNull();
    expect(parseEventId('4 2')).toBeNull();
  });
});

describe('actionsForState', () => {
  it('allows requeue and discard on dead events only', () => {
    expect(actionsForState('dead')).toEqual(['requeue', 'discard']);
    expect(actionsForState('pending')).toEqual([]);
  });
});
