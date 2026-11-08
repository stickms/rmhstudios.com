/**
 * The low-end CAPABILITY signal (`lib/low-end.ts`) is a read of the machine, never a document class.
 *
 * It replaced `html.perf-lite` (removed 2026-11-08): games, the eversion's mesh tier, RUM and the globe's CSS fallback ask
 * it a question; the site material does not. The fixtures are the old tier's table, so the heuristic did not move.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  isLowEndCapability,
  resetLowEndCapability,
  settleSoftRender,
  softRenderDetected,
  markSoftRender,
  LOW_MEMORY_GB,
  LOW_CORE_COUNT,
  SOFT_RENDER_KEY,
  SOFT_RENDER_TTL_MS,
} from '@/lib/low-end';
import { resetGpuProbe } from '@/lib/render/probe';

interface FakeNavigator {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** A document that records every class written to `<html>`, so a test can prove none ever is. */
function stubDocument(renderer?: () => string) {
  const written: string[] = [];
  const doc = {
    documentElement: {
      classList: {
        add: (c: string) => written.push(c),
        toggle: (c: string) => written.push(c),
        contains: () => false,
      },
    },
    createElement: () => ({
      getContext: () => ({
        getExtension: (n: string) =>
          n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : null,
        getParameter: () => renderer?.() ?? '',
        drawBuffers: () => {},
      }),
    }),
  };
  vi.stubGlobal('document', doc);
  return written;
}

function says(navigator: FakeNavigator): boolean {
  vi.stubGlobal('navigator', navigator);
  resetLowEndCapability();
  return isLowEndCapability();
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetLowEndCapability();
  resetGpuProbe();
});

const CASES: [name: string, nav: FakeNavigator, low: boolean][] = [
  ['an empty navigator (no signals at all)', {}, false],
  ['Data Saver explicitly on', { connection: { saveData: true } }, true],
  ['a 2g connection', { connection: { effectiveType: '2g' } }, true],
  ['a slow-2g connection', { connection: { effectiveType: 'slow-2g' } }, true],
  ['a 3g connection (slow, but not low-end)', { connection: { effectiveType: '3g' } }, false],
  ['a 4g connection', { connection: { effectiveType: '4g' } }, false],
  ['deviceMemory 2', { deviceMemory: 2 }, true],
  ['under the memory floor', { deviceMemory: LOW_MEMORY_GB - 2 }, true],
  ['exactly at the memory floor', { deviceMemory: LOW_MEMORY_GB }, false],
  ['hardwareConcurrency 2', { hardwareConcurrency: 2 }, true],
  ['at the core ceiling', { hardwareConcurrency: LOW_CORE_COUNT }, true],
  ['one core above the ceiling', { hardwareConcurrency: LOW_CORE_COUNT + 1 }, false],
  ['zero/absent readings', { deviceMemory: 0, hardwareConcurrency: 0 }, false],
  ['a current iPhone (6 cores, no Chromium signals)', { hardwareConcurrency: 6 }, false],
  [
    'a mid-range Android (8 cores, 4GB, 4g)',
    { hardwareConcurrency: 8, deviceMemory: 4, connection: { effectiveType: '4g' } },
    false,
  ],
];

describe('isLowEndCapability()', () => {
  for (const [name, nav, low] of CASES) {
    it(`${name} -> ${low ? 'low-end' : 'capable'}`, () => {
      expect(says(nav)).toBe(low);
    });
  }

  it('is false on the server', () => {
    vi.stubGlobal('navigator', undefined);
    resetLowEndCapability();
    expect(isLowEndCapability()).toBe(false);
  });

  it('is memoised until a new software finding is recorded', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    resetLowEndCapability();
    expect(isLowEndCapability()).toBe(false);
    vi.stubGlobal('navigator', { hardwareConcurrency: 1 });
    expect(isLowEndCapability()).toBe(false);
    resetLowEndCapability();
    expect(isLowEndCapability()).toBe(true);
  });

  it('never writes a class on <html> (the perf-lite class is gone)', () => {
    const written = stubDocument();
    for (const [, nav] of CASES) says(nav);
    expect(written).toEqual([]);
    expect(document.documentElement.classList.contains('perf-lite')).toBe(false);
  });
});

describe('software-render finding', () => {
  const store = (value: string | null) => ({
    getItem: (k: string) => (k === SOFT_RENDER_KEY ? value : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });

  it('a fresh remembered finding reads as software and as low-end', () => {
    vi.stubGlobal('localStorage', store(String(Date.now() - 1000)));
    expect(softRenderDetected()).toBe(true);
    expect(says({})).toBe(true);
  });

  it('a stale finding is ignored, so turning acceleration back on takes effect', () => {
    vi.stubGlobal('localStorage', store(String(Date.now() - SOFT_RENDER_TTL_MS - 1000)));
    expect(softRenderDetected()).toBe(false);
    expect(says({})).toBe(false);
  });

  it('no finding, an unparsable one, or unreadable storage is not software', () => {
    vi.stubGlobal('localStorage', store(null));
    expect(softRenderDetected()).toBe(false);
    vi.stubGlobal('localStorage', store('soft'));
    expect(softRenderDetected()).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(softRenderDetected()).toBe(false);
    expect(says({})).toBe(false);
  });

  it('settleSoftRender remembers a software finding, writes no class, and forgets it when hardware returns', () => {
    let renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';
    const written = stubDocument(() => renderer);
    let stored: string | null = null;
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === SOFT_RENDER_KEY ? stored : null),
      setItem: (_: string, v: string) => (stored = v),
      removeItem: () => (stored = null),
    });

    resetGpuProbe();
    expect(settleSoftRender()).toBe(true);
    expect(Number(stored)).toBeGreaterThan(0);
    expect(isLowEndCapability()).toBe(true);

    stored = String(Date.now() - SOFT_RENDER_TTL_MS - 1000);
    renderer = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)';
    resetGpuProbe();
    expect(settleSoftRender()).toBe(false);
    expect(stored).toBeNull();
    expect(isLowEndCapability()).toBe(false);
    expect(written).toEqual([]);
  });

  it('markSoftRender(false) clears the remembered finding', () => {
    let stored: string | null = String(Date.now());
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_: string, v: string) => (stored = v),
      removeItem: () => (stored = null),
    });
    markSoftRender(false);
    expect(softRenderDetected()).toBe(false);
  });
});
