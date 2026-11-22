import { describe, expect, it } from 'vitest';
import { createPadGuard } from './pad-guard';

describe('createPadGuard', () => {
  it('a plain click on Start is allowed', () => {
    const g = createPadGuard();
    expect(g.allowClick()).toBe(true);
    expect(g.allowClick()).toBe(true);
  });

  it('a tap held when the pad becomes Start does not start a run when it is released', () => {
    const g = createPadGuard();
    g.press();
    g.toStart();
    g.release();
    // The click that the release fires is swallowed, once…
    expect(g.allowClick()).toBe(false);
    // …and the learner’s next click starts.
    expect(g.allowClick()).toBe(true);
  });

  it('a tap released before the pad became Start swallows nothing', () => {
    const g = createPadGuard();
    g.press();
    g.release();
    g.toStart();
    expect(g.allowClick()).toBe(true);
  });

  it('a release that fires no click (the pointer slid off) is settled, so a later click starts', () => {
    const g = createPadGuard();
    g.press();
    g.toStart();
    g.release();
    g.settle();
    expect(g.allowClick()).toBe(true);
  });

  it('becoming Start with nothing held leaves the first click alone', () => {
    const g = createPadGuard();
    g.toStart();
    expect(g.allowClick()).toBe(true);
  });
});
