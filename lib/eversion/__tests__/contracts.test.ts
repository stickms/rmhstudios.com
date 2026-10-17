import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import * as constants from '../constants';
import { registerDebug } from '../debug';
import { SPIN_AXIS, THETA_MAX, THETA_MIN, spherePoint, wrapTheta } from '../domain';
import { isEversionDebugEnabled, isEversionEnabled, EVERSION_ENABLED } from '../flags';
import { EVERSION_MARKS, EVERSION_MEASURES } from '../marks';
import { PROJECTIONS, forwardUV, getProjection, inverseThetaPhi } from '../projections';
import { copySnapshot, createSnapshot } from '../snapshot';
import {
  CHANNEL_IDS,
  FROM_WORKER_TYPES,
  FROM_WORKER_TYPES_EXHAUSTIVE,
  NAV_TRANSITIONS,
  PROJECTION_IDS,
  STAGE_IDS,
  TO_WORKER_TYPES,
  TO_WORKER_TYPES_EXHAUSTIVE,
  CaptureError,
  type FromWorker,
  type ToWorker,
} from '../types';
import type { TaskId } from '../not-implemented';

// The stubs under test. Importing every owning module also proves the whole tree
// loads in node with no DOM — the "client-safe, importable from vitest" promise.
import { UNIFORMS, SAMPLER_UNITS, ATTRIBUTE_DOMAIN } from '../gl/uniforms';
import { createCapture, captureOnce } from '../capture';
import { DprGovernor, FrameStatsRecorder, pickTier } from '../gl/governor-tiers';
import { bootWorker } from '../gl/worker';
import { createEversionCore } from '../gl/core';
import { createRenderer } from '../gl/renderer';
import { detectHostMode, getEversionHost } from '../gl/host';
import { getShaderSet } from '../gl/shaders';
import { buildMesh, meshCounts, meshForTier } from '../mesh';
import { afterDomainTransform, alignAngle, fitEndIsometry } from '../orientation';
import { buildPlaceholder } from '../placeholder';
import { isEversionReady, prefetchEversion } from '../prefetch';
import {
  aspectBucket,
  bakeLut,
  clearLutCache,
  getBakedLut,
  sampleLut,
  toHalfFloat,
} from '../projection-lut';
import { cameraFor, flatPosition, morphPosition, projectToViewport, wrapWeight } from '../morph';
import { mountDebugOverlay } from '../debug';
import { resetLastProjection, resolveProjection } from '../random';
import { evert, normal, stageParams } from '../thurston';
import { Timeline } from '../timeline';

const ROOT = join(__dirname, '..');

/* ── The stub table ─────────────────────────────────────────────────────────
 *
 * One entry per exported stub. The check is deliberately TOLERANT: an entry
 * whose body no longer throws the standard error has been implemented by its
 * owning task, and passes. That way landing a task never requires editing this
 * file — which would be a merge conflict between every parallel task — and a
 * stub that is still a stub must still name the right owner.
 */

interface StubEntry {
  name: string;
  task: TaskId;
  call: () => unknown;
}

const noArgs = undefined as never;
const timelineProto = Timeline.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
const forTimeline = (m: string) => () => timelineProto[m]!.call(Object.create(Timeline.prototype));
const mercator = getProjection('mercator');
const projectionCall = (id: (typeof PROJECTION_IDS)[number], method: string) => () =>
  (getProjection(id) as unknown as Record<string, (...a: unknown[]) => unknown>)[method]!();

