// @vitest-environment node
/**
 * "Always evert globe" (spec amendment 2026-10-18): the preference lifts the
 * PERFORMANCE reasons the effect is skipped for, and nothing else.
 *
 * Two halves. The pure eligibility rows (a host that is not up yet is the only
 * performance row there), and the runner's priming waits (BEFORE, host ready,
 * overlay mount), which lengthen to the `ALWAYS_EVERT_*` limits instead of falling
 * back. The accessibility and capability rows must never move.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALWAYS_EVERT_BEFORE_WAIT_MS,
  ALWAYS_EVERT_HOST_WAIT_MS,
  ALWAYS_EVERT_OVERLAY_MOUNT_MS,
  BEFORE_WAIT_MS,
} from '../constants';
import {
  evaluateEligibility,
  evaluateHostEligibility,
  isEligibleFor,
  type EligibilityInputs,
  type HostLifeState,
} from '../eligibility';
import { EversionRunner } from '../runner';
import type { RunnerDeps } from '../runner';
import type { EversionHost, EversionNode, FallbackReason, GlobeStartState } from '../types';

const ok: EligibilityInputs = {
  flagEnabled: true,
  reducedMotion: false,
  webgl2: true,
  chunkReady: true,
  hostState: 'ready',
};

describe('eligibility with "Always evert globe"', () => {
  it.each(['idle', 'initialising'] as const)(
    'a host that is %s: skipped without the override, eligible with it',
    (hostState) => {
      expect(evaluateEligibility({ ...ok, hostState })).toBe('host-not-ready');
      expect(evaluateEligibility({ ...ok, hostState, alwaysEvert: false })).toBe('host-not-ready');
      expect(evaluateEligibility({ ...ok, hostState, alwaysEvert: true })).toBeNull();
      expect(isEligibleFor({ ...ok, hostState, alwaysEvert: true })).toBe(true);
    },
  );

  it('a failed host cannot run the effect whatever the preference says', () => {
    expect(evaluateEligibility({ ...ok, hostState: 'failed' })).toBe('host-error');
    expect(evaluateEligibility({ ...ok, hostState: 'failed', alwaysEvert: true })).toBe(
      'host-error',
    );
  });

  it('a ready host is eligible either way', () => {
    expect(evaluateEligibility(ok)).toBeNull();
    expect(evaluateEligibility({ ...ok, alwaysEvert: true })).toBeNull();
  });

  it('never bypasses reduced motion (accessibility wins)', () => {
    for (const hostState of ['idle', 'initialising', 'ready', 'failed'] as HostLifeState[]) {
      expect(
        evaluateEligibility({ ...ok, hostState, reducedMotion: true, alwaysEvert: true }),
      ).toBe('reduced-motion');
    }
  });

  it.each([false, null] as const)('never bypasses missing WebGL2 (%s)', (webgl2) => {
    for (const hostState of ['idle', 'initialising', 'ready'] as HostLifeState[]) {
      expect(evaluateEligibility({ ...ok, hostState, webgl2, alwaysEvert: true })).toBe(
        'no-webgl2',
      );
    }
  });

  it('never bypasses the rollout flag or an unloaded chunk', () => {
    expect(evaluateEligibility({ ...ok, flagEnabled: false, alwaysEvert: true })).toBe('flag-off');
    expect(evaluateEligibility({ ...ok, chunkReady: false, alwaysEvert: true })).toBe(
      'chunk-not-ready',
    );
  });

  it('reduced motion still outranks everything else in the documented order', () => {
    expect(
      evaluateEligibility({
        flagEnabled: true,
        reducedMotion: true,
        webgl2: false,
        chunkReady: false,
        hostState: 'initialising',
        alwaysEvert: true,
      }),
    ).toBe('reduced-motion');
  });

  it('callers that only decide the hub-side rows (no hostState) are unchanged', () => {
    const { hostState: _omit, ...hubOnly } = ok;
    expect(evaluateEligibility(hubOnly)).toBeNull();
    expect(evaluateEligibility({ ...hubOnly, alwaysEvert: true })).toBeNull();
  });

  it('evaluateHostEligibility is the whole host row', () => {
    const table: [HostLifeState, boolean, FallbackReason | null][] = [
      ['ready', false, null],
      ['ready', true, null],
      ['idle', false, 'host-not-ready'],
      ['idle', true, null],
      ['initialising', false, 'host-not-ready'],
      ['initialising', true, null],
      ['failed', false, 'host-error'],
      ['failed', true, 'host-error'],
    ];
    for (const [state, always, expected] of table) {
      expect(evaluateHostEligibility(state, always)).toBe(expected);
    }
  });
});

/* ── The runner's priming waits ───────────────────────────────────────────── */

