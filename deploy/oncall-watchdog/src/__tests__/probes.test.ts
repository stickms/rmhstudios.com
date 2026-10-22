import { describe, expect, it } from 'vitest';
import { Engine } from '../engine';
import { checkHeartbeats, recordHeartbeat, runProbes } from '../probes';
import { ctx, memoryStorage, recordingNotifier } from './helpers';

// The off-box checks are the only thing that notices the VPS itself dying.

const env = { SITE_URL: 'https://site.test', STATUS_URL: 'https://status.test' };
const T0 = 1_800_000_000_000;

function fakeSite(state: { up: boolean }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!state.up) throw new TypeError('fetch failed');
    if (url.startsWith('https://status.test')) return new Response(JSON.stringify({ checkedAt: new Date(T0).toISOString() }));
    if (url.includes('/api/ready')) return new Response('{"status":"ok"}');
    return new Response('<main id="main-content"></main>');
  }) as typeof fetch;
}

function setup() {
  const storage = memoryStorage();
  const notifier = recordingNotifier();
  return { storage, notifier, engine: new Engine(storage, notifier, ctx) };
}

describe('runProbes', () => {
  it('needs two consecutive failures to page and two successes to resolve', async () => {
    const { storage, notifier, engine } = setup();
    const site = { up: false };

    await runProbes(engine, storage, env, fakeSite(site), T0);
    expect(notifier.posts).toHaveLength(0);

    await runProbes(engine, storage, env, fakeSite(site), T0 + 60_000);
    expect((await engine.get('A01'))?.state).toBe('firing');
    expect((await engine.get('A02'))?.state).toBe('firing');

    site.up = true;
    await runProbes(engine, storage, env, fakeSite(site), T0 + 120_000);
    expect((await engine.get('A01'))?.state).toBe('firing');
    await runProbes(engine, storage, env, fakeSite(site), T0 + 180_000);
    expect((await engine.get('A01'))?.state).toBe('resolved');
  });

  it('writes nothing while everything is healthy', async () => {
    const { storage, engine } = setup();
    await runProbes(engine, storage, env, fakeSite({ up: true }), T0);
    expect(storage.data.size).toBe(0);
  });

  it('pages when the status page is serving a stale snapshot', async () => {
    const { storage, engine } = setup();
    const stale = fakeSite({ up: true });
    const later = T0 + 10 * 60_000;
    await runProbes(engine, storage, env, stale, later);
    await runProbes(engine, storage, env, stale, later + 60_000);
    expect((await engine.get('A03'))?.detail).toMatch(/prober stalled/);
  });
});

describe('heartbeats', () => {
  it('stay silent until armed, then page on silence and resolve on the next check-in', async () => {
    const { storage, engine } = setup();
    await checkHeartbeats(storage, engine, T0);
    expect(await engine.list()).toHaveLength(0);

    expect(await recordHeartbeat(storage, engine, 'status', T0)).toBe(true);
    await checkHeartbeats(storage, engine, T0 + 4 * 60_000);
    expect((await engine.get('A03:heartbeat'))?.state).toBe('firing');

    await recordHeartbeat(storage, engine, 'status', T0 + 5 * 60_000);
    expect((await engine.get('A03:heartbeat'))?.state).toBe('resolved');
  });

  it('rejects unknown heartbeat names', async () => {
    const { storage, engine } = setup();
    expect(await recordHeartbeat(storage, engine, 'nope', T0)).toBe(false);
  });
});
