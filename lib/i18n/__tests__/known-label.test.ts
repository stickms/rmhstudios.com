import { describe, expect, it } from 'vitest';
import { knownLabel } from '@/lib/i18n/known-label';

describe('knownLabel', () => {
  const labels = { news: 'Nouvelles' };

  it('returns the label of a value the map knows', () => {
    expect(knownLabel(labels, 'news')).toBe('Nouvelles');
  });

  it('returns undefined for a value it does not know, including prototype names', () => {
    expect(knownLabel(labels, 'blog')).toBeUndefined();
    expect(knownLabel(labels, 'constructor')).toBeUndefined();
    expect(knownLabel(labels, 'toString')).toBeUndefined();
  });
});