const STUBS: StubEntry[] = [
  // T04 / T05 / T06 — projections
  ...(
    [
      ['mercator', 'T04'],
      ['equirect', 'T04'],
      ['stereographic', 'T05'],
      ['lambert', 'T05'],
      ['peirce', 'T06'],
    ] as const
  ).flatMap(([id, task]) =>
    ['fit', 'forward', 'extended', 'inverse', 'singular'].map((m) => ({
      name: `${id}.${m}`,
      task,
      call: projectionCall(id, m),
    })),
  ),
  // T07 — LUT
  { name: 'aspectBucket', task: 'T07', call: () => aspectBucket(noArgs) },
  { name: 'bakeLut', task: 'T07', call: () => bakeLut(noArgs, noArgs) },
  { name: 'getBakedLut', task: 'T07', call: () => getBakedLut(noArgs, noArgs) },
  { name: 'clearLutCache', task: 'T07', call: () => clearLutCache() },
  { name: 'toHalfFloat', task: 'T07', call: () => toHalfFloat(noArgs) },
  { name: 'sampleLut', task: 'T07', call: () => sampleLut(noArgs, noArgs, 0, 0, noArgs) },
  // T08 — oracle
  { name: 'evert', task: 'T08', call: () => evert(0, 0, 0, noArgs) },
  { name: 'stageParams', task: 'T08', call: () => stageParams(0, noArgs) },
  { name: 'normal', task: 'T08', call: () => normal(0, 0, 0, noArgs) },
  // T09 — mesh
  { name: 'meshCounts', task: 'T09', call: () => meshCounts(1, 1) },
  { name: 'buildMesh', task: 'T09', call: () => buildMesh(1, 1) },
  { name: 'meshForTier', task: 'T09', call: () => meshForTier('low') },
  // T10 — timeline
  { name: 'Timeline', task: 'T10', call: () => new Timeline(noArgs) },
  ...(
    [
      'start',
      'tick',
      'fastForward',
      'afterReady',
      'afterFailed',
      'abort',
      'resize',
      'reveal',
      'events',
      'afterDeadline',
      'sample',
    ] as const
  ).map((m) => ({ name: `Timeline.${m}`, task: 'T10' as const, call: forTimeline(m) })),
  {
    name: 'Timeline.finished',
    task: 'T10',
    call: () => Object.getOwnPropertyDescriptor(Timeline.prototype, 'finished')!.get!.call({}),
  },
  // T11 — random
  { name: 'resolveProjection', task: 'T11', call: () => resolveProjection('random') },
  { name: 'resetLastProjection', task: 'T11', call: () => resetLastProjection() },
  // T12 — morph
  { name: 'cameraFor', task: 'T12', call: () => cameraFor(noArgs, 1) },
  {
    name: 'flatPosition',
    task: 'T12',
    call: () => flatPosition(0, 0, mercator, noArgs, noArgs, noArgs),
  },
  { name: 'wrapWeight', task: 'T12', call: () => wrapWeight(0, 0) },
  { name: 'morphPosition', task: 'T12', call: () => morphPosition(noArgs, noArgs, 0, noArgs) },
  { name: 'projectToViewport', task: 'T12', call: () => projectToViewport(noArgs, noArgs, noArgs) },
  // T13 — orientation
  { name: 'fitEndIsometry', task: 'T13', call: () => fitEndIsometry() },
  { name: 'alignAngle', task: 'T13', call: () => alignAngle(noArgs) },
  {
    name: 'afterDomainTransform',
    task: 'T13',
    call: () => afterDomainTransform(noArgs, noArgs, 0),
  },
  // T15 — debug overlay (registerDebug itself is implemented: see below)
  { name: 'mountDebugOverlay', task: 'T15', call: () => mountDebugOverlay() },
  // T17 / T18 / T29 — page side
  { name: 'createCapture', task: 'T17', call: () => createCapture() },
  { name: 'captureOnce', task: 'T17', call: () => captureOnce(noArgs) },
  {
    name: 'buildPlaceholder',
    task: 'T18',
    call: () => buildPlaceholder(noArgs, noArgs, noArgs, noArgs, noArgs),
  },
  { name: 'prefetchEversion', task: 'T29', call: () => prefetchEversion() },
  { name: 'isEversionReady', task: 'T29', call: () => isEversionReady() },
  // T23 / T24 / T25 — GL
  { name: 'getShaderSet', task: 'T23', call: () => getShaderSet() },
  { name: 'createRenderer', task: 'T24', call: () => createRenderer(noArgs, noArgs) },
  { name: 'createEversionCore', task: 'T25', call: () => createEversionCore(noArgs) },
  { name: 'bootWorker', task: 'T25', call: () => bootWorker(noArgs) },
  { name: 'detectHostMode', task: 'T25', call: () => detectHostMode() },
  { name: 'getEversionHost', task: 'T25', call: () => getEversionHost() },
  { name: 'pickTier', task: 'T25', call: () => pickTier(noArgs) },
  { name: 'DprGovernor', task: 'T25', call: () => new DprGovernor() },
  { name: 'FrameStatsRecorder', task: 'T25', call: () => new FrameStatsRecorder() },
];

