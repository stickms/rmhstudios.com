#!/usr/bin/env node
// Headless verification for the Hearthworks Source importer.
//
//   node scripts/hearthworks/source-import/verify/render.mjs --glb public/models/hearthworks --out <dir> \
//        [--skins gman,citizen] [--frames 8]
//
// Serves the repo root over http (so the page can import the repo's three), opens verify/viewer.html in
// headless Chromium (swiftshader WebGL), loads each GLB with three's GLTFLoader, and writes
//   <out>/<skin>.png        rest pose (front, 3/4, side) + idle / walk / run filmstrips, side view
//   <out>/<skin>.clips.png  one frame row per remaining clip (jump, fall, shoot, reload, hurt, death, interact)
//   <out>/<skin>.json       textual inspection (per-clip duration, root travel, head direction, bbox)
//   <out>/contact-sheet.png every skin's rest pose, front + side
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..');
const require = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const glbDir = path.resolve(args.glb || path.join(repo, 'public/models/hearthworks'));
const outDir = path.resolve(args.out || 'hearthworks-verify');
const frames = Number(args.frames || 8);
fs.mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(glbDir, 'manifest.json'), 'utf8'));
const skins = (args.skins ? args.skins.split(',') : Object.keys(manifest.models)).filter((s) => manifest.models[s]);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url === '/viewer.html') file = path.join(here, 'viewer.html');
  else if (url.startsWith('/models/')) file = path.join(glbDir, url.slice('/models/'.length));
  else file = path.join(repo, url);
  if (!file.startsWith(repo) && !file.startsWith(glbDir) && !file.startsWith(here)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: args.chrome || process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.warn('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`${base}/viewer.html`);
await page.waitForFunction('window.ready === true', null, { timeout: 30000 });

const save = (name, dataUrl) => fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
const rest = [];
for (const skin of skins) {
  const entry = manifest.models[skin];
  const url = `/models/${entry.file}`;
  const info = await page.evaluate((u) => window.inspect({ url: u }), url);
  fs.writeFileSync(path.join(outDir, `${skin}.json`), JSON.stringify({ skin, manifest: entry, ...info }, null, 2));
  const dur = (c) => (info.clips[c] ? info.clips[c].duration : 1);
  const strip = (clip, view) => Array.from({ length: frames }, (_, i) => ({ clip, view, time: (dur(clip) * i) / frames }));
  const main = [
    { view: 'front' }, { view: 'three' }, { view: 'side' }, { view: 'back' },
    ...strip(entry.clips.idle, 'three').slice(0, 4),
    ...strip(entry.clips.walk, 'side'),
    ...(entry.clips.run ? strip(entry.clips.run, 'side') : []),
  ];
  save(`${skin}.png`, await page.evaluate((a) => window.filmstrip(a), { url, height: entry.height, jobs: main, cols: 8, size: 200 }));
  const others = ['jump', 'fall', 'shoot', 'reload', 'hurt', 'death', 'interact'].filter((k) => entry.clips[k]);
  if (others.length) {
    const jobs = others.flatMap((k) => strip(entry.clips[k], 'three'));
    save(`${skin}.clips.png`, await page.evaluate((a) => window.filmstrip(a), { url, height: entry.height, jobs, cols: frames, size: 160 }));
  }
  save(`${skin}.big.png`, await page.evaluate((a) => window.filmstrip(a), { url, height: entry.height, focusY: 0.72, dist: 1.5,
    jobs: [{ view: 'front', clip: entry.clips.idle, time: 0 }, { view: 'three', clip: entry.clips.idle, time: 0 }, { view: 'side', clip: entry.clips.walk, time: 0.2 }], cols: 3, size: 420 }));
  rest.push({ skin, url, height: entry.height });
  process.stdout.write(`${skin} ${JSON.stringify({ bbox: info.bbox, bones: info.bones, tris: info.triangles,
    walkRootTravel: info.clips[entry.clips.walk] && info.clips[entry.clips.walk].rootTravel })}\n`);
}
// contact sheet: every skin's standing pose (idle frame 0), front and three-quarter view, three skins per row
const cells = [];
for (const r of rest) {
  cells.push(await page.evaluate((a) => window.filmstrip(a), { url: r.url, height: r.height, size: 240, cols: 2,
    jobs: [{ view: 'front', label: `${r.skin}  ${r.height.toFixed(2)} m` }, { view: 'three', label: 'idle pose, 3/4' }] }));
}
save('contact-sheet.png', await page.evaluate((a) => window.compose(a), { imgs: cells, w: 480, h: 240, cols: 3 }));
await browser.close();
server.close();
