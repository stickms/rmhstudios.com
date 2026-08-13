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
import { PERF_TIER_SCRIPT, isLowEndDevice, LOW_MEMORY_GB, LOW_CORE_COUNT } from '@/lib/perf-tier';

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
