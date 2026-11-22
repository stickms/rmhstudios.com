import { describe, expect, it } from 'vitest';
import { QUALITY_NAMES, SIZE_NAMES } from '../theory/staff-intervals';
import { INTERVAL_TIMES, STAFF_TIMES, gradeAttempt } from './grade';
import { intervalItemId, isKnownItemId, itemFamily } from './items';

describe('interval reading items', () => {
  it('has an id for every direction and every size and quality name, and the server accepts it', () => {
    for (const dir of ['up', 'down'] as const)
      for (const name of [...SIZE_NAMES, ...QUALITY_NAMES]) {
        const id = intervalItemId(dir, name);
        expect(id.length).toBeLessThanOrEqual(64);
        expect(itemFamily(id), id).toBe('interval');
        expect(isKnownItemId(id)).toBe(true);
      }
    expect(intervalItemId('down', 'minor-second')).toBe('int:down:minor-second');
  });

  it('rejects an id no lesson produces', () => {
    for (const id of [
      'int:up',
      'int:sideways:third',
      'int:up:unison',
      'int:up:Third',
      'int:up:third:extra',
      'int::third',
      'interval:up:third',
    ]) {
      expect(isKnownItemId(id), id).toBe(false);
    }
  });

  it('leaves the other families as they were', () => {
    expect(itemFamily('treble:64')).toBe('staff');
    expect(itemFamily('ear:interval:third')).toBe('ear');
    expect(itemFamily('sprint:note:treble:64:0')).toBe('sprint');
  });
});

describe('INTERVAL_TIMES', () => {
  it('is more patient than reading one note, and still grades by speed', () => {
    expect(INTERVAL_TIMES.fastMs).toBeGreaterThan(STAFF_TIMES.fastMs);
    expect(INTERVAL_TIMES.slowMs).toBeGreaterThan(STAFF_TIMES.slowMs);
    expect(gradeAttempt({ right: true, ms: 2500 }, INTERVAL_TIMES)).toBe('easy');
    expect(gradeAttempt({ right: true, ms: 2500 }, STAFF_TIMES)).toBe('good');
    expect(gradeAttempt({ right: true, ms: 12000 }, INTERVAL_TIMES)).toBe('hard');
    expect(gradeAttempt({ right: false, ms: 500 }, INTERVAL_TIMES)).toBe('again');
  });
});
