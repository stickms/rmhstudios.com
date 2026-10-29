/** Portal: First Slice chambers: 60 s of simulation from the start (PORTAL_ROOT; skipped without it). */
import { describe, expect, it } from 'vitest';
import { portalRoot } from '../sp-root.test-support';
import { smokeMap } from './maps-smoke.shared';

describe.skipIf(!portalRoot())('Portal maps run', () => {
  it('testchmb_a_00 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_00');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

  it('testchmb_a_01 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_01');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

  it('testchmb_a_02 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_02');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

});
