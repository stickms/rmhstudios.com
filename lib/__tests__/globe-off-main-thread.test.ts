// @vitest-environment node
/**
 * The liquid globe's GPU work stays off the page's thread (Task 7, 2026-11-08).
 *
 * A production trace of the full tier showed the page's main thread ~99% busy at rest with the globe visible, nearly
 * all of it `GLES2::ReadPixels` and `CommandBufferHelper::Finish` on `CrRendererMain`: WebGL contexts on the page's
 * thread, plus colour sampling by canvas readback. The globe now draws in a worker (`components/radial/globe-worker.ts`)
 * on transferred `OffscreenCanvas`es, and the page only posts small messages (`globe-worker-host.ts`). This gate keeps
 * it that way: the files that run on the page's thread for the globe never create a GL context, never read a canvas
 * back, and never import the render modules; the render modules never touch the DOM.
 *
 * Comments are stripped before scanning (like `jelly-ownership.test.ts` `code()`), so the explanation of what was
 * removed does not trip the gate.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const code = (file: string) =>
  readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** The globe path that runs on the page's main thread. */
const MAIN_THREAD = [
  'components/radial/LiquidGlobe.tsx',
  'components/radial/globe-worker-host.ts',
  'components/radial/globe-protocol.ts',
  'components/radial/RadialGlobeDock.tsx',
];
/** The render modules, which run only inside the worker. */
const WORKER_ONLY = ['components/radial/jelly-glass.ts', 'components/radial/self-evert-skin.ts'];
const WORKER_ENTRY = 'components/radial/globe-worker.ts';

/**
 * Imports of the worker-only render modules, static (`from './jelly-glass'`) or dynamic (`import('./jelly-glass')`), from
 * any path. A dynamic import would pull the GL modules into a page chunk just as surely as a static one.
 */
const RENDER_IMPORT =
  /(?:from\s+['"][^'"]*(?:jelly-glass|self-evert-skin)|import\(\s*['"][^'"]*(?:jelly-glass|self-evert-skin))/;
/** The pre-2026-11-08 pattern, kept only to prove the fixtures below would have slipped past it. */
const OLD_RENDER_IMPORT =
  /from\s+['"](?:\.\/|@\/components\/radial\/)(?:jelly-glass|self-evert-skin)['"]/;

const READBACK = /\b(?:getImageData|readPixels|toDataURL|toBlob|drawImage)\s*\(/;
const GL_CONTEXT = /getContext\(\s*['"`](?:webgl2?|experimental-webgl)['"`]/;

function collect(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) collect(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

describe('the globe draws off the main thread', () => {
  it.each(MAIN_THREAD)('%s never reads a canvas back or makes a GL context', (file) => {
    const src = code(file);
    expect(src, `${file}: no synchronous readback on the page's thread`).not.toMatch(READBACK);
    expect(src, `${file}: the globe's GL contexts live in the worker`).not.toMatch(GL_CONTEXT);
    expect(
      src,
      `${file}: no main-thread WebGL probe (the worker reports whether it can draw)`,
    ).not.toMatch(/\bsupportsWebGL\b/);
  });

  it('LiquidGlobe resolves no colour through a canvas (the worker parses computed-style strings)', () => {
    const src = code('components/radial/LiquidGlobe.tsx');
    expect(src).not.toMatch(/\bresolveColor\b|\bresolveRgba\b/);
    expect(src).not.toMatch(/createElement\(\s*['"]canvas['"]/);
  });

  it('only the worker entry imports the render modules', () => {
    const importers = ['components', 'app', 'hooks', 'lib', 'stores', 'features']
      .flatMap((d) => collect(d))
      .filter((f) => RENDER_IMPORT.test(code(f)))
      .map((f) => relative(ROOT, join(ROOT, f)))
      .sort();
    expect(importers).toEqual([WORKER_ENTRY]);
    expect(code('components/radial/globe-worker-host.ts')).toMatch(
      /new Worker\(new URL\('\.\/globe-worker\.ts', import\.meta\.url\)/,
    );
  });

  describe('the import guard bites (fixtures)', () => {
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    it.each([
      ["import { JellyGlass } from './jelly-glass';", true],
      ["import { SelfEvertSkin } from '@/components/radial/self-evert-skin';", true],
      ["import { JellyGlass } from '../radial/jelly-glass';", false],
      ["const { JellyGlass } = await import('./jelly-glass');", false],
      ["void import( '@/components/radial/self-evert-skin.ts' ).then(start);", false],
      ['const m = import("../radial/jelly-glass");', false],
    ])('catches %s', (src, oldCaught) => {
      expect(RENDER_IMPORT.test(strip(src))).toBe(true);
      // The dynamic forms (and relative paths from elsewhere) are what the old pattern missed.
      expect(OLD_RENDER_IMPORT.test(strip(src))).toBe(oldCaught);
    });
    it('ignores a comment that names the module', () => {
      expect(RENDER_IMPORT.test(strip("// moved out of import('./jelly-glass') in Task 7"))).toBe(
        false,
      );
    });
  });

  it.each(WORKER_ONLY)('%s touches no DOM and reads nothing back', (file) => {
    const src = code(file);
    expect(src).not.toMatch(/\bdocument\.|\bwindow\.|HTMLCanvasElement/);
    expect(src).not.toMatch(READBACK);
    expect(src).toMatch(/OffscreenCanvas/);
  });

  it('the worker entry touches no DOM; its one readback is the colour probe on its own OffscreenCanvas', () => {
    const src = code(WORKER_ENTRY);
    expect(src).not.toMatch(/\bdocument\.|\bwindow\./);
    expect(src.match(/getImageData\(/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/new OffscreenCanvas\(1, 1\)\.getContext\('2d'/);
    expect(src).not.toMatch(/readPixels|toDataURL|drawImage/);
  });

  it('the worker entry narrows inbound messages, reports a lost skin, and drops the scene bitmap once uploaded', () => {
    const src = code(WORKER_ENTRY);
    expect(src).toMatch(/if \(!isGlobeIn\(m\)\) return;/);
    expect(src).toMatch(/s\.onLost = \(\) => \{[^}]*post\(\{ type: 'skin', ok: false \}\)/);
    expect(src).toMatch(/if \(g\.setScene\(scene\) && scene\) scene\.bitmap\.close\(\);/);
    // Its ambient rate is the page loop's own rule, not window-wide input.
    expect(src).toMatch(/engagedRate\(c, pageNow\)/);
    expect(code('components/radial/LiquidGlobe.tsx')).toMatch(
      /engagedRate\(coatClockState\(\), now\)/,
    );
  });

  it('the page snapshot is cloned, transferred and closed — never shared between contexts', () => {
    const src = code('components/radial/globe-worker-host.ts');
    expect(src).toMatch(/cloneBitmap\(s\.bitmap\)/);
    expect(src).toMatch(/post\(\{ type: 'scene', bitmap: clone, width, height \}, \[clone\]\)/);
    expect(src).toMatch(/clone\.close\(\)/);
  });
});
