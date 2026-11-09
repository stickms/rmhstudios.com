import { describe, expect, it, vi } from 'vitest';
import type { InputHub, InputPhase } from './hub';
import type { InputAdapter, InputSource } from './events';
import { createInputHub } from './hub';
import { bindMicRelease, releaseMic, startMic } from './mic-lifecycle';

function fakeHub(opts: { startHangs?: boolean } = {}) {
  const phases = new Map<InputSource, InputPhase>();
  let resolveStart: (() => void) | null = null;
  const active = () => [...phases].filter(([, p]) => p === 'active').map(([s]) => s);
  const hub = {
    subscribe: vi.fn(() => () => {}),
    start: vi.fn((s: InputSource) => {
      if (opts.startHangs) {
        phases.set(s, 'starting');
        return new Promise<void>((r) => {
          resolveStart = () => {
            phases.set(s, 'active');
            r();
          };
        });
      }
      phases.set(s, 'active');
      return Promise.resolve();
    }),
    stop: vi.fn((s: InputSource) => {
      phases.delete(s);
    }),
    active: vi.fn(active),
    lastError: vi.fn(() => null),
    phase: vi.fn((s: InputSource) => phases.get(s) ?? 'idle'),
    phases: vi.fn(() => ({
      mic: phases.get('mic') ?? 'idle',
      midi: phases.get('midi') ?? 'idle',
      keys: phases.get('keys') ?? 'idle',
      screen: phases.get('screen') ?? 'idle',
    })),
    onChange: vi.fn(() => () => {}),
  } satisfies InputHub;
  return { hub, finishStart: () => resolveStart?.() };
}

/** Minimal event targets standing in for `document` and `window`. */
function fakeEnv() {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const win = new EventTarget();
  return { doc, win };
}

describe('mic lifecycle', () => {
  it('stops a running mic when the page becomes hidden', async () => {
    const { hub } = fakeHub();
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    await startMic(hub);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(hub.stop).toHaveBeenCalledWith('mic');
    unbind();
  });

  it('does nothing when the page becomes visible again', async () => {
    const { hub } = fakeHub();
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    await startMic(hub);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(hub.stop).not.toHaveBeenCalled();
    unbind();
  });

  it('stops a running mic on pagehide', async () => {
    const { hub } = fakeHub();
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    await startMic(hub);
    win.dispatchEvent(new Event('pagehide'));
    expect(hub.stop).toHaveBeenCalledWith('mic');
    unbind();
  });

  it('stops a running mic when the screen unbinds (unmount)', async () => {
    const { hub } = fakeHub();
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    await startMic(hub);
    unbind();
    expect(hub.stop).toHaveBeenCalledWith('mic');
    // Listeners are gone: a later hide does not stop again.
    hub.stop.mockClear();
    win.dispatchEvent(new Event('pagehide'));
    expect(hub.stop).not.toHaveBeenCalled();
  });

  it('stops a mic whose start is still pending (permission prompt open)', () => {
    const { hub } = fakeHub({ startHangs: true });
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    void startMic(hub);
    unbind();
    expect(hub.stop).toHaveBeenCalledWith('mic');
  });

  it('never calls stop when the mic was never started', () => {
    const { hub } = fakeHub();
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    unbind();
    releaseMic(hub);
    expect(hub.stop).not.toHaveBeenCalled();
  });

  it('touches no other source and reports a release', async () => {
    const { hub } = fakeHub();
    const { doc, win } = fakeEnv();
    const onRelease = vi.fn();
    const unbind = bindMicRelease({ hub, doc, win, onRelease });
    await hub.start('midi');
    await startMic(hub);
    win.dispatchEvent(new Event('pagehide'));
    expect(hub.stop.mock.calls).toEqual([['mic']]);
    expect(hub.active()).toEqual(['midi']);
    expect(onRelease).toHaveBeenCalledTimes(1);
    unbind();
  });

  it('a start that fails is no longer pending', async () => {
    const { hub } = fakeHub();
    hub.start.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')));
    await expect(startMic(hub)).rejects.toThrow();
    releaseMic(hub);
    expect(hub.stop).not.toHaveBeenCalled();
  });

  it("a hidden tab stops a real hub's mic and nothing restarts it", async () => {
    let starts = 0;
    let stops = 0;
    const mic: InputAdapter = {
      source: 'mic',
      start: async () => {
        starts++;
      },
      stop: () => {
        stops++;
      },
      subscribe: () => () => {},
    };
    const hub = createInputHub([mic]);
    const { doc, win } = fakeEnv();
    const unbind = bindMicRelease({ hub, doc, win });
    await startMic(hub);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(hub.phase('mic')).toBe('idle');
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pageshow'));
    await Promise.resolve();
    expect(hub.phase('mic')).toBe('idle');
    expect(starts).toBe(1);
    expect(stops).toBe(1);
    unbind();
    expect(stops).toBe(1);
  });
});
