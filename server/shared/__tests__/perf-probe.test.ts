import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPerfProbe, handlePerfProbeRequest, perfProbeEnabled } from '../perf-probe';

const saved = process.env.RMH_PERF_HUB;
afterEach(() => {
  if (saved === undefined) delete process.env.RMH_PERF_HUB;
  else process.env.RMH_PERF_HUB = saved;
});

async function hit(method: string, path: string): Promise<{ status: number; body: string }> {
  const server = createServer((req, res) => {
    if (handlePerfProbeRequest(req, res)) return;
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    return { status: r.status, body: await r.text() };
  } finally {
    server.close();
  }
}

describe('hub perf probe', () => {
  it('is off by default: no probe object and the endpoints are 404', async () => {
    delete process.env.RMH_PERF_HUB;
    expect(perfProbeEnabled()).toBe(false);
    expect(getPerfProbe()).toBeNull();
    expect((await hit('GET', '/__perf')).status).toBe(404);
    expect((await hit('POST', '/__perf/reset')).status).toBe(404);
  });

  it('stays off for any value other than "1"', () => {
    expect(perfProbeEnabled({ RMH_PERF_HUB: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(perfProbeEnabled({ RMH_PERF_HUB: 'true' } as NodeJS.ProcessEnv)).toBe(false);
    expect(perfProbeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('serves a snapshot only when RMH_PERF_HUB=1', async () => {
    process.env.RMH_PERF_HUB = '1';
    const r = await hit('GET', '/__perf');
    expect(r.status).toBe(200);
    const snap = JSON.parse(r.body);
    expect(snap.eld).toHaveProperty('p99');
    expect(snap.rssBytes).toBeGreaterThan(0);
    getPerfProbe()?.stop();
  });
});
