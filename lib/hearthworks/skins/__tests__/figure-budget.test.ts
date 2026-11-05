import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { CharacterAnimator, newDrive } from '../animator';
import { DEFAULT_BUDGET, planBudget, type BudgetEntry, type Tier } from '../figure-budget';
import { FigureRegistry } from '../figure-registry';
import { FIXTURE_ENTRY, buildFixture } from './fixture-model';

const crowd = (n: number, visible = true): BudgetEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, distSq: (i + 1) ** 2, pinned: false, visible }));

const count = (m: Map<number, Tier>, t: Tier) => [...m.values()].filter((v) => v === t).length;

describe('planBudget', () => {
  const opts = { full: 4, slow: 3, models: 10, hysteresis: 2 };

  it('gives the nearest the full rate, then slow, then frozen, then the procedural figure', () => {
    const plan = planBudget(crowd(20), new Map(), opts);
    expect(plan.get(1)).toBe('full');
    expect(plan.get(4)).toBe('full');
    expect(plan.get(5)).toBe('slow');
    expect(plan.get(7)).toBe('slow');
    expect(plan.get(8)).toBe('frozen');
    expect(count(plan, 'full')).toBe(4);
    expect(count(plan, 'slow')).toBe(3);
    // newcomers need a margin to become models, so the cut sits `hysteresis` ranks inside the cap
    expect(count(plan, 'proc')).toBe(20 - (opts.models - opts.hysteresis));
  });

  it('never exceeds the model cap (plus the hysteresis margin) however big the crowd', () => {
    const plan = planBudget(crowd(500), new Map(), DEFAULT_BUDGET);
    const models = 500 - count(plan, 'proc');
    expect(models).toBeLessThanOrEqual(DEFAULT_BUDGET.models);
    expect(count(plan, 'full')).toBeLessThanOrEqual(DEFAULT_BUDGET.full);
  });

  it('always keeps pinned figures at full rate, even when they are far', () => {
    const entries = [...crowd(30), { id: 99, distSq: 1e6, pinned: true, visible: false }];
    const plan = planBudget(entries, new Map(), opts);
    expect(plan.get(99)).toBe('full');
    // and they do not cost the near ones their place beyond the one slot
    expect(plan.get(1)).toBe('full');
  });

  it('freezes figures that are off screen instead of animating them', () => {
    const entries = [...crowd(3), ...crowd(3, false).map((e) => ({ ...e, id: e.id + 100, distSq: 0.01 }))];
    const plan = planBudget(entries, new Map(), opts);
    for (const id of [101, 102, 103]) expect(plan.get(id)).toBe('frozen');
    for (const id of [1, 2, 3]) expect(plan.get(id)).toBe('full');
  });

  it('does not flicker at the cut: a model keeps its place a little past the cap, a procedural one needs to be inside it', () => {
    const was = new Map<number, Tier>();
    for (let id = 1; id <= 12; id++) was.set(id, id <= 11 ? 'frozen' : 'proc');
    // ids 1..11 were models: the 11th sits past the cap of 10 but inside the margin; the 12th was procedural and stays so
    const plan = planBudget(crowd(12), was, opts);
    expect(plan.get(11)).toBe('frozen');
    expect(plan.get(12)).toBe('proc');
    // a procedural figure at the same rank stays procedural
    const fresh = planBudget(crowd(12), new Map(), opts);
    expect(fresh.get(10)).toBe('proc');
    expect(fresh.get(9)).toBe('proc');
    expect(fresh.get(8)).toBe('frozen');
  });

  it('is deterministic for ties', () => {
    const e = [3, 1, 2].map((id) => ({ id, distSq: 5, pinned: false, visible: true }));
    expect([...planBudget(e, new Map(), opts).keys()].sort()).toEqual([1, 2, 3]);
    expect(planBudget(e, new Map(), opts)).toEqual(planBudget([...e].reverse(), new Map(), opts));
  });
});

