/** Portal: First Slice chambers: 60 s of simulation from the start (PORTAL_ROOT; skipped without it). */
import { describe, expect, it } from 'vitest';
import { portalRoot } from '../sp-root.test-support';
import { smokeMap } from './maps-smoke.shared';

describe.skipIf(!portalRoot())('Portal maps run', () => {
  it('testchmb_a_03 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_03');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

  it('testchmb_a_04 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_04');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

  it('testchmb_a_05 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_05');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

  it('testchmb_a_06 runs 60 s', async () => {
    const d = await smokeMap('portal', 'testchmb_a_06');
    expect(d.w.player.dead).toBe(false);
  }, 180_000);

});
