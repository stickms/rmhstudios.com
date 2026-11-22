import { describe, expect, it } from 'vitest';
import { EAR_TIMES, STAFF_TIMES, gradeAttempt } from './grade';

describe('gradeAttempt', () => {
  it('grades a miss again, however fast', () => {
    expect(gradeAttempt({ right: false, ms: 200 })).toBe('again');
    expect(gradeAttempt({ right: false, ms: null })).toBe('again');
  });

  it('grades a right answer by its speed', () => {
    expect(gradeAttempt({ right: true, ms: STAFF_TIMES.fastMs })).toBe('easy');
    expect(gradeAttempt({ right: true, ms: 4000 })).toBe('good');
    expect(gradeAttempt({ right: true, ms: STAFF_TIMES.slowMs })).toBe('hard');
  });

  it('gives an untimed or untrustworthy right answer good', () => {
    expect(gradeAttempt({ right: true, ms: null })).toBe('good');
    expect(gradeAttempt({ right: true, ms: Number.NaN })).toBe('good');
    expect(gradeAttempt({ right: true, ms: -5 })).toBe('good');
  });

  it('uses the bands it is given', () => {
    expect(gradeAttempt({ right: true, ms: 3000 }, EAR_TIMES)).toBe('easy');
    expect(gradeAttempt({ right: true, ms: 3000 })).toBe('good');
  });
});
