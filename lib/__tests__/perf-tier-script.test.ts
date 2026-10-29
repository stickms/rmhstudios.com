/**
 * `PERF_TIER_SCRIPT` must decide exactly what `isLowEndDevice()` decides.
 *
 * The tier exists in two forms on purpose — a pre-paint inline `<head>` script
 * and a TypeScript predicate — because the class has to be on `<html>` before
 * the first frame, and the rest of the app still needs to ask the question from
 * JS. Two implementations of one heuristic is the drift this repo's gates exist
 * to catch, so this file is the gate: the same navigator fixture goes into both
 * and the answers have to match.
 *
 * The failure this prevents is quiet in both directions. A script that is too
 * eager strips the glass off capable machines with nothing in the UI to explain
 * it; a script that is too shy silently restores the bug it was written to fix —
 * `perf-lite` landing only after hydration, so the weakest devices render the
 * full effect stack for the whole load.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PERF_TIER_SCRIPT,
  isLowEndDevice,
  LOW_MEMORY_GB,
  LOW_CORE_COUNT,
  SOFT_RENDER_KEY,
  SOFT_RENDER_TTL_MS,
  reconcileSoftRender,
} from '@/lib/perf-tier';
import { resetGpuProbe } from '@/lib/render/probe';

interface FakeNavigator {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/**
 * Run the inline script against a fake navigator and report whether it stamped
 * the class.
 *
 * `new Function` binds `navigator`/`document` as parameters, so the script's
 * free variables resolve to the fixtures without touching real globals — which
 * matters because `isLowEndDevice()` below stubs the same names and the two
 * must not see each other's state.
 */
function scriptStamps(navigator: FakeNavigator): boolean {
  const classes = new Set<string>();
  const document = {
    documentElement: { classList: { add: (name: string) => classes.add(name) } },
  };
  new Function('navigator', 'document', PERF_TIER_SCRIPT)(navigator, document);
  return classes.has('perf-lite');
}

