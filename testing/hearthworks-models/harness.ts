/**
 * Serves the model harness page (page/entry.tsx, bundled by esbuild) and forwards the asset routes to the live site,
 * so the production `SkinFigure` loads its characters from the real R2 channels the way the game does:
 *
 *   /                                     the page
 *   /bundle.js                            the bundle
 *   (the manifest is bundled into the page; HW_TF2_SKIN=<n> sets the TF2 skin family at bundle time)
 *   /api/<game>-game/assets/<kind>/<file> -> ${HW_ASSET_ORIGIN:-https://rmhstudios.com}/api/<game>-game/assets/...
 *   /__sizes                              what was fetched: wire (content-length, compressed) and decoded bytes per file
 *
 * Node's fetch is used for the forwarding (set NODE_USE_ENV_PROXY=1 where outbound HTTPS needs the environment's
 * proxy). Responses are cached in memory for the life of the server; the assets are content-addressed and immutable.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

export interface FetchedFile {
  url: string;
  status: number;
  wireBytes: number | null;
  decodedBytes: number;
}

export interface ModelHarness {
  url: string;
  fetched: FetchedFile[];
  close(): Promise<void>;
}

export async function bundlePage(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(here, 'page/entry.tsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: 'inline',
    tsconfig: path.join(root, 'tsconfig.json'),
    logLevel: 'error',
    jsx: 'automatic',
    define: {
      'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'model-harness' }),
      'process.env.NODE_ENV': '"production"',
      'process.env.HW_TF2_SKIN': JSON.stringify(process.env.HW_TF2_SKIN ?? ''),
    },
  });
  return out.outputFiles[0].text;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Hearthworks models</title>
<style>html,body,#root{margin:0;width:100%;height:100%;background:#dde6e9}</style></head>
<body><div id="root"></div><script src="/bundle.js"></script></body></html>`;

const ASSET = /^\/api\/(tf2|hl2|portal|csgo)-game\/assets\/([a-z0-9_./-]+)$/;

export async function startModelHarness(): Promise<ModelHarness> {
  const bundle = await bundlePage();
  const origin = process.env.HW_ASSET_ORIGIN ?? 'https://rmhstudios.com';
  const cache = new Map<string, { status: number; type: string; body: Buffer }>();
  const fetched: FetchedFile[] = [];

  const server: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    try {
      if (u.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
      } else if (u.pathname === '/bundle.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(bundle);
      } else if (u.pathname === '/favicon.ico') {
        res.writeHead(204).end();
      } else if (u.pathname === '/__sizes') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(fetched));
      } else if (ASSET.test(u.pathname)) {
        let hit = cache.get(u.pathname);
        if (!hit) {
          const up = await fetch(origin + u.pathname);
          const body = Buffer.from(await up.arrayBuffer());
          const wire = up.headers.get('content-length');
          hit = { status: up.status, type: up.headers.get('content-type') ?? 'application/octet-stream', body };
          cache.set(u.pathname, hit);
          fetched.push({ url: u.pathname, status: up.status, wireBytes: wire ? Number(wire) : null, decodedBytes: body.length });
        }
        res.writeHead(hit.status, { 'content-type': hit.type, 'cache-control': 'no-store' }).end(hit.body);
      } else {
        res.writeHead(404).end('not found');
      }
    } catch (err) {
      res.writeHead(502).end(String(err));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    fetched,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
