import type { Metafile } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  BUDGETS,
  classifyChunks,
  evaluate,
  expandGlobs,
  serverStub,
  sharedSocketIo,
  SOCKET_IO_INPUT,
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

describe('classifyChunks with input data', () => {
  it('follows only the dynamic imports a Balatro module makes', () => {
    const meta: Metafile = {
      inputs: {
        'components/balatro/BalatroPage.tsx': { bytes: 1, imports: [
          { path: 'lib/balatro/mp/pack-loader.ts', kind: 'dynamic-import', original: '' },
          { path: 'lib/i18n/config.ts', kind: 'import-statement', original: '' },
        ] },
        'lib/i18n/config.ts': { bytes: 1, imports: [{ path: 'lib/i18n/resources.fr.ts', kind: 'dynamic-import', original: '' }] },
        'lib/balatro/mp/pack-loader.ts': { bytes: 1, imports: [] },
        'lib/i18n/resources.fr.ts': { bytes: 1, imports: [] },
      },
      outputs: {
        'o/Page.js': out(
          [
            { path: 'o/loader.js', kind: 'dynamic-import' },
            { path: 'o/fr.js', kind: 'dynamic-import' },
          ],
          'components/balatro/BalatroPage.tsx',
        ),
        'o/loader.js': out([], 'lib/balatro/mp/pack-loader.ts'),
        'o/fr.js': out([], 'lib/i18n/resources.fr.ts'),
      },
    };
    const { dynamicSet } = classifyChunks(meta, 'components/balatro/BalatroPage.tsx');
    expect([...dynamicSet]).toEqual(['o/loader.js']);
  });
});

describe('build shims', () => {
  it('stubs every export of a .server module', () => {
    const stub = serverStub(
      'export const a = 1;\nexport async function b() {}\nexport class C {}\nconst d = 2, e = 3;\nexport { d, e as f };\nexport default 1;',
    );
    for (const n of ['a', 'b', 'C', 'd', 'f']) expect(stub).toContain(`export const ${n} = undefined;`);
    expect(stub).toContain('export default undefined;');
    expect(stub).not.toContain('export const e ');
  });

  it("expands Vite's single-path import.meta.glob into a lazy import map", () => {
    expect(expandGlobs("const m = import.meta.glob<Mod>('./index.ts');")).toBe(
      "const m = { './index.ts': () => import('./index.ts') };",
    );
    expect(expandGlobs("import.meta.glob('./x/*.ts')")).toBe("import.meta.glob('./x/*.ts')");
  });

  it('expands the array form lib/balatro/mp/index.ts uses for its extensions', () => {
    expect(
      expandGlobs("const x = import.meta.glob<Ext>(['./queue/attach.ts', './replay/attach.ts']);"),
    ).toBe(
      "const x = { './queue/attach.ts': () => import('./queue/attach.ts'), './replay/attach.ts': () => import('./replay/attach.ts') };",
    );
    expect(expandGlobs("import.meta.glob(['./a/*.ts'])")).toBe("import.meta.glob(['./a/*.ts'])");
  });
});

describe('socket.io accounting', () => {
  const files =
    (
      mount: string,
      store = "import { createRealtimeClient } from '@/lib/shared/realtime/client';",
      providers = '<CallMount />',
    ) =>
    (rel: string) =>
      (
        ({
          'components/call/CallMount.tsx': mount,
          'lib/call/store.ts': store,
          'components/Providers.tsx': providers,
        }) as Record<string, string>
      )[rel] ?? '';

  it('is site-shared only while the shell loads it for every signed-in viewer', () => {
    expect(sharedSocketIo(files("void import('@/lib/call/store').then(init)"))).toBe(true);
    expect(sharedSocketIo(files('nothing here'))).toBe(false);
    expect(sharedSocketIo(files("import('@/lib/call/store')", 'no socket'))).toBe(false);
    expect(sharedSocketIo(files("import('@/lib/call/store')", undefined, 'no mount'))).toBe(false);
    expect(
      sharedSocketIo(() => {
        throw new Error('ENOENT');
      }),
    ).toBe(false);
  });

  it('recognises the socket.io stack in metafile inputs', () => {
    expect(
      SOCKET_IO_INPUT.test(
        '../../node_modules/.pnpm/socket.io-client@4.8.1/node_modules/socket.io-client/build/esm/index.js',
      ),
    ).toBe(true);
    expect(SOCKET_IO_INPUT.test('node_modules/engine.io-parser/build/esm/index.js')).toBe(true);
    expect(SOCKET_IO_INPUT.test('lib/shared/realtime/client.ts')).toBe(false);
  });

  it('the real shell loads it today', () => {
    expect(sharedSocketIo()).toBe(true);
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
