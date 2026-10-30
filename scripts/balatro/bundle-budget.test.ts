import type { Metafile } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  BUDGETS,
  classifyChunks,
  evaluate,
  type Baseline,
  type BundleReport,
  type PackReport,
} from './bundle-budget';

const out = (
  imports: Metafile['outputs'][string]['imports'],
  entryPoint?: string,
): Metafile['outputs'][string] => ({
  bytes: 1,
  inputs: {},
  imports,
  exports: [],
  ...(entryPoint ? { entryPoint } : {}),
});

describe('classifyChunks', () => {
  it('splits the static closure from what only dynamic import() reaches', () => {
    const meta: Metafile = {
      inputs: {},
      outputs: {
        'o/Page.js': out(
          [
            { path: 'o/shared.js', kind: 'import-statement' },
            { path: 'o/mp.js', kind: 'dynamic-import' },
            { path: 'react', kind: 'import-statement', external: true },
          ],
          'components/balatro/BalatroPage.tsx',
        ),
        'o/shared.js': out([{ path: 'o/deep.js', kind: 'import-statement' }]),
        'o/deep.js': out([]),
        'o/mp.js': out([
          { path: 'o/shared.js', kind: 'import-statement' },
          { path: 'o/mp-dep.js', kind: 'import-statement' },
          { path: 'o/mp-lazy.js', kind: 'dynamic-import' },
        ]),
        'o/mp-dep.js': out([]),
        'o/mp-lazy.js': out([]),
        'o/unrelated.js': out([]),
      },
    };
    const { entry, staticSet, dynamicSet } = classifyChunks(
      meta,
      'components/balatro/BalatroPage.tsx',
    );
    expect(entry).toBe('o/Page.js');
    expect([...staticSet].sort()).toEqual(['o/Page.js', 'o/deep.js', 'o/shared.js']);
    expect([...dynamicSet].sort()).toEqual(['o/mp-dep.js', 'o/mp-lazy.js', 'o/mp.js']);
  });

  it('fails loudly when the entry is missing', () => {
    expect(() => classifyChunks({ inputs: {}, outputs: {} }, 'x.tsx')).toThrow(
      /no output for entry/,
    );
  });
});

const baseline: Baseline = {
  ref: 'abc',
  recordedAt: '2026-10-30',
  spEntryGzip: 10_000,
  corePackBytes: 4_930_572,
};
const chunk = { file: 'x', bytes: 1, gzip: 0, inputs: [], top: [], p2pShareGzip: 0 };
const bundle = (o: Partial<BundleReport>): BundleReport => ({
  entry: chunk,
  staticChunks: [],
  staticGzip: 10_000,
  dynamicChunks: [],
  dynamicGzip: 0,
  p2pGzip: 0,
  forbiddenInStatic: [],
  testSurfaceLeaks: [],
  ...o,
});
const packs = (o: Partial<PackReport> = {}): PackReport => ({
  core: { bytes: 4_930_572, fileBytes: 4_930_572 },
  mp: null,
  ...o,
});
const failing = (checks: ReturnType<typeof evaluate>) =>
  checks.filter((c) => !c.ok).map((c) => c.name);

describe('evaluate', () => {
  it('passes at the baseline, with the MP pack still pending', () => {
    const checks = evaluate(bundle({}), packs(), baseline);
    expect(failing(checks)).toEqual([]);
    expect(checks.find((c) => c.name === 'MP pack')?.detail).toMatch(/WS2/);
  });

  it('holds every budget at its boundary and fails one byte over', () => {
    const atLimit = bundle({
      staticGzip: baseline.spEntryGzip + BUDGETS.spEntryDeltaGzip,
      dynamicGzip: BUDGETS.mpChunksGzip,
      p2pGzip: BUDGETS.p2pGzip,
    });
    const mpAt = {
      bytes: BUDGETS.mpPackBytes,
      fileBytes: BUDGETS.mpPackBytes,
      extracted: BUDGETS.mpPackExtracted,
    };
    const coreAt = {
      bytes: baseline.corePackBytes + BUDGETS.coreGrowth,
      fileBytes: baseline.corePackBytes + BUDGETS.coreGrowth,
    };
    expect(failing(evaluate(atLimit, packs({ core: coreAt, mp: mpAt }), baseline))).toEqual([]);

    const over = bundle({
      staticGzip: baseline.spEntryGzip + BUDGETS.spEntryDeltaGzip + 1,
      dynamicGzip: BUDGETS.mpChunksGzip + 1,
      p2pGzip: BUDGETS.p2pGzip + 1,
      forbiddenInStatic: ['lib/shared/p2p/wire.ts'],
      testSurfaceLeaks: ['chunk-1.js'],
    });
    const mpOver = {
      bytes: BUDGETS.mpPackBytes + 1,
      fileBytes: 1,
      extracted: BUDGETS.mpPackExtracted + 1,
    };
    const coreOver = { bytes: baseline.corePackBytes + BUDGETS.coreGrowth + 1, fileBytes: null };
    expect(failing(evaluate(over, packs({ core: coreOver, mp: mpOver }), baseline))).toEqual([
      'single-player route chunk delta',
      'no MP/P2P module in the single-player chunk',
      'MP JS chunks',
      'P2P share of the MP chunks',
      'test surface absent without VITE_BALATRO_MP_TEST',
      'core pack size',
      'core pack manifest matches its file',
      'MP pack compressed',
      'MP pack manifest matches its file',
      'MP pack extracted',
    ]);
  });

  it('treats a missing MP pack file as a failure, not a pass', () => {
    const checks = evaluate(
      null,
      packs({ mp: { bytes: 10, fileBytes: null, extracted: null } }),
      baseline,
    );
    expect(failing(checks)).toEqual(['MP pack manifest matches its file', 'MP pack extracted']);
  });

  it('a shrinking chunk is fine', () => {
    expect(failing(evaluate(bundle({ staticGzip: 1 }), packs(), baseline))).toEqual([]);
  });
});
