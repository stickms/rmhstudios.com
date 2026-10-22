import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_INTERVAL_MS,
  SCENE_EXCLUDE,
  SCENE_HIDE,
  SETTLE_MS,
  createSceneProvider,
  type CaptureOutcome,
} from '../scene';

const bitmap = () => ({ close: vi.fn(), width: 1800, height: 1125 }) as unknown as ImageBitmap;

function harness(canCapture = () => true) {
  const win = {
    performance: { now: () => Date.now() },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    scrollX: 0,
    scrollY: 340,
    innerWidth: 1440,
    innerHeight: 900,
  };
  const doc = { defaultView: win } as unknown as Document;
  const shots: { width: number; height: number; scrollY: number; bitmap: ImageBitmap }[] = [];
  const capture = vi.fn<
    (e: readonly string[], h: readonly string[], s: number, t: number) => Promise<CaptureOutcome>
  >(async () => ({
    bitmap: bitmap(),
    width: 1800,
    height: 1125,
    scale: 1.25,
  }));
  const provider = createSceneProvider({
    doc,
    canCapture,
    capture,
    onShot: (s) => shots.push(s),
  });
  return { win, provider, shots, capture };
}

describe('scene provider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of requests into one capture, after the page settles', async () => {
    const { provider, capture, shots } = harness();
    for (let i = 0; i < 25; i++) provider.request('scroll');
    expect(capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(shots).toHaveLength(1);
  });

  it('reports CSS size (bitmap px / scale) and the scroll position at capture time', async () => {
    const { provider, shots } = harness();
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(shots[0]!.width).toBeCloseTo(1440, 5);
    expect(shots[0]!.height).toBeCloseTo(900, 5);
    expect(shots[0]!.scrollY).toBe(340);
  });

  it('waits until continuous scrolling stops instead of capturing every settle interval', async () => {
    const { provider, capture } = harness();
    for (let i = 0; i < 20; i++) {
      provider.request('scroll');
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it.each(['scroll', 'resize', 'route'])(
    'closes a capture invalidated by %s while it was in flight',
    async (reason) => {
      const { win, provider, capture, shots } = harness();
      const stale = bitmap();
      let release!: (o: CaptureOutcome) => void;
      capture.mockImplementationOnce(() => new Promise<CaptureOutcome>((r) => (release = r)));
      provider.request();
      await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
      if (reason === 'scroll') win.scrollY += 150;
      if (reason === 'resize') win.innerWidth -= 200;
      if (reason === 'route') provider.reset();
      provider.request(reason);
      release({ bitmap: stale, width: 100, height: 100, scale: 1 });
      await vi.advanceTimersByTimeAsync(5);
      expect(stale.close).toHaveBeenCalledOnce();
      expect(shots).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS + SETTLE_MS);
      expect(shots).toHaveLength(1);
    },
  );

  it('does not publish a late picture after effects have been disabled', async () => {
    let allowed = true;
    const { provider, capture, shots } = harness(() => allowed);
    const stale = bitmap();
    let release!: (o: CaptureOutcome) => void;
    capture.mockImplementationOnce(() => new Promise<CaptureOutcome>((r) => (release = r)));
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    allowed = false;
    release({ bitmap: stale, width: 100, height: 100, scale: 1 });
    await vi.advanceTimersByTimeAsync(5);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(shots).toHaveLength(0);
  });

  it('removes only its own canvases, and HIDES (keeps the box of) floating glass so the page cannot reflow', async () => {
    const { provider, capture } = harness();
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    const [exclude, hide] = capture.mock.calls[0]!;
    expect(exclude).toEqual(SCENE_EXCLUDE);
    expect(exclude).toContain('canvas[data-liquid-glass]');
    // Removing a sticky header moves everything after it up by its height: it is hidden, never excluded.
    expect(exclude).not.toContain('.glass-chrome');
    expect(exclude).not.toContain('.glass-overlay');
    expect(hide).toEqual(SCENE_HIDE);
    expect(hide).toContain('.glass-chrome');
    expect(hide).toContain('.glass-overlay');
    // Panes are page CONTENT, so they stay in the picture.
    expect(hide).not.toContain('.glass-pane');
  });

  it('never captures more often than the minimum interval', async () => {
    const { provider, capture } = harness();
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).toHaveBeenCalledTimes(1);
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('a request made while one is in flight runs after it, not alongside it', async () => {
    const { provider, capture } = harness();
    let release!: (o: CaptureOutcome) => void;
    capture.mockImplementationOnce(() => new Promise<CaptureOutcome>((r) => (release = r)));
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).toHaveBeenCalledTimes(1);
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).toHaveBeenCalledTimes(1);
    release({ bitmap: bitmap(), width: 100, height: 100, scale: 1 });
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS + SETTLE_MS * 2);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('refuses when capturing is not allowed (hidden tab, reduced effects, hub open)', async () => {
    let ok = false;
    const { provider, capture } = harness(() => ok);
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).not.toHaveBeenCalled();
    ok = true;
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated failures until reset, and never throws into the page', async () => {
    const { provider, capture, shots } = harness();
    capture.mockRejectedValue(new Error('taint'));
    for (let i = 0; i < 6; i++) {
      provider.request();
      await vi.advanceTimersByTimeAsync(SETTLE_MS + MIN_INTERVAL_MS + 50);
    }
    expect(capture).toHaveBeenCalledTimes(3);
    expect(provider.failures).toBe(3);
    expect(shots).toHaveLength(0);
    capture.mockResolvedValue({ bitmap: bitmap(), width: 100, height: 100, scale: 1 });
    provider.reset();
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + MIN_INTERVAL_MS + 50);
    expect(shots).toHaveLength(1);
  });

  it('disposing mid-capture closes the late bitmap instead of leaking it', async () => {
    const { provider, capture, shots } = harness();
    const late = bitmap();
    let release!: (o: CaptureOutcome) => void;
    capture.mockImplementationOnce(() => new Promise<CaptureOutcome>((r) => (release = r)));
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    provider.dispose();
    release({ bitmap: late, width: 100, height: 100, scale: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(late.close).toHaveBeenCalled();
    expect(shots).toHaveLength(0);
    provider.request();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + MIN_INTERVAL_MS);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