const STUB_MESSAGE = /^eversion: (.+) not implemented \((T\d\d)\)$/;

describe('contract stubs', () => {
  it.each(STUBS.map((s) => [s.name, s] as const))('%s names its owning task', (_name, stub) => {
    let error: unknown;
    try {
      stub.call();
    } catch (e) {
      error = e;
    }
    const message = error instanceof Error ? error.message : '';
    const match = STUB_MESSAGE.exec(message);
    // Not the standard stub error → the owning task has implemented it (or it
    // threw a TypeError on the placeholder arguments, which means the same).
    if (!match) return;
    expect(match[2], `${stub.name} must name ${stub.task}`).toBe(stub.task);
    expect(match[1]).toBe(stub.name);
  });

  it('the table covers every projection method and every Timeline method', () => {
    const names = new Set(STUBS.map((s) => s.name));
    for (const id of PROJECTION_IDS) {
      for (const m of ['fit', 'forward', 'extended', 'inverse', 'singular']) {
        expect(names.has(`${id}.${m}`)).toBe(true);
      }
    }
    const timelineMethods = Object.getOwnPropertyNames(Timeline.prototype).filter(
      (n) => n !== 'constructor',
    );
    for (const m of timelineMethods) expect(names.has(`Timeline.${m}`), m).toBe(true);
  });
});

/* ── Settings vocabulary ──────────────────────────────────────────────────── */

describe('projection ids and settings', () => {
  it('has the five projections of S§5.1 and the six settings of S§9.3', () => {
    expect([...PROJECTION_IDS]).toEqual([
      'mercator',
      'peirce',
      'stereographic',
      'lambert',
      'equirect',
    ]);
    expect(PROJECTION_IDS).toHaveLength(5);
    expect(NAV_TRANSITIONS).toHaveLength(6);
    expect(NAV_TRANSITIONS[0]).toBe('random');
    expect(new Set(NAV_TRANSITIONS).size).toBe(6);
  });

  it('the registry has exactly one projection per id, answering to its own id', () => {
    expect(Object.keys(PROJECTIONS).sort()).toEqual([...PROJECTION_IDS].sort());
    for (const id of PROJECTION_IDS) expect(PROJECTIONS[id].id).toBe(id);
  });

  it('the tuple helpers delegate to the allocation-free methods', () => {
    const fake = {
      id: 'mercator',
      fit: () => ({}),
      extended: () => {},
      singular: () => false,
      forward: (_t: number, _p: number, _f: unknown, out: Float64Array) => {
        out[0] = 0.25;
        out[1] = 0.75;
        return true;
      },
      inverse: (_u: number, _v: number, _f: unknown, out: Float64Array) => {
        out[0] = 1;
        out[1] = -1;
        return false;
      },
    };
    const fit = {} as never;
    expect(forwardUV(fake as never, 0, 0, fit)).toEqual([0.25, 0.75]);
    expect(inverseThetaPhi(fake as never, 0, 0, fit)).toBeNull();
  });
});

/* ── The worker protocol ──────────────────────────────────────────────────── */

