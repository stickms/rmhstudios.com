import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInputHub } from './hub';
import { createKeyboardInput } from './keyboard';
import { createScreenInput } from './screen';
import { bindMicRelease } from './mic-lifecycle';

// Idle CPU: once the inputs are stopped and the screens unbound, nothing is
// left listening or ticking (no timer, no window or document listener).

function countingTarget() {
  const live = new Map<string, number>();
  return {
    live,
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string) => live.set(type, (live.get(type) ?? 0) + 1),
    removeEventListener: (type: string) => live.set(type, (live.get(type) ?? 0) - 1),
    total: () => [...live.values()].reduce((a, b) => a + b, 0),
  };
}

describe('idle after stop', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keys + screen started, then stopped and unbound: no listener and no timer remain', async () => {
    vi.useFakeTimers();
    const win = countingTarget();
    const doc = countingTarget();
    vi.stubGlobal('window', win);
    const hub = createInputHub([createKeyboardInput(), createScreenInput()]);
    const unbind = bindMicRelease({ hub, doc, win });
    await hub.start('keys');
    await hub.start('screen');
    expect(win.total()).toBeGreaterThan(0);
    hub.stop('keys');
    hub.stop('screen');
    unbind();
    expect(win.total()).toBe(0);
    expect(doc.total()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(hub.active()).toEqual([]);
  });
});
