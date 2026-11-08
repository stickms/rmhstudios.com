import { describe, expect, it } from 'vitest';
import { createOnceGuard } from './once';

describe('createOnceGuard', () => {
  it('lets exactly one of several claims in the same tick through', () => {
    const guard = createOnceGuard();
    const results = [guard.claim(), guard.claim(), guard.claim()];
    expect(results).toEqual([true, false, false]);
    expect(guard.claimed()).toBe(true);
  });

  it('can be claimed again only after a deliberate reset', () => {
    const guard = createOnceGuard();
    expect(guard.claim()).toBe(true);
    expect(guard.claim()).toBe(false);
    guard.reset();
    expect(guard.claimed()).toBe(false);
    expect(guard.claim()).toBe(true);
    expect(guard.claim()).toBe(false);
  });
});