describe('FigureRegistry', () => {
  function crowdOf(n: number, budget = { full: 6, slow: 4, models: 14, hysteresis: 2 }) {
    const reg = new FigureRegistry(budget);
    const handles = Array.from({ length: n }, (_, i) => {
      const h = reg.register({ pinned: false, drive: newDrive() });
      const g = new Group();
      g.position.set(i * 0.5, 0, 0);
      g.updateMatrixWorld(true);
      h.object = g;
      const f = buildFixture();
      h.animator = new CharacterAnimator(f.scene, new Map(f.animations.map((c) => [c.name, c])), FIXTURE_ENTRY, { seed: i / n });
      return h;
    });
    return { reg, handles };
  }

  it('updates only the nearest animators at full rate and never the frozen ones', () => {
    const { reg, handles } = crowdOf(40);
    const focus = { x: 0, z: 0 };
    reg.frame(1 / 60, focus); // plans
    const updated = reg.frame(1 / 60, focus);
    expect(updated).toBeLessThanOrEqual(6 + 4);
    expect(updated).toBeGreaterThanOrEqual(6);
    // near ones are full, far ones procedural
    expect(reg.tierOf(handles[0].id)).toBe('full');
    expect(reg.tierOf(handles[39].id)).toBe('proc');
    expect(reg.wantsModel(handles[0].id)).toBe(true);
    expect(reg.wantsModel(handles[39].id)).toBe(false);
    expect(reg.modelCount()).toBeLessThanOrEqual(14 + 2);
    // slow figures update about once per 0.1s, not every frame
    const slow = handles.find((h) => h.tier === 'slow')!;
    let slowUpdates = 0;
    const orig = slow.animator!.update.bind(slow.animator);
    slow.animator!.update = (dt, d) => {
      slowUpdates++;
      orig(dt, d);
    };
    for (let i = 0; i < 60; i++) reg.frame(1 / 60, focus);
    expect(slowUpdates).toBeGreaterThanOrEqual(8);
    expect(slowUpdates).toBeLessThanOrEqual(11);
  });

  it('re-ranks as the camera moves, and tells figures when they become models or stop being', () => {
    const { reg, handles } = crowdOf(40);
    reg.frame(0.3, { x: 0, z: 0 });
    const far = handles[39];
    let notified = 0;
    reg.subscribe(far.id, () => notified++);
    expect(reg.wantsModel(far.id)).toBe(false);
    reg.frame(0.3, { x: 40 * 0.5, z: 0 });
    expect(reg.wantsModel(far.id)).toBe(true);
    expect(notified).toBe(1);
    expect(reg.wantsModel(handles[0].id)).toBe(false);
  });

  it('freezes figures outside the camera frustum', () => {
    const { reg, handles } = crowdOf(5);
    const cam = new PerspectiveCamera(30, 1, 0.1, 100);
    cam.position.set(0, 1, 5);
    cam.lookAt(0, 0.2, 0);
    handles[4].object!.position.set(500, 0, 0); // far to the side
    handles[4].object!.updateMatrixWorld(true);
    reg.frame(0.3, { x: 0, z: 0 }, cam);
    expect(reg.tierOf(handles[4].id)).toBe('frozen');
    expect(reg.tierOf(handles[0].id)).toBe('full');
  });

  it('everyone falls back to procedural when disabled (a lost context) and comes back after', () => {
    const { reg, handles } = crowdOf(3);
    reg.frame(0.3, { x: 0, z: 0 });
    let n = 0;
    reg.subscribe(handles[0].id, () => n++);
    reg.setDisabled(true);
    expect(handles.some((h) => reg.wantsModel(h.id))).toBe(false);
    reg.setDisabled(false);
    expect(reg.wantsModel(handles[0].id)).toBe(true);
    expect(n).toBe(2);
  });

  it('unregistering forgets a figure, and a disposed animator is skipped', () => {
    const { reg, handles } = crowdOf(3);
    reg.frame(0.3, { x: 0, z: 0 });
    handles[1].animator!.dispose();
    expect(() => reg.frame(1 / 60, { x: 0, z: 0 })).not.toThrow();
    reg.unregister(handles[2].id);
    expect(reg.size).toBe(2);
    expect(reg.wantsModel(handles[2].id)).toBe(false);
  });

  it('a pinned figure is always a full model', () => {
    const reg = new FigureRegistry({ full: 1, slow: 0, models: 1, hysteresis: 0 });
    const own = reg.register({ pinned: true, drive: newDrive() });
    for (let i = 0; i < 5; i++) reg.register({ pinned: false, drive: newDrive() });
    reg.frame(0.3, { x: 0, z: 0 });
    expect(reg.tierOf(own.id)).toBe('full');
    expect(reg.wantsModel(own.id)).toBe(true);
  });
});
