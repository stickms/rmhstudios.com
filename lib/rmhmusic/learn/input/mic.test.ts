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
    vi.clearAllMocks();
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

  it('start, stop, start, stop leaves every track stopped and no timer', async () => {
    const mic = createMicInput();
    const resolvers: ((s: MediaStream) => void)[] = [];
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((res) => {
          resolvers.push(res);
        }),
    );
    const first = mic.start();
    await vi.advanceTimersByTimeAsync(0);
    mic.stop();
    const second = mic.start();
    mic.stop();
    const a = fakeStream();
    resolvers[0](a.stream);
    await Promise.all([first, second]);
    expect(a.track.stop).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
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

// A browser with no microphone API here (an insecure origin, an embedded webview) must say so, not
// blame "another app": the setup row maps the error's name to its sentence.
describe('createMicInput with no microphone API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with NotSupportedError when navigator.mediaDevices is missing', async () => {
    vi.stubGlobal('navigator', {});
    const mic = createMicInput();
    await expect(mic.start()).rejects.toMatchObject({ name: 'NotSupportedError' });
    mic.stop();
  });

  it('rejects with NotSupportedError when getUserMedia is missing', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} });
    const mic = createMicInput();
    await expect(mic.start()).rejects.toMatchObject({ name: 'NotSupportedError' });
    mic.stop();
  });
});
