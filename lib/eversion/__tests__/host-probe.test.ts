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

function setup() {
  const sent: ToWorker[] = [];
  const worker = {
    postMessage: (m: ToWorker) => sent.push(m),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
  };
  detectHostMode('worker');
  const host = getEversionHost({ createWorker: () => worker as never });
  const heard: FromWorker[] = [];
  host.subscribe((m) => heard.push(m));
  return { host, sent, heard };
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
