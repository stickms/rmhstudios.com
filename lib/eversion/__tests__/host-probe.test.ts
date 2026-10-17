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
