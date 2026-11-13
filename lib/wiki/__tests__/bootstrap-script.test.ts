/**
 * `scripts/wiki/bootstrap.mjs` run as a real process against a stand-in for
 * Wiki.js. The stand-in reproduces the one trap found on a real instance: the
 * setup wizard answers /healthz with its HTML page and a 200.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../../../scripts/wiki/bootstrap.mjs');
const PASSWORD = 'correct-horse-battery';

interface FakeWiki {
  url: string;
  requests: { path: string; body: Record<string, unknown>; auth: string | undefined }[];
  close: () => Promise<void>;
}

let server: Server | undefined;

async function fakeWiki(opts: { setUp: boolean }): Promise<FakeWiki> {
  let setUp = opts.setUp;
  const requests: FakeWiki['requests'] = [];
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const path = req.url ?? '';
      if (req.method === 'POST') requests.push({ path, body, auth: req.headers.authorization });
      const json = (value: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (!setUp) {
        if (path === '/finalize' && req.method === 'POST') {
          setUp = true;
          return json({ ok: true });
        }
        // The wizard serves its page for everything else, /healthz included.
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<!DOCTYPE html><html>setup</html>');
      }
      if (path === '/healthz') return json({ ok: true });
      if (path !== '/graphql') {
        res.writeHead(404);
        return res.end();
      }
      const query = String(body.query);
      const done = { succeeded: true, message: null };
      if (query.includes('login(')) {
        const variables = body.variables as { password: string };
        return variables.password === PASSWORD
          ? json({ data: { authentication: { login: { responseResult: done, jwt: 'jwt-1' } } } })
          : json({ errors: [{ message: 'Invalid email / username or password.' }] });
      }
      if (query.includes('setApiState')) {
        return json({ data: { authentication: { setApiState: { responseResult: done } } } });
      }
      if (query.includes('createApiKey')) {
        return json({
          data: { authentication: { createApiKey: { responseResult: done, key: 'the-api-key' } } },
        });
      }
      return json({ errors: [{ message: 'unexpected query' }] });
    });
  });
  await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((closed) => server!.close(() => closed())),
  };
}

function run(
  env: Record<string, string>,
  { viaStdin = false } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, viaStdin ? ['-'] : [SCRIPT], {
      // Only what the script reads: nothing from the developer's own .env.
      env: { PATH: process.env.PATH ?? '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => done({ code, stdout, stderr }));
    if (viaStdin) child.stdin.end(readFileSync(SCRIPT));
    else child.stdin.end();
  });
}

const creds = { WIKIJS_ADMIN_EMAIL: 'Admin@Example.com', WIKIJS_ADMIN_PASSWORD: PASSWORD };

afterEach(async () => {
  await new Promise<void>((closed) => (server ? server.close(() => closed()) : closed()));
  server = undefined;
});

describe('wiki bootstrap script', () => {
  it('finishes the wizard, turns the API on and prints the key', async () => {
    const wiki = await fakeWiki({ setUp: false });
    const out = await run({ ...creds, WIKIJS_URL: wiki.url });
    expect(out.code).toBe(0);
    expect(out.stdout.trim().split('\n').at(-1)).toBe('the-api-key');

    const [finalize, login, apiState, key] = wiki.requests;
    expect(finalize).toMatchObject({
      path: '/finalize',
      body: {
        adminEmail: 'Admin@Example.com',
        adminPassword: PASSWORD,
        adminPasswordConfirm: PASSWORD,
        siteUrl: 'https://wiki.rmhstudios.com',
        telemetry: false,
      },
    });
    expect(login!.body.variables).toEqual({ username: 'Admin@Example.com', password: PASSWORD });
    // Everything after sign-in carries the administrator's token.
    expect(apiState!.auth).toBe('Bearer jwt-1');
    expect(key!.auth).toBe('Bearer jwt-1');
    expect(String(key!.body.query)).toContain('fullAccess: true');
  });

  it('skips the wizard on a wiki that is already set up', async () => {
    const wiki = await fakeWiki({ setUp: true });
    const out = await run({ ...creds, WIKIJS_URL: wiki.url });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('already done');
    expect(wiki.requests.some((r) => r.path === '/finalize')).toBe(false);
    expect(out.stdout.trim().split('\n').at(-1)).toBe('the-api-key');
  });

  it('runs when piped to node on stdin, the way it is run inside the container', async () => {
    const wiki = await fakeWiki({ setUp: true });
    const out = await run({ ...creds, WIKIJS_URL: wiki.url }, { viaStdin: true });
    expect(out.stderr).toBe('');
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('the-api-key');
  });

  it('fails without printing a key when the password is wrong', async () => {
    const wiki = await fakeWiki({ setUp: true });
    const out = await run({
      ...creds,
      WIKIJS_ADMIN_PASSWORD: 'wrong-password',
      WIKIJS_URL: wiki.url,
    });
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('Invalid email / username or password.');
    expect(out.stdout).not.toContain('the-api-key');
  });

  it('refuses to start without credentials, and never echoes the password', async () => {
    const wiki = await fakeWiki({ setUp: false });
    const missing = await run({ WIKIJS_URL: wiki.url });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('WIKIJS_ADMIN_EMAIL');
    expect(wiki.requests).toHaveLength(0);

    const ok = await run({ ...creds, WIKIJS_URL: wiki.url });
    expect(ok.stdout + ok.stderr).not.toContain(PASSWORD);
  });

  it('reports a wiki it cannot reach', async () => {
    const out = await run({ ...creds, WIKIJS_URL: 'http://127.0.0.1:9' });
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('cannot reach');
  });
});
