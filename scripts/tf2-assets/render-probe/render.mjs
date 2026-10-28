/**
 * node render.mjs <dir with entry bundle + glb/> <out dir> <config.json>
 * config.json: { scenes: [{ name, body, bodygroups, parts: [{key,url,cls}] }] }
 * Serves <dir>, opens each scene in headless Chromium and saves <out>/render-<name>.png (and a .b64.txt copy,
 * so the image can be read back through a text-only API).
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const [dir, out, configPath] = process.argv.slice(2);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    const file = path === '/' ? '/index.html' : path;
    const body = await readFile(join(dir, file));
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const log = [];
for (const scene of config.scenes) {
  const page = await browser.newPage({
    viewport: { width: scene.width ?? 700, height: scene.height ?? 900 },
  });
  page.on('console', (m) => log.push(`[${scene.name}] ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => log.push(`[${scene.name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => log.push(`[${scene.name}] requestfailed: ${r.url()}`));
  const cfg = { width: scene.width ?? 700, height: scene.height ?? 900, ...scene };
  await page.goto(`${base}/?cfg=${encodeURIComponent(JSON.stringify(cfg))}`);
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(scene.wait ?? 6000); // models, textures and the idle animation settle
  const png = await page.screenshot();
  await writeFile(join(out, `render-${scene.name}.png`), png);
  await writeFile(join(out, `render-${scene.name}.png.b64.txt`), png.toString('base64'));
  await page.close();
}
await writeFile(join(out, 'render-log.txt'), log.join('\n'));
await browser.close();
server.close();
