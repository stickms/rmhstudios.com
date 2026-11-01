import { describe, it, expect } from 'vitest';
import { VOLUME_STEP, stepVolume } from '@/lib/rmhmusic/volume';

describe('stepVolume', () => {
  it('moves in 5% steps without floating-point drift', () => {
    expect(stepVolume(0.7, VOLUME_STEP)).toBe(0.75);
    expect(stepVolume(0.75, VOLUME_STEP)).toBe(0.8);
    expect(stepVolume(0.35, -VOLUME_STEP)).toBe(0.3);
  });

  it('clamps to the 0-1 range', () => {
    expect(stepVolume(0.98, VOLUME_STEP)).toBe(1);
    expect(stepVolume(1, VOLUME_STEP)).toBe(1);
    expect(stepVolume(0.02, -VOLUME_STEP)).toBe(0);
    expect(stepVolume(0, -VOLUME_STEP)).toBe(0);
  });

  it('snaps an off-grid slider value onto the grid', () => {
    expect(stepVolume(0.63, VOLUME_STEP)).toBe(0.7);
    expect(stepVolume(0.63, -VOLUME_STEP)).toBe(0.6);
  });
});