describe('worker protocol (S§3.3)', () => {
  // Every row of the S§3.3 table, by message name.
  const SPEC_TO_WORKER = [
    'init',
    'prime',
    'texture',
    'start',
    'fast-forward',
    'after-failed',
    'resize',
    'reveal',
    'abort',
  ];
  const SPEC_FROM_WORKER = [
    'cover',
    'stage',
    'need-after-by',
    'unwrap-done',
    'done',
    'context-lost',
  ];

  const viewport = { w: 1440, h: 900, dpr: 1 };
  const rgba = [0, 0, 0, 1] as const;
  const colours = {
    bg: rgba,
    veil: rgba,
    accent: rgba,
    cageMinor: rgba,
    cageParallel: rgba,
    cageMajor: rgba,
    cageRipple: rgba,
    cageWidth: 1,
  };
  // `satisfies` makes each of these a compile-time check against the union.
  const toWorker = [
    { type: 'init', canvas: {} as OffscreenCanvas, tier: 'high', dprCap: 2 },
    {
      type: 'prime',
      projection: 'mercator',
      viewport,
      globe: { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, centre: [0, 0], radius: 100 },
      orb: { cx: 0, cy: 0, radius: 20 },
      colours,
      lut: null,
    },
    { type: 'texture', slot: 'before', bitmap: {} as ImageBitmap },
    { type: 'start', t0: 0 },
    { type: 'fast-forward' },
    { type: 'after-failed' },
    { type: 'resize', viewport },
    { type: 'reveal' },
    { type: 'abort' },
    { type: 'debug', id: 1, command: { op: 'counters' } },
  ] satisfies ToWorker[];
  const fromWorker = [
    { type: 'ready', tier: 'mid', host: 'worker' },
    { type: 'cover' },
    { type: 'stage', stage: 'evert', t: 600 },
    { type: 'need-after-by', deadline: 3000 },
    { type: 'unwrap-done' },
    { type: 'done', frames: 1, dropped: 0, p95: 16.7 },
    { type: 'context-lost' },
    { type: 'error', message: 'x', fatal: true },
    { type: 'debug-result', id: 1, ok: true },
  ] satisfies FromWorker[];

  it('has a typed message for every row of the S§3.3 table', () => {
    for (const t of SPEC_TO_WORKER) expect(TO_WORKER_TYPES as readonly string[]).toContain(t);
    for (const t of SPEC_FROM_WORKER) expect(FROM_WORKER_TYPES as readonly string[]).toContain(t);
  });

  it('every listed type is constructible and every constructible type is listed', () => {
    expect(new Set(toWorker.map((m) => m.type))).toEqual(new Set(TO_WORKER_TYPES));
    expect(new Set(fromWorker.map((m) => m.type))).toEqual(new Set(FROM_WORKER_TYPES));
    // The exhaustiveness constants are `true` or a compile error; assert the runtime value too.
    expect(TO_WORKER_TYPES_EXHAUSTIVE).toBe(true);
    expect(FROM_WORKER_TYPES_EXHAUSTIVE).toBe(true);
  });
});

/* ── The timeline vocabulary ──────────────────────────────────────────────── */

describe('timeline vocabulary (S§7.1)', () => {
  it('has the spec channels and stages', () => {
    expect([...CHANNEL_IDS]).toEqual([
      'wrap',
      'radius',
      'centreX',
      'centreY',
      'hubFade',
      'evert',
      'spin',
      'tilt',
      'afterMix',
      'unwrap',
      'pageAlpha',
      'pop',
    ]);
    expect([...STAGE_IDS]).toEqual([
      'wrap',
      'evert',
      'gate-open',
      'unwrap',
      'unwrap-done',
      'reveal',
      'pop',
      'done',
    ]);
  });

  it('a snapshot carries a number for every channel, and copies field for field', () => {
    const s = createSnapshot();
    for (const id of CHANNEL_IDS) expect(typeof s[id], id).toBe('number');
    // At rest: flat page, round globe, nothing popped, opaque, no ripples.
    expect(s).toMatchObject({
      wrap: 0,
      unwrap: 1,
      evert: 0,
      pop: 0,
      bgAlpha: 1,
      ripple0Age: -1,
      ripple1Age: -1,
    });
    const filled = {
      ...s,
      t: 123,
      stage: 'unwrap' as const,
      spin: 6.5,
      radius: 400,
      ripple0Age: 0.3,
    };
    const copy = copySnapshot(filled, createSnapshot());
    expect(copy).toEqual(filled);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(createSnapshot()).sort());
  });

  it('every frame uniform names a real snapshot field (or a computed source)', () => {
    const fields = new Set(Object.keys(createSnapshot()));
    for (const u of UNIFORMS.filter((x) => x.cadence === 'frame')) {
      const refs = [...u.from.matchAll(/snapshot\.(\w+)/g)].map((m) => m[1]!);
      for (const r of refs) expect(fields.has(r), `${u.name} → snapshot.${r}`).toBe(true);
    }
  });
});

