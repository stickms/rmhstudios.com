/**
 * Keyword alerts. Kept in the mission-critical suite because the matcher
 * runs on the fan-out path for every post: member input must never become
 * regex syntax (a ReDoS there takes the worker down), and a false match
 * notifies people about posts they did not ask about.
 */
import { describe, it, expect } from 'vitest';
import { compileAlert, matches, trippedAlerts } from '@/lib/search/keyword-alerts';

describe('keyword alerts', () => {
  it('matches whole words, case- and accent-insensitively', () => {
    const a = compileAlert('café')!;
    expect(matches(a, 'Meet at the CAFE later')).toBe(true);
    expect(matches(compileAlert('art')!, 'start the stream')).toBe(false);
  });

  it('treats quoted phrases as ordered words across punctuation', () => {
    const a = compileAlert('"slice it" charts')!;
    expect(matches(a, 'New Slice-it charts dropped')).toBe(true);
    expect(matches(a, 'charts: it slice')).toBe(false);
  });

  it('applies exclusions and tag form', () => {
    const a = compileAlert('rochester -leak')!;
    expect(matches(a, 'rochester offensive patch')).toBe(true);
    expect(matches(a, 'rochester offensive LEAK')).toBe(false);
    const t = compileAlert('#sliceit')!;
    expect(matches(t, 'loving #SliceIt today')).toBe(true);
    expect(matches(t, 'loving sliceit today')).toBe(false);
  });

  it('never interprets member input as regex', () => {
    const a = compileAlert('(a+)+$ .* [x]')!;
    expect(a).not.toBeNull();
    const start = performance.now();
    expect(matches(a, 'a'.repeat(5000) + '!')).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
    expect(compileAlert('-only -negatives')).toBeNull();
    expect(compileAlert('   ')).toBeNull();
  });

  it('reports which alerts tripped', () => {
    const alerts = [compileAlert('bingo')!, compileAlert('swiss')!];
    expect(trippedAlerts(alerts, 'Swiss bracket tonight')).toEqual(['swiss']);
  });
});
