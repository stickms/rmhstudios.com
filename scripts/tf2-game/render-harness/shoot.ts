/**
 * Screenshot harness for lib/tf2-game/render (not part of the app). Bundles page.ts with
 * esbuild, serves it with a map package directory and the game installs, opens it in
 * headless Chromium (SwiftShader WebGL) and writes one JPEG per view plus a stats JSON.
 *
 *   pnpm exec tsx scripts/tf2-game/render-harness/shoot.ts --game tf2 --map ctf_2fort \
 *     [--views scripts/tf2-game/render-harness/views.json] [--only <name,…>] \
 *     [--pkg <maps-out root>] [--out <dir>] [--size 960x540] [--mode auto|package|original] \
 *     [--spawns]   # also shoot every player start (info_player_teamspawn / info_player_start)
 *     [--scenes scripts/tf2-game/render-harness/entity-scenes.json]  # entity scenes instead of views
 *
 * An entity scene (lib/tf2-game/render/entities) places entities, an optional view model and
 * sim events, runs `script` steps ({ advance: s } | { event } | { patch: { id, fields } }),
 * then shoots. An entity with `"ground": true` is dropped onto the floor under it.
 *
 * --pkg is the root holding `<game>/maps/index.json` etc. (default $RENDER_PKG_ROOT);
 * original BSPs come from $TF2_ROOT/maps, $HL2_ROOT/maps, $PORTAL_ROOT/maps
 * (defaults: the local installs used during development).
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

interface SceneEntity {
  id: number;
  type: string;
  fields: Record<string, number | string | boolean>;
  ground?: boolean;
}
interface Scene {
  name: string;
  view: View;
  entities?: SceneEntity[];
  vm?: Record<string, unknown> | null;
  script?: Array<{
    advance?: number;
    event?: Record<string, unknown>;
    patch?: { id: number; fields: Record<string, unknown> };
    vm?: Record<string, unknown>;
  }>;
}

interface View {
  name: string;
  origin: [number, number, number];
  angles: [number, number, number];
  fov?: number;
  pvs?: boolean;
}

const ROOT = path.resolve(import.meta.dirname, '../../..');
const log = (...a: unknown[]): void => {
  process.stdout.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
};
const args = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const game = arg('game', 'tf2')!;
const map = arg('map', 'ctf_2fort')!;
const pkgRoot = arg('pkg', process.env.RENDER_PKG_ROOT ?? '');
const outDir = path.resolve(arg('out', process.env.RENDER_OUT ?? path.join(ROOT, '.render-shots'))!);
const [W, H] = (arg('size', '960x540') ?? '960x540').split('x').map(Number);
const mode = arg('mode', 'auto')!;
const only = arg('only')?.split(',');
const installs: Record<string, string> = {
  tf2: process.env.TF2_ROOT ?? '/home/user/tf2ds/tf',
  hl2: process.env.HL2_ROOT ?? '/home/user/hl2demo/hl2',
  portal: process.env.PORTAL_ROOT ?? '/home/user/portaldemo/portal',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.bsp': 'application/octet-stream',
  '.bin': 'application/octet-stream',
};

async function bundle(): Promise<string> {
  const r = await build({
    entryPoints: [path.join(import.meta.dirname, 'page.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    alias: { '@': ROOT },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  return r.outputFiles[0].text;
}

function serve(js: string): Promise<{ server: Server; port: number }> {
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style><canvas id="c"></canvas><script type="module" src="/harness.js"></script>`;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = decodeURIComponent(url.pathname);
    const send = (status: number, body: string | Buffer, type = 'text/plain') => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };
    if (p === '/' || p === '/index.html') return send(200, html, 'text/html');
    if (p === '/harness.js') return send(200, js, 'text/javascript');
    let file: string | null = null;
    let m = /^\/pkg\/(tf2|hl2|portal)\/(.+)$/.exec(p);
    if (m && pkgRoot) file = path.join(pkgRoot, m[1], m[2]);
    m = /^\/orig\/(tf2|hl2|portal)\/([\w.-]+\.bsp)$/.exec(p);
    if (m) file = path.join(installs[m[1]], 'maps', m[2]);
    if (!file || file.includes('..') || !existsSync(file) || !statSync(file).isFile()) return send(404, 'not found');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const a = server.address();
    resolve({ server, port: typeof a === 'object' && a ? a.port : 0 });
  }));
}

function findChromium(): string {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  return chromium.executablePath();
}

async function main(): Promise<void> {
  const viewsFile = arg('views', path.join(import.meta.dirname, 'views.json'))!;
  const allViews = JSON.parse(readFileSync(viewsFile, 'utf8')) as Record<string, View[]>;
  let views = (allViews[`${game}/${map}`] ?? []).filter((v) => !only || only.includes(v.name));
  mkdirSync(outDir, { recursive: true });
  const js = await bundle();
  const { server, port } = await serve(js);
  // The full Chromium build (the headless shell is not always installed); new headless mode.
  const exe = process.env.CHROMIUM_PATH ?? findChromium();
  const browser = await chromium.launch({
    executablePath: existsSync(exe) ? exe : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') log(`[page ${msg.type()}]`, msg.text().slice(0, 300));
    });
    page.on('pageerror', (e) => log('[page error]', e.message));
    await page.goto(`http://127.0.0.1:${port}/?w=${W}&h=${H}${arg('lighting') ? `&lighting=${arg('lighting')}` : ''}${arg('debug') ? `&debug=${arg('debug')}` : ''}`);
    await page.waitForFunction(() => window.harness?.ready === true);
    const load = await page.evaluate(
      ([g, m, mo]) => window.harness.loadMap(g as 'tf2', m, mo as 'auto'),
      [game, map, mode] as const,
    );
    log(`${game}/${map}: ${load.source}, fetch ${load.fetchMs.toFixed(0)} ms, parse ${load.parseMs.toFixed(0)} ms, build`, load.stats.buildMs, `chunks ${load.stats.chunks} (sky ${load.stats.skyChunks}), materials ${load.stats.materials}, tris ${load.stats.trisTotal}, lightmap ${load.stats.lightmap.width}x${load.stats.lightmap.height}, hdr ${load.hdr} scale ${load.lightScale.toFixed(3)} (measured ${load.measuredHdrScale?.toFixed(3)})`);
    const evalJs = arg('eval');
    if (evalJs) log(JSON.stringify(await page.evaluate(evalJs), null, 0).slice(0, 4000));
    if (args.includes('--spawns')) {
      const spawns = await page.evaluate(() => [
        ...window.harness.entities('info_player_teamspawn'),
        ...window.harness.entities('info_player_start'),
      ]);
      const seen = new Set<string>();
      spawns.forEach((e, i) => {
        const key = e.classname === 'info_player_teamspawn' ? `${e.targetname ?? ''}|${e.teamnum ?? ''}` : String(i);
        if (seen.has(key)) return;
        seen.add(key);
        const o = (e.origin ?? '0 0 0').split(' ').map(Number) as [number, number, number];
        const a = (e.angles ?? '0 0 0').split(' ').map(Number) as [number, number, number];
        views.push({ name: `spawn${i}-${e.teamnum ?? ''}`, origin: [o[0], o[1], o[2] + 64], angles: [0, a[1], 0] });
      });
    }
    const scenesFile = arg('scenes');
    if (scenesFile) {
      const all = JSON.parse(readFileSync(scenesFile, 'utf8')) as Record<string, Scene[]>;
      const scenes = (all[`${game}/${map}`] ?? []).filter((v) => !only || only.includes(v.name));
      for (const sc of scenes) {
        const t = Date.now();
        await page.evaluate(async (scene) => {
          const h = window.harness;
          const v = scene.view;
          h.setView({ origin: { x: v.origin[0], y: v.origin[1], z: v.origin[2] }, angles: { x: v.angles[0], y: v.angles[1], z: v.angles[2] }, fov: v.fov ?? 90 });
          const states = (scene.entities ?? []).map((e) => {
            const f = { ...e.fields };
            if (e.ground) f.oz = h.groundZ(Number(f.ox), Number(f.oy), Number(f.oz ?? 0) + 64) + 0.1;
            return { id: e.id, type: e.type, fields: f };
          });
          h.setEntities(states as never);
          let vm = scene.vm ? { ...scene.vm } : null;
          h.setViewModel(vm as never);
          // Load everything first (models, particles), then play the script from the start.
          h.advance(0.05);
          await h.waitLoaded();
          h.advance(0.05);
          await h.waitLoaded();
          for (const step of scene.script ?? []) {
            if (step.advance) h.advance(step.advance);
            if (step.event) h.entityEvent(step.event as never);
            if (step.vm && vm) {
              vm = { ...vm, ...step.vm };
              h.setViewModel(vm as never);
            }
            if (step.patch) {
              const st = states.find((x) => x.id === step.patch!.id);
              if (st) Object.assign(st.fields, step.patch.fields);
            }
          }
          await h.waitLoaded();
        }, sc);
        const r = await page.evaluate(() => ({ r: window.harness.render(), e: window.harness.entityStats() }));
        const file = path.join(outDir, `${game}-${map}-${sc.name}${arg('tag') ? `-${arg('tag')}` : ''}.jpg`);
        await page.locator('#c').screenshot({ path: file, type: 'jpeg', quality: 85 });
        log(`${sc.name}: ${r.r.stats.drawCalls} draws, ${r.r.stats.triangles} tris, entities ${JSON.stringify(r.e)}, ${r.r.ms.toFixed(0)} ms render, ${Date.now() - t} ms total -> ${file}`);
      }
      return;
    }
    if (!views.length) views = [{ name: 'origin', origin: [0, 0, 64], angles: [0, 0, 0] }];
    const summary: Record<string, unknown> = { load };
    for (const v of views) {
      await page.evaluate((view) => {
        window.harness.setView({
          origin: { x: view.origin[0], y: view.origin[1], z: view.origin[2] },
          angles: { x: view.angles[0], y: view.angles[1], z: view.angles[2] },
          fov: view.fov ?? 90,
          pvs: view.pvs,
        });
        window.harness.render();
      }, v);
      await page.evaluate(() => window.harness.waitLoaded());
      const r = await page.evaluate(() => window.harness.render());
      const file = path.join(outDir, `${game}-${map}-${v.name}${arg('tag') ? `-${arg('tag')}` : ''}.jpg`);
      await page.locator('#c').screenshot({ path: file, type: 'jpeg', quality: 82 });
      log(`${v.name}: ${r.stats.drawCalls} draws, ${r.stats.triangles} tris, sky draws ${r.stats.skyDrawCalls}, visible prop meshes ${r.propMeshes}, visible brush models ${r.brushModels}, pvs chunks ${r.stats.pvsChunks}, cluster ${r.stats.cluster}, props ${JSON.stringify(r.stats.props)}, ${r.ms.toFixed(0)} ms (swiftshader) -> ${file}`);
      summary[v.name] = { drawCalls: r.stats.drawCalls, triangles: r.stats.triangles, pvsChunks: r.stats.pvsChunks, ms: r.ms };
    }
    writeFileSync(path.join(outDir, `${game}-${map}.stats.json`), JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
