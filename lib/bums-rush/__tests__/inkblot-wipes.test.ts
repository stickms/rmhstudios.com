/**
 * "Send the cat after N splats" counts party WIPES, not simulation ticks.
 *
 * `updateDeaths` runs every step and a wipe lasts the whole respawn delay, so
 * counting inside it made Inkblot arrive a few ticks after the FIRST death
 * whatever the setting said (found by playing: one splat, cat active).
 */
import { describe, expect, it } from 'vitest';
import { input, makeLevel, simFor } from './rig';

describe('Inkblot wipe counting', () => {
  it('arrives on the Nth wipe, not on the first death', () => {
    // No floor under the spawn: every life falls out of bounds and dies.
    const level = makeLevel({ bounds: { x: -400, y: -400, w: 800, h: 800 } });
    const sim = simFor(level, 1, { catAfterWipes: 3 });
    let deaths = 0;
    let deathsAtCat = -1;
    for (let step = 0; step < 6000 && deathsAtCat < 0; step++) {
      sim.step([input(0, step + 1, { x: 0, y: 0 }, { x: 0, y: 0 }, 0, 0)]);
      for (const e of sim.drainEvents()) {
        if (e.kind === 'death') deaths++;
        if (e.kind === 'cat') deathsAtCat = deaths;
      }
    }
    expect(deathsAtCat).toBe(3);
  });
});
