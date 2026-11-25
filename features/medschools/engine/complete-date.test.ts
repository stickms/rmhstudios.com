import { describe, expect, it } from 'vitest';
import { completeDateOf } from './tracker';

describe('completeDateOf (owner 2026-11-24: no complete date means the secondary submitted date)', () => {
  it('uses COMPLETE when present', () => {
    expect(
      completeDateOf([
        { type: 'SECONDARY_SUBMITTED', date: '2026-07-10' },
        { type: 'COMPLETE', date: '2026-07-15' },
      ]),
    ).toEqual({ on: '2026-07-15', from: 'COMPLETE' });
  });
  it('falls back to SECONDARY_SUBMITTED', () => {
    expect(completeDateOf([{ type: 'SECONDARY_SUBMITTED', date: '2026-07-10' }])).toEqual({
      on: '2026-07-10',
      from: 'SECONDARY_SUBMITTED',
    });
  });
  it('is null with neither', () => {
    expect(completeDateOf([{ type: 'SECONDARY', date: '2026-07-01' }])).toBeNull();
  });
});
