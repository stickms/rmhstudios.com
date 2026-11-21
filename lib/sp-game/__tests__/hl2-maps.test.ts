/** Half-Life 2 demo maps: 60 s of simulation from the start (HL2_ROOT; skipped without it). */
import { describe, expect, it } from 'vitest';
import { hl2Root } from '../sp-root.test-support';
import { smokeMap } from './maps-smoke.shared';

describe.skipIf(!hl2Root())('HL2 demo maps run', () => {
  it('d1_trainstation_01: the intro plays (G-Man, viewcontrols, script_intro) without errors', async () => {
    const d = await smokeMap('hl2', 'd1_trainstation_01');
    expect(d.fired('viewcontrol_left_eye.enable')).toBe(true);
    expect(d.fired('scene2_lcs_intro.start')).toBe(true);
    expect(d.events.some((e) => e.type === 'sound')).toBe(true);
  }, 180_000);

  it('d1_trainstation_02 runs 60 s', async () => {
    const d = await smokeMap('hl2', 'd1_trainstation_02');
    expect(d.w.player.health).toBe(100);
  }, 180_000);
});
