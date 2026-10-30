/**
 * The engine-spec harness's tiny static server (PLAN §4 WS14: "a static page with
 * no DB/hub that boots core+mp packs from data/balatro-pack").
 *
 * It serves exactly what lib/balatro/runtime.ts fetches, at the paths it fetches
 * them from, plus the harness page:
 *
 *   /                          the harness page (HARNESS_HTML)
 *   /app.js                    the bundled harness entry (testing/balatro-e2e/engine/page)
 *   /balatro/engine/<file>     public/balatro/engine (love.js, love.wasm)
 *   /api/balatro/pack/<file>   data/balatro-pack (content-addressed zips; no sign-in here)
 *
 * Anything else is 404; names are whitelisted per directory, so no path can
 * leave those directories. Every request is recorded (`requests`), which is how
 * e2e checks "no extra network request before running" (PLAN §6.4).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

export const HARNESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Balatro engine harness</title></head>
<body style="margin:0;background:#000">
<div id="frame" style="width:1280px;height:720px"><canvas id="canvas" style="width:100%;height:100%;display:block" oncontextmenu="event.preventDefault()"></canvas></div>
<script src="/app.js"></script>
</body></html>`;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticRoots {
  /** Directory holding app.js (the esbuild output). */
  bundleDir: string;
  engineDir?: string;
  packDir?: string;
}

export type Resolved =
  { kind: 'html' } | { kind: 'file'; file: string; type: string } | { kind: 'missing' };

const ENGINE_FILE = /^[A-Za-z0-9_.-]+$/;
const PACK_FILE = /^[a-z0-9]+-[0-9a-f]{12}\.zip$/;
const BUNDLE_FILE = /^app\.js(\.map)?$/;

/** Maps a request path to what the server sends (pure; unit-tested). */
export function resolveStaticPath(urlPath: string, roots: StaticRoots): Resolved {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return { kind: 'missing' };
  }
  if (pathname === '/' || pathname === '/index.html') return { kind: 'html' };
  const engineDir = roots.engineDir ?? path.join(REPO_ROOT, 'public/balatro/engine');
  const packDir = roots.packDir ?? path.join(REPO_ROOT, 'data/balatro-pack');
  let dir: string | null = null;
  let name = '';
  if (pathname.startsWith('/balatro/engine/')) {
    name = pathname.slice('/balatro/engine/'.length);
    if (ENGINE_FILE.test(name) && !name.startsWith('.')) dir = engineDir;
  } else if (pathname.startsWith('/api/balatro/pack/')) {
    name = pathname.slice('/api/balatro/pack/'.length);
    if (PACK_FILE.test(name)) dir = packDir;
  } else if (BUNDLE_FILE.test(pathname.slice(1))) {
    name = pathname.slice(1);
    dir = roots.bundleDir;
  }
  if (!dir) return { kind: 'missing' };
  const file = path.join(dir, name);
  if (path.dirname(file) !== path.resolve(dir)) return { kind: 'missing' };
  return { kind: 'file', file, type: TYPES[path.extname(name)] ?? 'application/octet-stream' };
}

export interface StaticServer {
  url: string;
  port: number;
  /** Every request path, in arrival order. */
  requests: string[];
  close(): Promise<void>;
}

export async function startStaticServer(roots: StaticRoots, port = 0): Promise<StaticServer> {
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '/';
    requests.push(url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const hit = resolveStaticPath(url, roots);
    if (hit.kind === 'html') {
      res
        .writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' })
        .end(HARNESS_HTML);
      return;
    }
    if (hit.kind === 'missing' || !existsSync(hit.file) || !statSync(hit.file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': hit.type,
      'content-length': statSync(hit.file).size,
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(hit.file).pipe(res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const actual = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
