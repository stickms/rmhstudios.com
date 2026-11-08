import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The mic adapter is thin; this covers the one privacy-critical path: a stop()
// that arrives while the permission prompt is open must not leave the mic live.
const ctx = {
  state: 'running',
  sampleRate: 48000,
  resume: vi.fn(),
  createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
  createAnalyser: vi.fn(() => ({
    fftSize: 0,
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn(),
  })),
};
vi.mock('@/lib/shared/platform', () => ({ getAudioContext: () => ctx }));

import { createMicInput } from './mic';

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

describe('createMicInput stop during a pending start', () => {
  let resolveMedia!: (s: MediaStream) => void;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((res) => {
          resolveMedia = res;
        }),
    );
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops every track and starts no timer when the prompt is answered after stop()', async () => {
    const mic = createMicInput();
    const started = mic.start();
    await vi.advanceTimersByTimeAsync(0);
    mic.stop();
    const { track, stream } = fakeStream();
    resolveMedia(stream);
    await started;
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(ctx.createMediaStreamSource).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a double start opens one stream', async () => {
    const mic = createMicInput();
    const a = mic.start();
    const b = mic.start();
    await vi.advanceTimersByTimeAsync(0);
    resolveMedia(fakeStream().stream);
    await Promise.all([a, b]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    mic.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
