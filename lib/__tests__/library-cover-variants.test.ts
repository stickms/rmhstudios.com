/**
 * WS4 — `/api/library/cover/$id` is unauthenticated; it used to encode a fresh
 * sharp variant (and cache entry) for every distinct w (1..2048) / q the caller
 * sent. It now rides the shared variant ladder, single-flight and CPU gate that
 * the feed image route uses.
 */
import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { COVER_QUALITIES, COVER_WIDTHS, VARIANT_WIDTHS } from '@/lib/images/variant-params';

const { getObject, handlerOpts } = vi.hoisted(() => ({
  getObject: vi.fn(),
  handlerOpts: { current: undefined as unknown },
}));

vi.mock('@/lib/storage/s3.server', () => ({ getObject }));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (opts: unknown, fn: unknown) => {
    handlerOpts.current = opts;
    return fn;
  },
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from '@/app/routes/api/library/cover/$id';

type Handler = (ctx: { request: Request; params: { id: string } }) => Promise<Response>;
const GET = (Route as unknown as { options: { server: { handlers: { GET: Handler } } } }).options
  .server.handlers.GET;

describe('library cover variants', () => {
  it('bounds distinct encodes for a sweep of widths to the ladder', async () => {
    const body = await sharp({
      create: { width: 400, height: 600, channels: 3, background: '#aa3366' },
    })
      .png()
      .toBuffer();
    getObject.mockResolvedValue({ body, contentType: 'image/png' });

    const id = 'abcdef123456';
    const statuses = new Set<number>();
    // 60 distinct widths spanning the ladder; each rung must be encoded once.
    for (let w = 20; w <= 2000; w += 33) {
      const res = await GET({
        request: new Request(`http://x/api/library/cover/${id}?w=${w}&f=webp`),
        params: { id },
      });
      statuses.add(res.status);
    }
    expect([...statuses]).toEqual([200]);
    // getObject runs once per distinct (snapped) key, not once per width sent.
    expect(getObject.mock.calls.length).toBeLessThanOrEqual(VARIANT_WIDTHS.length);
    expect(getObject.mock.calls.length).toBeGreaterThan(5);
  });

  it('is rate limited via defineHandler', () => {
    expect(handlerOpts.current).toMatchObject({
      auth: 'none',
      rateLimit: { limit: expect.any(Number), windowMs: 60_000 },
    });
  });

  it('snaps w, h and q jointly: a sweep of all three stays within the preset set', async () => {
    const body = await sharp({
      create: { width: 400, height: 600, channels: 3, background: '#33aa66' },
    })
      .png()
      .toBuffer();
    getObject.mockReset().mockResolvedValue({ body, contentType: 'image/png' });
    const id = 'sweep1234567';
    for (const w of [30, 100, 250, 300, 700, 1500]) {
      for (const h of [40, 200, 500, 900]) {
        for (const q of [10, 45, 60, 70, 82, 95]) {
          const res = await GET({
            request: new Request(`http://x/api/library/cover/${id}?w=${w}&h=${h}&q=${q}&f=webp`),
            params: { id },
          });
          expect(res.status).toBe(200);
        }
      }
    }
    // 144 distinct requests; h is ignored when w is present, q has two buckets.
    expect(getObject.mock.calls.length).toBeLessThanOrEqual(
      COVER_WIDTHS.length * COVER_QUALITIES.length,
    );
  });
});
