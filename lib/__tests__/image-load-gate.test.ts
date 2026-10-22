/**
 * The image miss path's two gates: a slow source load must not hold a CPU-gate
 * slot, saturation answers 429 (not 5xx), and a saturated gate cannot trip the
 * post-deploy guard.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cpuGate, loadGate, createCpuGate, CpuGateFullError } from '@/lib/images/cpu-gate.server';
import { busyResponse, getOrEncodeVariant } from '@/lib/images/variants.server';
import { Collector } from '@/lib/perf/process-metrics';
import { newRollupMemory, rollup, type MetricRow } from '@/lib/ops/metrics-rollup';
import { guardVerdict } from '@/lib/ops/post-deploy';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('getOrEncodeVariant gate split', () => {
  it('a source load that never finishes holds a load slot, never a CPU slot', async () => {
    const never = new Promise<never>(() => {});
    void getOrEncodeVariant({
      cacheKey: 'gate-split-1',
      quality: 80,
      format: 'webp',
      load: () => never,
    });
    await tick();
    expect(loadGate.stats.active).toBe(1);
    expect(cpuGate.stats.active).toBe(0);
  });

  it('runs the encode inside the CPU gate after the load', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const r = await getOrEncodeVariant({
      cacheKey: 'gate-split-2',
      quality: 80,
      format: 'webp',
      load: async () => ({ bytes: png }),
    });
    expect(r && r.ok).toBe(true);
    expect(cpuGate.stats.active).toBe(0);
  });
});

describe('gate saturation', () => {
  it('answers 429 + Retry-After, never 5xx', () => {
    const res = busyResponse();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('a full gate rejects with CpuGateFullError', async () => {
    const gate = createCpuGate(1, 1);
    const hold = new Promise<void>(() => {});
    void gate.run(() => hold);
    void gate.run(async () => 1);
    await tick();
    await expect(gate.run(async () => 2)).rejects.toBeInstanceOf(CpuGateFullError);
  });

  const verdictFor = (status: number) => {
    const c = new Collector({ service: 'web' });
    c.recordRequest({ route: '/api/image-proxy', method: 'GET', status: 200, durationMs: 5 });
    const base = c.snapshot();
    for (const route of ['/api/image-proxy', '/api/feed/image/$filename', '/api/library/cover/$id']) {
      for (let i = 0; i < 400; i++) c.recordRequest({ route, method: 'GET', status, durationMs: 5 });
    }
    const T0 = 1_800_000_000_000;
    const mem = newRollupMemory();
    rollup([base], {}, T0, mem); // baseline
    const rows: MetricRow[] = [];
    for (let m = 1; m <= 4; m++) {
      // The same burst repeated each minute, as a sustained flood would be.
      rows.push(...rollup([c.snapshot()], {}, T0 + m * 60_000, mem));
      for (const route of ['/api/image-proxy']) {
        for (let i = 0; i < 400; i++) c.recordRequest({ route, method: 'GET', status, durationMs: 5 });
      }
    }
    return guardVerdict([], rows as never, T0, T0 + 5 * 60_000);
  };

  it('does not fail the post-deploy verdict when the gate sheds load', () => {
    expect(verdictFor(busyResponse().status).rollback).toBe(false);
  });

  it('control: the same flood answered 503 WOULD roll the release back', () => {
    expect(verdictFor(503).rollback).toBe(true);
  });
});
