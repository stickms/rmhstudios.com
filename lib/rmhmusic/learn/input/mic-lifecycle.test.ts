import { describe, expect, it, vi } from 'vitest';
import type { InputHub } from './hub';
import type { InputSource } from './events';
import { bindMicRelease, releaseMic, startMic } from './mic-lifecycle';

function fakeHub(opts: { startHangs?: boolean } = {}) {
  const active = new Set<InputSource>();
  let resolveStart: (() => void) | null = null;
  const hub = {
    subscribe: vi.fn(() => () => {}),
    start: vi.fn((s: InputSource) => {
      if (opts.startHangs) {
        return new Promise<void>((r) => {
          resolveStart = () => {
            active.add(s);
            r();
          };
        });
      }
      active.add(s);
      return Promise.resolve();
    }),
    stop: vi.fn((s: InputSource) => {
      active.delete(s);
    }),
    active: vi.fn(() => [...active]),
    lastError: vi.fn(() => null),
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
});
