/* eslint-disable no-console -- one-shot asset converter; the size report IS its output */
/**
 * Convert the kowloon-knockout fighter assets from FBX to binary glTF.
 *
 * The Mixamo exports in `public/kowloon/fighter/` are ~7.9 MB of uncompressed
 * FBX, and `FBXLoader` parses them on the main thread — measured as a ~3.5s
 * stall on entering the arena (docs/3d-performance-audit.md §4.1).
 *
 * three's FBXLoader and GLTFExporter both assume a DOM, so rather than shim one
 * this drives a real headless Chromium: load each FBX, re-export it as GLB, and
 * write the bytes back out. The rig keeps its skinned meshes; the clip files are
 * exported as animation-only GLBs (their skeleton is redundant — the rig
 * supplies it, and SkeletonUtils retargets by bone name).
 *
 * Usage: node scripts/convert-fighter-assets.mjs [--dry]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = join(ROOT, 'public/kowloon/fighter');
const RIG = 'ybot.fbx';
const DRY = process.argv.includes('--dry');

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/** Serve the repo so the page can fetch the FBX files and three's modules. */
function serve(port) {
    const types = {
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
        '.fbx': 'application/octet-stream', '.html': 'text/html',
    };
    const server = createServer(async (req, res) => {
        try {
            const url = decodeURIComponent(req.url.split('?')[0]);
            const path = join(ROOT, url);
            if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
            const body = await readFile(path);
            const ext = url.slice(url.lastIndexOf('.'));
            res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const PORT = 7799;
const server = await serve(PORT);
const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error('  [page]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.error('  [pageerror]', String(e).slice(0, 200)));

await page.goto(`http://localhost:${PORT}/scripts/fighter-convert.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, { timeout: 120000 });

const files = (await readdir(ASSET_DIR)).filter((f) => f.endsWith('.fbx')).sort();
let beforeTotal = 0;
let afterTotal = 0;
const report = [];

for (const file of files) {
    const before = (await stat(join(ASSET_DIR, file))).size;
    beforeTotal += before;

    const result = await page.evaluate(
        async ([url, animationOnly]) => window.convertFbxToGlb(url, animationOnly),
        [`/public/kowloon/fighter/${file}`, file !== RIG],
    );
    if (result.error) {
        console.error(`FAILED ${file}: ${result.error}`);
        process.exitCode = 1;
        continue;
    }

    const bytes = Buffer.from(result.b64, 'base64');
    afterTotal += bytes.length;
    const out = file.replace(/\.fbx$/, '.glb');
    if (!DRY) await writeFile(join(ASSET_DIR, out), bytes);

    report.push({ file, out, before, after: bytes.length, clips: result.clips, bones: result.bones, meshes: result.meshes });
    console.log(
        `${file.padEnd(14)} ${kb(before).padStart(10)} -> ${kb(bytes.length).padStart(10)}` +
        `  (${(100 - (bytes.length / before) * 100).toFixed(0)}% smaller)` +
        `  clips=${result.clips.length} bones=${result.bones} meshes=${result.meshes}` +
        (result.vertsBefore ? `  verts ${result.vertsBefore}->${result.vertsAfter}` : ''),
    );
}

console.log(`\nTOTAL ${kb(beforeTotal)} -> ${kb(afterTotal)}  (${(100 - (afterTotal / beforeTotal) * 100).toFixed(1)}% smaller)`);
if (DRY) console.log('(dry run — nothing written)');

await browser.close();
server.close();
