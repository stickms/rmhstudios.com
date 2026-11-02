/**
 * Model gallery (plan H2.4): renders every procedural Harmonic model — and a few of its clips —
 * to PNG contact sheets with Playwright + an esbuild bundle of `model-gallery-entry.ts`. No dev
 * server needed.
 *
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/model-gallery.ts <out-dir> [model | model@clip@t@view ...]
 *
 * Writes `<out-dir>/<model>.png` per model (characters: ten clip poses; view models: draw, idle,
 * fire, reload through the view-model camera; weapons and props: three angles). Exits non-zero on
 * a page error or an empty render.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = process.argv[2];
const only = process.argv.slice(3);
if (!out) {
  console.error('usage: model-gallery.ts <out-dir> [model ...]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const bundle = await build({
  entryPoints: [path.resolve(import.meta.dirname, 'model-gallery-entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'warning',
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const problems: string[] = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
await page.setContent(
  '<!doctype html><html><body style="margin:0;background:#10151a"></body></html>',
);
await page.addScriptTag({ content: bundle.outputFiles[0].text });

const names: string[] = await page.evaluate(
  () => (window as unknown as { __harmonicGallery: { names: string[] } }).__harmonicGallery.names,
);
// `model` renders the sheet; `model@clip@t@view` renders one large frame (view: front q side back eye).
for (const arg of only.length ? only : names) {
  const [name, clip, t, view] = arg.split('@');
  if (!names.includes(name)) {
    problems.push(`unknown model ${name}`);
    continue;
  }
  const one = clip === undefined ? undefined : { clip, t: Number(t ?? 0), view: view ?? 'q' };
  const url: string = await page.evaluate(
    ([n, o]) =>
      (
        window as unknown as { __harmonicGallery: { sheet(n: string, o?: unknown): string } }
      ).__harmonicGallery.sheet(n, o),
    [name, one] as const,
  );
  const png = Buffer.from(url.split(',')[1], 'base64');
  if (png.length < 2000) problems.push(`${name}: empty render`);
  const file = one ? `${name}_${clip}_${t}_${one.view}.png` : `${name}.png`;
  writeFileSync(path.join(out, file), png);
  process.stdout.write(`${file} ${png.length} bytes\n`);
}
await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