const NODE = { id: 'n', href: '/games', tKey: 'k', label: 'Games', icon: {} } as EversionNode;
const GLOBE: GlobeStartState = {
  yaw: 0,
  pitch: 0,
  yawVel: 0,
  pitchVel: 0,
  centre: [100, 100],
  radius: 50,
};
const COLOURS = {
  bg: [0, 0, 0, 1],
  veil: [0, 0, 0, 1],
  accent: [1, 1, 1, 1],
  cageMinor: [1, 1, 1, 0.2],
  cageParallel: [1, 1, 1, 0.1],
  cageMajor: [1, 1, 1, 0.3],
  cageRipple: [1, 1, 1, 0.5],
  cageWidth: 1,
} as const;
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

function rig(patch: Partial<RunnerDeps>) {
  const log: string[] = [];
  const host: EversionHost = {
    mode: 'worker',
    post: (m) => void log.push(`post:${m.type}`),
    subscribe: () => () => {},
    dispose() {},
  };
  const deps: RunnerDeps = {
    host: { ready: async () => host, discardCanvas() {} },
    overlay: { mount: async () => {}, fade() {}, unmount() {} },
    page: {
      onResize: () => () => {},
      viewport: () => ({ w: 800, h: 600, dpr: 1 }),
      tier: () => 'low',
      colours: () => COLOURS,
      setCover() {},
      setSettle() {},
      setLive() {},
      watchSettle: () => ({
        whenSettled: async () => ({
          settled: true,
          reason: 'settled',
          waitedMs: 0,
          frames: 0,
          last: null,
        }),
        dispose() {},
      }),
      nextFrame: async () => {},
      onInput: () => () => {},
      currentHref: () => '/here',
    },
    router: {
      navigate: (href) => void log.push(`navigate:${href}`),
      whenIdle: () => new Promise(() => {}),
      onTraversal: () => () => {},
    },
    ineligibleReason: () => null,
    awaitBefore: async () => bitmap(),
    capture: () => null,
    openCapture: async () => {
      throw new Error('not reached');
    },
    placeholder: async () => bitmap(),
    projection: () => 'mercator',
    lut: () => null,
    requested: () => 'random',
    mark: () => {},
    now: () => Date.now(),
    ...patch,
  };
  return { deps, log, runner: new EversionRunner(deps) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the runner with "Always evert globe"', () => {
  it('the limits are bounded, generous and ordered sensibly', () => {
    expect(ALWAYS_EVERT_BEFORE_WAIT_MS).toBeGreaterThan(BEFORE_WAIT_MS);
    for (const ms of [
      ALWAYS_EVERT_BEFORE_WAIT_MS,
      ALWAYS_EVERT_HOST_WAIT_MS,
      ALWAYS_EVERT_OVERLAY_MOUNT_MS,
    ]) {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(10_000);
    }
  });

  it('asks for BEFORE with the short wait by default and the long one with the override', async () => {
    for (const [always, expected] of [
      [false, BEFORE_WAIT_MS],
      [true, ALWAYS_EVERT_BEFORE_WAIT_MS],
    ] as const) {
      const waits: number[] = [];
      const r = rig({
        alwaysEvert: () => always,
        awaitBefore: async (grace) => {
          waits.push(grace);
          return null;
        },
      });
      await r.runner.run(NODE, GLOBE);
      expect(waits).toEqual([expected]);
    }
  });

  it('a BEFORE that takes the whole long wait is still a bounded before-timeout', async () => {
    let t = 0;
    const r = rig({
      alwaysEvert: () => true,
      now: () => t,
      awaitBefore: async () => {
        t += ALWAYS_EVERT_BEFORE_WAIT_MS;
        return null;
      },
    });
    expect((await r.runner.run(NODE, GLOBE)).fallback).toBe('before-timeout');
  });

  it('gives the host the long wait, and a host slower than 100 ms then runs', async () => {
    const asked: number[] = [];
    const slow = (always: boolean) =>
      rig({
        alwaysEvert: () => always,
        host: {
          ready: (_tier, ms) =>
            new Promise<EversionHost>((resolve, reject) => {
              asked.push(ms);
              setTimeout(
                () =>
                  resolve({ mode: 'worker', post() {}, subscribe: () => () => {}, dispose() {} }),
                1500,
              );
              setTimeout(reject, ms);
            }),
          discardCanvas() {},
        },
      });

    // Without the override the host has ~100 ms and a 1.5 s init is a fallback.
    const off = slow(false);
    const offRun = off.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await offRun).fallback).toBe('host-error');

    // With it the same host is waited for and the run starts (navigate is issued).
    const on = slow(true);
    const logged: string[] = [];
    const onRun = on.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(1600);
    logged.push(...on.log);
    expect(logged).toContain('navigate:/games');
    expect(asked).toEqual([100, ALWAYS_EVERT_HOST_WAIT_MS]);
    on.runner.dispose();
    await onRun;
  });

  it('a host that never answers is still a bounded host-error, not a hang', async () => {
    const r = rig({
      alwaysEvert: () => true,
      host: {
        ready: (_tier, ms) => new Promise((_, reject) => setTimeout(reject, ms)),
        discardCanvas() {},
      },
    });
    const p = r.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(ALWAYS_EVERT_HOST_WAIT_MS + 50);
    expect((await p).fallback).toBe('host-error');
  });

  it('gives a slow overlay the long mount wait, and still bounds it', async () => {
    const slowMount = () => new Promise<void>((resolve) => setTimeout(resolve, 800));
    const off = rig({ overlay: { mount: slowMount, fade() {}, unmount() {} } });
    const offRun = off.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await offRun).fallback).toBe('host-error');

    const on = rig({
      alwaysEvert: () => true,
      overlay: { mount: slowMount, fade() {}, unmount() {} },
    });
    const onRun = on.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(900);
    expect(on.log).toContain('navigate:/games');
    on.runner.dispose();
    await onRun;

    const never = rig({
      alwaysEvert: () => true,
      overlay: { mount: () => new Promise(() => {}), fade() {}, unmount() {} },
    });
    const p = never.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(ALWAYS_EVERT_OVERLAY_MOUNT_MS + 50);
    expect((await p).fallback).toBe('host-error');
  });

  it('does not bypass a controller-reported ineligibility (reduced motion, no WebGL2, busy)', async () => {
    for (const reason of ['reduced-motion', 'no-webgl2', 'host-error'] as const) {
      const r = rig({ alwaysEvert: () => true, ineligibleReason: () => reason });
      expect((await r.runner.run(NODE, GLOBE)).fallback).toBe(reason);
      expect(r.log).toEqual([]);
    }
    const busy = rig({ alwaysEvert: () => true });
    void busy.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(10);
    expect((await busy.runner.run(NODE, GLOBE)).fallback).toBe('busy');
    busy.runner.dispose();
  });

  it('back/forward while priming still cancels the run', async () => {
    let traversal: (() => void) | null = null;
    const r = rig({
      alwaysEvert: () => true,
      router: {
        navigate: () => {},
        whenIdle: () => new Promise(() => {}),
        onTraversal: (cb) => {
          traversal = cb;
          return () => {};
        },
      },
      awaitBefore: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            traversal?.();
            resolve(bitmap());
          }, 500);
        }),
    });
    const p = r.runner.run(NODE, GLOBE);
    await vi.advanceTimersByTimeAsync(600);
    expect((await p).fallback).toBe('traversal');
  });
});
