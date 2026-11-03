// The browser's loop (createGameLoop, requestAnimationFrame, variable frame times, interpolation)
// drives SoloRun through a fixed-step adapter. Whatever the display's frame rate or jitter, the
// recorded log must replay to the numbers the loop produced: a run is a function of its inputs, not
// of frame timing.
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../engine/webgl/webgl-context', async (orig) => ({
  ...(await orig<typeof import('../../engine/webgl/webgl-context')>()),
  initWebGL: () => ({}),
}));
vi.mock('../../engine/webgl/webgl-sprite-batch', () => ({ SpriteBatch: class {} }));
vi.mock('../../engine/webgl/webgl-shapes', () => ({ ShapeBatch: class {} }));
vi.mock('../../engine/webgl/webgl-textures', async (orig) => ({
  ...(await orig<typeof import('../../engine/webgl/webgl-textures')>()),
  setGLContext: () => {},
}));
vi.mock('../../engine/renderer', async (orig) => ({
  ...(await orig<typeof import('../../engine/renderer')>()),
  renderFrame: () => {},
}));

import { createGameLoop } from '../../engine/game-loop';
import { createInputState } from '../../engine/input';
import { SoloRun } from '../solo-run';
import { replaySoloRun } from '../verify-solo';
import { useAltairGameStore } from '../../stores/game-store';
import { LOADOUT, SEED } from './fixture';

vi.setConfig({ testTimeout: 120_000 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Play 25 seconds of wall time through the real loop with the given frame-time generator. */
function playThroughLoop(frameMs: (i: number) => number, seed = SEED) {
  const raf: { cb: ((now: number) => void) | null } = { cb: null };
  vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
    raf.cb = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    raf.cb = null;
  });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const fakeOverlay = { width: 0, height: 0, style: {} as Record<string, string>, parentElement: null, getContext: () => ({}) };
  vi.stubGlobal('document', { createElement: () => fakeOverlay });
  const canvas = { width: 1280, height: 720, parentElement: null } as unknown as HTMLCanvasElement;

  const live = createInputState();
  const run = new SoloRun({
    setup: { seed, classId: 'ranger', doubleTime: false, loadout: LOADOUT },
    viewport: { w: canvas.width, h: canvas.height },
    inputSource: () => live,
  });
  const loop = createGameLoop(canvas, run.world, run.tileGen, run.callbacks, run);
  loop.start();
  let now = 0;
  let picks = 0;
  for (let i = 0; i < 4000 && run.ended === null; i++) {
    // keys change every ~0.4 s of wall time
    const seg = Math.floor(now / 400);
    live.keys.clear();
    live.keys.add(['w', 'd', 's', 'a'][seg % 4]);
    if (seg % 3 === 0) live.keys.add('d');
    now += frameMs(i);
    const cb = raf.cb;
    raf.cb = null;
    if (!cb) break;
    cb(now);
    if (useAltairGameStore.getState().phase === 'upgrading') {
      const s = useAltairGameStore.getState();
      run.pick(picks++ % s.upgradeChoices.length);
    }
    if (now > 25_000) break;
  }
  loop.destroy();
  return { log: run.toLog(), result: run.result() };
}

const PATTERNS: [string, (i: number) => number][] = [
  ['60 Hz', () => 16.667],
  ['144 Hz', () => 6.944],
  ['30 Hz', () => 33.333],
  ['jittery 20-90 Hz with hitches', (i) => 11 + ((i * 7919) % 40) + (i % 97 === 0 ? 120 : 0)],
];

describe('the browser loop is a fixed-step adapter over SoloRun', () => {
  for (const [name, frames] of PATTERNS) {
    it(`${name}: the recorded log replays to identical numbers`, async () => {
      const played = playThroughLoop(frames);
      expect(played.log.steps).toBeGreaterThan(300);
      vi.unstubAllGlobals();
      const out = await replaySoloRun(JSON.parse(JSON.stringify(played.log)));
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.result).toEqual(played.result);
    });
  }

  it('different frame rates produce the same sim steps for the same wall time (to within a frame)', () => {
    const a = playThroughLoop(() => 16.667);
    const b = playThroughLoop(() => 6.944);
    expect(Math.abs(a.log.steps - b.log.steps)).toBeLessThanOrEqual(3);
  });
});