/* ── Constants ────────────────────────────────────────────────────────────── */

describe('constants (S§12, S§8.2, S§6.2)', () => {
  it('matches the S§12 listing', () => {
    expect(constants).toMatchObject({
      WRAP_MS: 700,
      EVERT_MS: 3200,
      UNWRAP_MS: 700,
      POP_MS: 300,
      EVERT_OVERLAP_MS: 100,
      UNWRAP_OVERLAP_MS: 100,
      GLOBE_FILL: 0.88,
      SPIN_TURNS: 1.25,
      SPIN_TILT_DEG: 18,
      EVERSION_STRIPS: 8,
      STAGE_OVERLAP: 0.3,
      WRAP_WAVE: 0.6,
      PLACEHOLDER_XFADE_MS: 320,
      REVEAL_MS: 180,
      HUB_FADE_MS: 250,
      STRETCH_CAP_MS: 2500,
      FF_REMAINING_MS: 650,
      FF_STRETCH_CAP_MS: 1000,
      MIN_EVERT_RATE: 0.25,
      MAX_DT_MS: 50,
      BEFORE_GRACE_MS: 250,
      CAPTURE_TIMEOUT_MS: 600,
      AFTER_SETTLE_CAP_MS: 1200,
      AFTER_CAPTURE_TIMEOUT_MS: 1500,
      BEFORE_STALE_MS: 30_000,
    });
    expect([...constants.LUT_SIZE]).toEqual([1024, 512]);
  });

  it('the derived plan reproduces the S§7.1 table and sums to 4.9 s', () => {
    const p = constants.PLAN_MS;
    expect([...p.evert]).toEqual([600, 3900]);
    expect([...p.unwrap]).toEqual([3800, 4600]);
    expect([...p.pop]).toEqual([4600, 4900]);
    expect(p.total).toBe(4900);
    expect(constants.GLOBE_RADIUS_FRACTION).toBeCloseTo(0.44, 12);
  });

  it('has the tier table of S§8.2 and the capture caps of S§6.2', () => {
    expect(constants.TIERS.high).toEqual({
      meshTheta: 256,
      meshPhi: 128,
      canvasDprCap: 2.0,
      captureDprCap: 1.5,
      anisotropy: 8,
    });
    expect(constants.TIERS.mid).toEqual({
      meshTheta: 192,
      meshPhi: 96,
      canvasDprCap: 1.5,
      captureDprCap: 1.25,
      anisotropy: 4,
    });
    expect(constants.TIERS.low).toEqual({
      meshTheta: 128,
      meshPhi: 64,
      canvasDprCap: 1.0,
      captureDprCap: 1.0,
      anisotropy: 0,
    });
    expect(constants.CAPTURE_DPR_CAP).toEqual({ high: 1.5, mid: 1.25, low: 1.0 });
    expect(constants.CAPTURE_MAX_DIMENSION).toBe(4096);
    // 8 corrugations need >= 16 longitudinal samples each (S§8.2).
    for (const t of Object.values(constants.TIERS)) {
      expect(t.meshTheta / constants.EVERSION_STRIPS).toBeGreaterThanOrEqual(16);
    }
  });

  it('has five ordered, overlapping stage windows inside [0, 1]', () => {
    const w = constants.STAGE_WINDOWS;
    expect(w).toHaveLength(constants.EVERT_STAGES.length);
    expect(w[0]![0]).toBe(0);
    expect(w[w.length - 1]![1]).toBe(1);
    for (let i = 1; i < w.length; i++) expect(w[i]![0]).toBeLessThan(w[i - 1]![1]);
    expect(constants.STAGE_PARAM_COUNT).toBeGreaterThanOrEqual(constants.EVERT_STAGES.length);
  });
});

