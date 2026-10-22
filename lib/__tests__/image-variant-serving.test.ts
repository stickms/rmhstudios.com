/**
 * Image-variant serving (WS6): the parameter ladder that bounds the cache key
 * space, and the single-flight miss path.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  VARIANT_MAX_DIMENSION,
  VARIANT_WIDTHS,
  snapDimension,
  snapQuality,
} from '@/lib/images/variant-params';
import { getOrEncodeVariant } from '@/lib/images/variants.server';
import { cpuGate, loadGate } from '@/lib/images/cpu-gate.server';
import { variantCacheKey } from '@/lib/image-optimize';

describe('snapDimension', () => {
  it('leaves every width the client emits unchanged', () => {
    // OptimizedImage's WIDTHS, the 32px blur placeholder and the avatar sizes.
    for (const w of [32, 80, 160, 224, 320, 480, 640, 800, 1024, 1280, 1600, 2048]) {
      expect(snapDimension(String(w))).toBe(w);
    }
  });

  it('rounds up to the next rung, never down, and caps at the maximum', () => {
    expect(snapDimension('33')).toBe(48);
    expect(snapDimension('641')).toBe(768);
    expect(snapDimension('1')).toBe(16);
    expect(snapDimension('99999')).toBe(VARIANT_MAX_DIMENSION);
    for (let w = 1; w <= VARIANT_MAX_DIMENSION; w++) {
      expect(snapDimension(String(w))!).toBeGreaterThanOrEqual(w);
    }
  });

  it('bounds the key space: a sweep of every width yields only ladder rungs', () => {
    const seen = new Set<number>();
    for (let w = 1; w <= 5000; w++) seen.add(snapDimension(String(w))!);
    expect(seen.size).toBe(VARIANT_WIDTHS.length); // 27 encodes instead of 2048+
    expect(VARIANT_WIDTHS.at(-1)).toBe(VARIANT_MAX_DIMENSION);
  });

  it('treats absent, zero, negative and non-numeric values as "no constraint"', () => {
    for (const raw of [null, undefined, '', '0', '-5', 'abc', 'NaN']) {
      expect(snapDimension(raw as string | null)).toBeUndefined();
    }
  });
});

describe('snapQuality', () => {
  it('snaps to multiples of 5 within 5..100 and defaults to 80', () => {
    expect(snapQuality(null)).toBe(80);
    expect(snapQuality('abc')).toBe(80);
    expect(snapQuality('82')).toBe(80);
    expect(snapQuality('83')).toBe(85);
    expect(snapQuality('1')).toBe(5);
    expect(snapQuality('112')).toBe(100); // ProfileHero sends q=112
    const seen = new Set<number>();
    for (let q = -10; q < 300; q++) seen.add(snapQuality(String(q)));
    expect(seen.size).toBeLessThanOrEqual(20);
  });
});

describe('getOrEncodeVariant', () => {
  const png = () =>
    sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } })
      .png()
      .toBuffer();

  it('shares one load + encode between concurrent callers, then serves hits', async () => {
    const bytes = await png();
    let loads = 0;
    const req = {
      cacheKey: variantCacheKey('test', `single-flight-${Math.random()}`, {
        width: 32,
        quality: 80,
        format: 'webp',
      }),
      width: 32,
      quality: 80,
      format: 'webp' as const,
      load: async () => {
        loads++;
        await new Promise((r) => setTimeout(r, 15));
        return { bytes };
      },
    };

    const results = await Promise.all(Array.from({ length: 6 }, () => getOrEncodeVariant(req)));
    expect(loads).toBe(1);
    for (const r of results) {
      expect(r && r.ok && r.image.contentType).toBe('image/webp');
    }

    const again = await getOrEncodeVariant(req);
    expect(loads).toBe(1);
    expect(again && again.ok && again.hit).toBe(true);
  });

  it('returns null for a missing source and relays a loader failure without caching it', async () => {
    const key = (n: string) =>
      variantCacheKey('test', `${n}-${Math.random()}`, { quality: 80, format: 'webp' });

    expect(
      await getOrEncodeVariant({
        cacheKey: key('missing'),
        quality: 80,
        format: 'webp',
        load: async () => null,
      }),
    ).toBeNull();

    let calls = 0;
    const failing = {
      cacheKey: key('fail'),
      quality: 80,
      format: 'webp' as const,
      load: async () => {
        calls++;
        return { fail: { status: 502, body: { error: 'Failed to fetch upstream image' } } };
      },
    };
    const first = await getOrEncodeVariant(failing);
    expect(first).toEqual({
      ok: false,
      status: 502,
      body: { error: 'Failed to fetch upstream image' },
    });
    await getOrEncodeVariant(failing);
    expect(calls).toBe(2); // a failure is retried, not remembered
  });

  it('loads the source in the load gate, not the CPU gate, so a slow upstream cannot starve encodes', async () => {
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    let activeDuringLoad = -1;
    let loadsDuringLoad = -1;
    await getOrEncodeVariant({
      cacheKey: variantCacheKey('test', 'gate-load', { width: 16, quality: 80, format: 'webp' }),
      width: 16,
      quality: 80,
      format: 'webp',
      load: async () => {
        activeDuringLoad = cpuGate.stats.active;
        loadsDuringLoad = loadGate.stats.active;
        return { bytes: png };
      },
    });
    expect(activeDuringLoad).toBe(0);
    expect(loadsDuringLoad).toBeGreaterThanOrEqual(1);
  });
});
