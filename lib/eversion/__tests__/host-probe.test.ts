// @vitest-environment node
/**
 * The host's single-renderer rule: the prefetch warm-up's WebGL2 probe (a
 * throwaway `OffscreenCanvas`) must never displace the page canvas's renderer,
 * whichever of the two `init`s reaches the host first (found by the T33 edge
 * e2e: the probe landing after the controller's own init left the overlay's
 * canvas blank while the run "succeeded" against a 1x1 offscreen one).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectHostMode, getEversionHost, resetEversionHost } from '../gl/host';
import type { FromWorker, ToWorker } from '../types';

class FakeCanvas {
  transferControlToOffscreen() {
    return { fake: 'offscreen' } as unknown as OffscreenCanvas;
  }
}

function setup(answer: boolean | null = true) {
  const sent: ToWorker[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const worker = {
    postMessage: (m: ToWorker) => sent.push(m),
    terminate: vi.fn(),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  detectHostMode('worker');
  const host = getEversionHost({ createWorker: () => worker as never });
  const heard: FromWorker[] = [];
  host.subscribe((m) => heard.push(m));
  /** The worker's reply to the capability probe the host sends first. */
  const reply = (ok: boolean, reason?: string) =>
    listeners.message?.({ data: { type: 'probe-result', ok, reason } });
  if (answer !== null) reply(answer);
  return { host, sent, heard, worker, reply, listeners };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
  vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, hidden: false });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
});

afterEach(() => {
  resetEversionHost();
  vi.unstubAllGlobals();
});

describe('host: a warm-up probe never displaces the page canvas', () => {
  it('a probe init after the page canvas is answered with ready and not forwarded', async () => {
    const { host, sent, heard } = setup();
    host.post({ type: 'init', canvas: new FakeCanvas() as never, tier: 'mid', dprCap: 1 });
    host.post({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'mid', dprCap: 1 });
    await flush();
    expect(sent.filter((m) => m.type === 'init')).toHaveLength(1);
    expect(heard).toEqual([{ type: 'ready', tier: 'mid', host: 'worker' }]);
  });

  it('a probe init BEFORE the page canvas is forwarded, and so is the page canvas after it', () => {
    const { host, sent } = setup();
    host.post({ type: 'init', canvas: {} as OffscreenCanvas, tier: 'mid', dprCap: 1 });
    host.post({ type: 'init', canvas: new FakeCanvas() as never, tier: 'mid', dprCap: 1 });
    expect(sent.filter((m) => m.type === 'init')).toHaveLength(2);
  });
});

describe('host: the worker is probed before the page canvas is handed over', () => {
  it('sends a probe first and holds everything else until it answers, in order', () => {
    const { host, sent, reply } = setup(null);
    expect(sent).toEqual([{ type: 'probe' }]);
    host.post({ type: 'init', canvas: new FakeCanvas() as never, tier: 'mid', dprCap: 1 });
    host.post({ type: 'start', t0: 5 });
    expect(sent.map((m) => m.type)).toEqual(['probe']);
    reply(true);
    expect(sent.map((m) => m.type)).toEqual(['probe', 'visibility', 'init', 'visibility', 'start']);
  });

  it('a worker that cannot render demotes the host to the main thread BEFORE any canvas is transferred', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const transfer = vi.spyOn(FakeCanvas.prototype, 'transferControlToOffscreen');
    const { host, sent, worker, reply } = setup(null);
    host.post({ type: 'init', canvas: new FakeCanvas() as never, tier: 'mid', dprCap: 1 });
    reply(false, 'eversion: WebGL2 is not available here');
    expect(host.mode).toBe('main');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(transfer).not.toHaveBeenCalled();
    expect(sent.map((m) => m.type)).toEqual(['probe']);
    // The next host of the session is in-thread from the start.
    expect(detectHostMode()).toBe('main');
  });

  it('a worker that dies before it can answer is treated the same way', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { host, worker, listeners } = setup(null);
    host.post({ type: 'init', canvas: new FakeCanvas() as never, tier: 'mid', dprCap: 1 });
    expect(worker.terminate).not.toHaveBeenCalled();
    listeners.error?.({});
    expect(host.mode).toBe('main');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

describe('host: the probe, its timeout and its failures', () => {
  const PROBE_TIMEOUT = 2500;
  const init = () => ({
    type: 'init' as const,
    canvas: new FakeCanvas() as never,
    tier: 'mid' as const,
    dprCap: 1,
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start the timeout until the render side is first needed', () => {
    vi.useFakeTimers();
    const { host, sent } = setup(null);
    // A worker warmed at hub-open and still fetching its module may take longer than the timeout: nothing is
    // held yet, so nothing is released on a guess.
    vi.advanceTimersByTime(PROBE_TIMEOUT * 4);
    host.post(init());
    expect(sent.map((m) => m.type)).toEqual(['probe']);
    vi.advanceTimersByTime(PROBE_TIMEOUT - 1);
    expect(sent.map((m) => m.type)).toEqual(['probe']);
    vi.advanceTimersByTime(1);
    expect(sent.map((m) => m.type)).toEqual(['probe', 'visibility', 'init']);
  });

  it('a worker that never answers is assumed capable after the timeout and the held messages go out in order', () => {
    vi.useFakeTimers();
    const { host, sent } = setup(null);
    host.post(init());
    host.post({ type: 'start', t0: 5 });
    vi.advanceTimersByTime(PROBE_TIMEOUT);
    expect(sent.map((m) => m.type)).toEqual(['probe', 'visibility', 'init', 'visibility', 'start']);
    expect(host.mode).toBe('worker');
  });

  it('a negative answer that arrives after the timeout demotes the NEXT host and does not loop', () => {
    vi.useFakeTimers();
    const { host, sent, reply, worker } = setup(null);
    host.post(init());
    vi.advanceTimersByTime(PROBE_TIMEOUT);
    const before = sent.length;
    reply(false, 'late no');
    expect(sent.length).toBe(before);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(host.mode).toBe('worker');
    expect(detectHostMode()).toBe('main');
  });

  it('a late positive answer changes nothing', () => {
    vi.useFakeTimers();
    const { host, sent, reply } = setup(null);
    host.post(init());
    vi.advanceTimersByTime(PROBE_TIMEOUT);
    const before = sent.length;
    reply(true);
    expect(sent.length).toBe(before);
    expect(detectHostMode()).toBe('worker');
    expect(host.mode).toBe('worker');
  });

  it('a worker that throws on construction becomes an in-thread host and demotes the session', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    detectHostMode('worker');
    const host = getEversionHost({
      createWorker: () => {
        throw new Error('SecurityError: worker-src');
      },
    });
    expect(host.mode).toBe('main');
    expect(detectHostMode()).toBe('main');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('closes the bitmaps it was holding when it is disposed while probing', () => {
    const { host, worker } = setup(null);
    const close = vi.fn();
    host.post({ type: 'texture', slot: 'before', bitmap: { close } as never } as never);
    host.dispose();
    expect(close).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('a reply that arrives after the host was disposed neither double-closes nor throws', () => {
    vi.useFakeTimers();
    const { host, reply } = setup(null);
    const close = vi.fn();
    host.post({ type: 'texture', slot: 'before', bitmap: { close } as never } as never);
    host.dispose();
    reply(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