/* ── The chart ────────────────────────────────────────────────────────────── */

describe('the sphere chart (domain.ts)', () => {
  it('puts θ = 0 facing the viewer and north up the screen (lib/globe.ts handedness)', () => {
    const p = new Float64Array(3);
    spherePoint(0, 0, p);
    expect([...p]).toEqual([0, -0, 1]);
    spherePoint(Math.PI / 2, 0, p);
    expect(p[0]).toBeCloseTo(1, 12); // east is screen-right
    expect(p[2]).toBeCloseTo(0, 12);
    spherePoint(0, Math.PI / 2, p);
    expect(p[1]).toBeCloseTo(-1, 12); // north is −y (up the screen)
    expect([...SPIN_AXIS]).toEqual([0, 1, 0]);
  });

  it('keeps the seam on the back meridian', () => {
    expect(THETA_MIN).toBe(-Math.PI);
    expect(THETA_MAX).toBe(Math.PI);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    spherePoint(THETA_MIN, 0.3, a);
    spherePoint(THETA_MAX, 0.3, b);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, 12);
  });

  it('wraps longitude into (−π, π]', () => {
    expect(wrapTheta(0.5)).toBeCloseTo(0.5, 12);
    expect(wrapTheta(0.5 + 2 * Math.PI)).toBeCloseTo(0.5, 12);
    expect(wrapTheta(-Math.PI)).toBe(Math.PI);
    expect(wrapTheta(3 * Math.PI)).toBe(Math.PI);
  });
});

/* ── Marks, flags, debug ──────────────────────────────────────────────────── */

describe('marks', () => {
  it('has the S§11.2 mark names, all namespaced and distinct', () => {
    expect(EVERSION_MARKS).toMatchObject({
      start: 'eversion:start',
      cover: 'eversion:cover',
      evert: 'eversion:evert',
      gateOpen: 'eversion:gate-open',
      unwrap: 'eversion:unwrap',
      reveal: 'eversion:reveal',
      done: 'eversion:done',
    });
    const all = [...Object.values(EVERSION_MARKS), ...Object.values(EVERSION_MEASURES)];
    expect(new Set(all).size).toBe(all.length);
    for (const n of all) expect(n.startsWith('eversion:')).toBe(true);
  });
});

describe('isEversionEnabled (T39 rollout switch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is off by default', () => {
    expect(EVERSION_ENABLED).toBe(false);
    vi.stubGlobal('location', { search: '' });
    expect(isEversionEnabled()).toBe(false);
  });

  it('is off on the server, where there is no location', () => {
    vi.stubGlobal('location', undefined);
    expect(isEversionEnabled()).toBe(false);
  });

  it('turns on with ?eversion, whatever else is in the query', () => {
    vi.stubGlobal('location', { search: '?eversion' });
    expect(isEversionEnabled()).toBe(true);
    vi.stubGlobal('location', { search: '?a=1&eversion=1' });
    expect(isEversionEnabled()).toBe(true);
    // The debug flag is a different key and does not enable the effect.
    vi.stubGlobal('location', { search: '?eversion-debug=1' });
    expect(isEversionEnabled()).toBe(false);
    expect(isEversionDebugEnabled()).toBe(true);
  });

  it('is false, not an exception, when location throws', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(isEversionEnabled()).toBe(false);
      expect(isEversionDebugEnabled()).toBe(false);
    } finally {
      delete (globalThis as { location?: unknown }).location;
    }
  });
});

