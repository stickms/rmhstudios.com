import { describe, it, expect } from 'vitest';
import { scrollWorldX, laneWorldY, LANE_SPREAD, WORLD_LOOKAHEAD_S } from '@/lib/game/render3d/fieldMapping';

describe('fieldMapping', () => {
  it('a note exactly on time sits at the hit line (x=0)', () => {
    expect(scrollWorldX(0, 1)).toBe(0);
  });

  it('future notes are ahead (positive x), proportional to time', () => {
    const a = scrollWorldX(1, 1);
    const b = scrollWorldX(2, 1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(2 * a, 6);
  });

  it('a full lookahead-window note sits at the spawn edge (x = WORLD_LOOKAHEAD_S scaled)', () => {
    // At speedMod 1, a note 3s out is one lookahead window away.
    expect(scrollWorldX(WORLD_LOOKAHEAD_S, 1)).toBeCloseTo(WORLD_LOOKAHEAD_S * scrollWorldX(1, 1), 6);
  });

  it('higher speedMod pushes the same note closer (faster scroll)', () => {
    expect(scrollWorldX(1, 2)).toBeLessThan(scrollWorldX(1, 1));
  });

  it('two lanes are symmetric about 0, LANE_SPREAD apart', () => {
    const y0 = laneWorldY(0, { speedMod: 1, oneTrack: false });
    const y1 = laneWorldY(1, { speedMod: 1, oneTrack: false });
    expect(y0).toBeCloseTo(LANE_SPREAD / 2, 6);
    expect(y1).toBeCloseTo(-LANE_SPREAD / 2, 6);
  });

  it('oneTrack collapses both lanes to center', () => {
    expect(laneWorldY(0, { speedMod: 1, oneTrack: true })).toBe(0);
    expect(laneWorldY(1, { speedMod: 1, oneTrack: true })).toBe(0);
  });
});