/** Run the TypeScript predicate against the same fake navigator. */
function predicateSays(navigator: FakeNavigator): boolean {
  vi.stubGlobal('navigator', navigator);
  return isLowEndDevice();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * One table, both implementations. Every row is a device class the tier makes a
 * real decision about — including the two the tier deliberately does NOT catch,
 * which are as load-bearing as the ones it does (`lib/perf-tier.ts` §What this
 * tier is NOT).
 */
const CASES: [name: string, nav: FakeNavigator, low: boolean][] = [
  ['an empty navigator (no signals at all)', {}, false],
  ['Data Saver explicitly on', { connection: { saveData: true } }, true],
  ['a 2g connection', { connection: { effectiveType: '2g' } }, true],
  ['a slow-2g connection', { connection: { effectiveType: 'slow-2g' } }, true],
  ['a 3g connection (slow, but not the low tier)', { connection: { effectiveType: '3g' } }, false],
  ['a 4g connection', { connection: { effectiveType: '4g' } }, false],
  ['under the memory floor', { deviceMemory: LOW_MEMORY_GB - 2 }, true],
  ['exactly at the memory floor', { deviceMemory: LOW_MEMORY_GB }, false],
  ['at the core ceiling', { hardwareConcurrency: LOW_CORE_COUNT }, true],
  ['one core above the ceiling', { hardwareConcurrency: LOW_CORE_COUNT + 1 }, false],
  // Absent is not zero: an engine that does not implement these must be treated
  // as capable, never defaulted into the low tier.
  ['zero/absent readings', { deviceMemory: 0, hardwareConcurrency: 0 }, false],
  // The two carve-outs that must keep the full material.
  ['a current iPhone (6 cores, no Chromium signals)', { hardwareConcurrency: 6 }, false],
  [
    'a mid-range Android (8 cores, 4GB, 4g)',
    { hardwareConcurrency: 8, deviceMemory: 4, connection: { effectiveType: '4g' } },
    false,
  ],
];

describe('PERF_TIER_SCRIPT agrees with isLowEndDevice()', () => {
  for (const [name, nav, low] of CASES) {
    it(`${name} → ${low ? 'perf-lite' : 'full material'}`, () => {
      expect(scriptStamps(nav)).toBe(low);
      expect(predicateSays(nav)).toBe(low);
    });
  }

  it('reads the shared thresholds rather than hardcoding them', () => {
    // If someone changes LOW_MEMORY_GB but hand-edits only the predicate, the
    // table above still passes (it is written in terms of the constant). This
    // asserts the script string itself was interpolated from the same source.
    expect(PERF_TIER_SCRIPT).toContain(`m<${LOW_MEMORY_GB}`);
    expect(PERF_TIER_SCRIPT).toContain(`h<=${LOW_CORE_COUNT}`);
  });

  it('never throws, whatever the engine hands it', () => {
    // The script runs in <head> before anything else on the page. A throw here
    // does not degrade the tier, it aborts the whole inline script.
    const hostile = { get deviceMemory(): number { throw new Error('nope'); } };
    expect(() => scriptStamps(hostile as FakeNavigator)).not.toThrow();
    expect(scriptStamps(hostile as FakeNavigator)).toBe(false);
  });

  it('only ever adds the class, never removes it', () => {
    // `applyPerfTier()` toggles; the script must not, or a capable device would
    // have the class cleared and re-added around hydration for no reason.
    expect(PERF_TIER_SCRIPT).not.toContain('remove');
    expect(PERF_TIER_SCRIPT).not.toContain('toggle');
  });
});


/**
 * A browser found to be drawing in software (hardware acceleration off, a blocklisted driver, a VM) is put on the low
 * tier: measured on /games, Firefox 2 → 49 fps, Chromium 11 → 46, WebKit 1.4 → 14. The finding is cached in
 * localStorage so the NEXT page load gets the class on its first frame, which only works if the pre-paint script and the
 * predicate read that cache the same way.
 */
describe('software-render finding', () => {
  const store = (value: string | null) => ({
    getItem: (k: string) => (k === SOFT_RENDER_KEY ? value : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  const withStore = (value: string | null) => {
    vi.stubGlobal('localStorage', store(value));
    return { script: scriptStamps({}), predicate: predicateSays({}) };
  };

  it('a fresh cached finding stamps the class pre-paint and in the predicate', () => {
    expect(withStore(String(Date.now() - 1000))).toEqual({ script: true, predicate: true });
  });

  it('a stale finding is ignored by both, so turning acceleration back on takes effect', () => {
    expect(withStore(String(Date.now() - SOFT_RENDER_TTL_MS - 1000))).toEqual({
      script: false,
      predicate: false,
    });
  });

  it('no finding, an unparsable one, or unreadable storage is not the low tier', () => {
    expect(withStore(null)).toEqual({ script: false, predicate: false });
    expect(withStore('soft')).toEqual({ script: false, predicate: false });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(scriptStamps({})).toBe(false);
    expect(predicateSays({})).toBe(false);
  });

  it('reconcileSoftRender caches a software finding, stamps the class, and clears it when hardware returns', () => {
    const classes = new Set<string>();
    const doc = {
      documentElement: {
        classList: {
          toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
        },
      },
      createElement: () => ({
        getContext: () => ({
          getExtension: (n: string) =>
            n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : null,
          getParameter: () => renderer,
          drawBuffers: () => {},
        }),
      }),
    };
    let renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';
    let stored: string | null = null;
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === SOFT_RENDER_KEY ? stored : null),
      setItem: (_: string, v: string) => (stored = v),
      removeItem: () => (stored = null),
    });

    resetGpuProbe();
    expect(reconcileSoftRender()).toBe(true);
    expect(classes.has('perf-lite')).toBe(true);
    expect(Number(stored)).toBeGreaterThan(0);

    // A real GPU on a later visit, after the cached finding has aged out.
    stored = String(Date.now() - SOFT_RENDER_TTL_MS - 1000);
    renderer = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)';
    resetGpuProbe();
    expect(reconcileSoftRender()).toBe(false);
    expect(classes.has('perf-lite')).toBe(false);
    expect(stored).toBeNull();
  });
});