describe('registerDebug', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op without the flag and without a window', () => {
    expect(() => registerDebug('capture', {} as never)()).not.toThrow();
    const win: { __eversion?: unknown } = {};
    vi.stubGlobal('window', win);
    vi.stubGlobal('location', { search: '' });
    registerDebug('capture', {} as never)();
    expect(win.__eversion).toBeUndefined();
  });

  it('registers and unregisters slots under the flag', () => {
    const win: { __eversion?: { slots(): string[]; capture?: unknown } } = {};
    vi.stubGlobal('window', win);
    vi.stubGlobal('location', { search: '?eversion-debug=1' });
    const api = { marker: 1 } as never;
    const off = registerDebug('capture', api);
    expect(win.__eversion?.capture).toBe(api);
    expect(win.__eversion?.slots()).toEqual(['capture']);
    off();
    expect(win.__eversion?.capture).toBeUndefined();
  });
});

describe('capture error', () => {
  it('carries its reason', () => {
    const e = new CaptureError('timeout');
    expect(e).toBeInstanceOf(Error);
    expect(e.reason).toBe('timeout');
  });
});

/* ── The shader interface ─────────────────────────────────────────────────── */

describe('shader interface (gl/uniforms.ts)', () => {
  it('has unique, namespaced uniform names and unique texture units', () => {
    const names = UNIFORMS.map((u) => u.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n.startsWith('u_')).toBe(true);
    const units = Object.values(SAMPLER_UNITS);
    expect(new Set(units).size).toBe(units.length);
    expect(UNIFORMS.filter((u) => u.type === 'sampler2D')).toHaveLength(units.length);
    expect(ATTRIBUTE_DOMAIN).toEqual({ name: 'a_domain', location: 0, size: 2 });
  });

  it('feeds every colour from ThemeColours, never a literal', () => {
    for (const u of UNIFORMS.filter((x) => x.name.startsWith('u_col'))) {
      expect(u.from).toMatch(/^ThemeColours\./);
    }
  });
});

/* ── Source hygiene: the rules that keep the tree importable and idle ──────── */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') sourceFiles(join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Source with comments removed, so a docblock may mention what code must not do. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/');
const FILES = sourceFiles(ROOT);

describe('source hygiene', () => {
  it('finds the module map', () => {
    const names = FILES.map(rel);
    for (const expected of [
      'types.ts',
      'constants.ts',
      'marks.ts',
      'flags.ts',
      'projections/index.ts',
      'timeline.ts',
      'gl/renderer.ts',
      'gl/host.ts',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('imports no server-only code and no node built-ins (it ships to the browser)', () => {
    for (const f of FILES) {
      const src = code(f);
      expect(src, rel(f)).not.toMatch(/from\s+['"][^'"]*\.server['"]/);
      expect(src, rel(f)).not.toMatch(/from\s+['"]node:/);
    }
  });

  it('schedules no frame outside the two files the rAF allowlist will sanction', () => {
    const allowed = new Set(['gl/worker.ts', 'gl/host.ts']);
    for (const f of FILES) {
      if (allowed.has(rel(f))) continue;
      expect(code(f), rel(f)).not.toContain('requestAnimationFrame');
    }
  });

  it('keeps the pure modules free of DOM globals', () => {
    const pure = FILES.filter((f) => {
      const r = rel(f);
      return (
        !r.startsWith('gl/') &&
        ![
          'capture.ts',
          'placeholder.ts',
          'prefetch.ts',
          'flags.ts',
          'debug.ts',
          'random.ts',
        ].includes(r)
      );
    });
    expect(pure.length).toBeGreaterThan(10);
    for (const f of pure) {
      expect(code(f), rel(f)).not.toMatch(
        /\b(window|document|navigator|localStorage|sessionStorage|location)\b/,
      );
    }
  });
});
