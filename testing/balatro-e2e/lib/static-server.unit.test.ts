import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveStaticPath, startStaticServer, type StaticServer } from './static-server';

const dir = mkdtempSync(path.join(tmpdir(), 'static-server-test-'));
const roots = {
  bundleDir: dir,
  engineDir: path.join(dir, 'engine'),
  packDir: path.join(dir, 'pack'),
};

describe('resolveStaticPath', () => {
  it('maps the runtime paths to their directories', () => {
    expect(resolveStaticPath('/', roots)).toEqual({ kind: 'html' });
    expect(resolveStaticPath('/?mp=1', roots)).toEqual({ kind: 'html' });
    expect(resolveStaticPath('/app.js', roots)).toMatchObject({
      kind: 'file',
      file: path.join(dir, 'app.js'),
      type: expect.stringContaining('javascript'),
    });
    expect(resolveStaticPath('/balatro/engine/love.wasm', roots)).toMatchObject({
      file: path.join(dir, 'engine/love.wasm'),
      type: 'application/wasm',
    });
    expect(resolveStaticPath('/api/balatro/pack/core-2a3045c1e7e7.zip', roots)).toMatchObject({
      file: path.join(dir, 'pack/core-2a3045c1e7e7.zip'),
    });
  });

  it('never leaves its directories', () => {
    for (const p of [
      '/balatro/engine/../../etc/passwd',
      '/balatro/engine/%2e%2e%2fsecret',
      '/balatro/engine/.hidden',
      '/api/balatro/pack/../game-pack.json',
      '/api/balatro/pack/core.zip',
      '/api/balatro/pack/core-2a3045c1e7e7.zip/x',
      '/package.json',
      '/%E0%A4%A',
    ]) {
      expect(resolveStaticPath(p, roots), p).toEqual({ kind: 'missing' });
    }
  });
});

describe('startStaticServer', () => {
  let server: StaticServer;
  beforeAll(async () => {
    writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
    server = await startStaticServer(roots);
  });
  afterAll(() => server.close());

  it('serves the page and the bundle, 404s the rest, and logs every request', async () => {
    const page = await fetch(`${server.url}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<script src="/app.js">');
    const app = await fetch(`${server.url}/app.js`);
    expect(await app.text()).toBe('console.log(1)');
    expect((await fetch(`${server.url}/balatro/engine/love.js`)).status).toBe(404);
    expect((await fetch(`${server.url}/app.js`, { method: 'POST' })).status).toBe(405);
    expect(server.requests).toEqual(['/', '/app.js', '/balatro/engine/love.js', '/app.js']);
  });
});
