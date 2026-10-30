import { describe, expect, it } from 'vitest';
import { forwardedFor, makeAccount } from './accounts';
import { stackConfig, stackProcesses, waitFor } from './stack';

const SECRET = 'x'.repeat(32);

describe('stackConfig', () => {
  it('is unavailable without a database or a running stack, and says why', () => {
    expect(stackConfig({})).toEqual({
      mode: 'unavailable',
      reason: expect.stringContaining('DATABASE_URL'),
    });
    expect(stackConfig({ DATABASE_URL: 'postgres://x' })).toMatchObject({
      mode: 'unavailable',
      reason: expect.stringContaining('BETTER_AUTH_SECRET'),
    });
    expect(stackConfig({ DATABASE_URL: 'postgres://x', BETTER_AUTH_SECRET: 'short' }).mode).toBe(
      'unavailable',
    );
  });

  it('attaches to a running stack first', () => {
    expect(
      stackConfig({ BALATRO_E2E_BASE_URL: 'http://localhost:7997/', DATABASE_URL: 'postgres://x' }),
    ).toEqual({
      mode: 'attach',
      baseUrl: 'http://localhost:7997',
      socketUrl: 'http://localhost:7001',
    });
  });

  it('spawns with default ports, or valid overrides', () => {
    const cfg = stackConfig({
      DATABASE_URL: 'postgres://x',
      BETTER_AUTH_SECRET: SECRET,
      BALATRO_E2E_WEB_PORT: '8100',
      BALATRO_E2E_HUB_PORT: 'nope',
    });
    expect(cfg).toMatchObject({
      mode: 'spawn',
      webPort: 8100,
      hubPort: 7001,
      baseUrl: 'http://localhost:8100',
      socketUrl: 'http://localhost:7001',
    });
  });
});

describe('stackProcesses', () => {
  it('wires the hub CORS to the app and the app to the hub, in a test build', () => {
    const cfg = stackConfig({ DATABASE_URL: 'postgres://db', BETTER_AUTH_SECRET: SECRET });
    if (cfg.mode !== 'spawn') throw new Error('expected spawn');
    const [hub, web] = stackProcesses(cfg);
    expect(hub.args).toEqual(['server/socket-server/index.ts']);
    expect(hub.env).toMatchObject({
      SOCKET_PORT: '7001',
      SOCKET_CORS_ORIGIN: 'http://localhost:7997',
      DATABASE_URL: 'postgres://db',
    });
    expect(web.args).toEqual(['dev', '--port', '7997', '--strictPort']);
    expect(web.env).toMatchObject({
      VITE_SOCKET_URL: 'http://localhost:7001',
      VITE_BALATRO_MP_TEST: '1',
      BETTER_AUTH_URL: 'http://localhost:7997',
      BETTER_AUTH_SECRET: SECRET,
    });
  });
});

describe('waitFor', () => {
  it('resolves once the probe passes and reports the last error on timeout', async () => {
    let n = 0;
    await waitFor('probe', async () => ++n >= 3, 1000, 1);
    expect(n).toBe(3);
    await expect(
      waitFor(
        'never',
        async () => {
          throw new Error('ECONNREFUSED');
        },
        30,
        5,
      ),
    ).rejects.toThrow(/timed out waiting for never \(last error: ECONNREFUSED\)/);
  });
});

describe('accounts', () => {
  it('makes unique, sanitised accounts per run and label', () => {
    const a = makeAccount('Host #1', 'run9');
    expect(a.email).toBe('balatro-e2e-run9-host1@example.test');
    expect(a.name).toBe('E2E HOST1');
    expect(makeAccount('p2', 'run9').email).not.toBe(makeAccount('p2', 'run10').email);
  });
  it('gives each account its own loopback address', () => {
    const addrs = new Set(Array.from({ length: 600 }, (_, i) => forwardedFor(i)));
    expect(addrs.size).toBe(600);
    expect(forwardedFor(0)).toBe('127.10.0.1');
  });
});
