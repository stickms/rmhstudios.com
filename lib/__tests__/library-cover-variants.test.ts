/**
 * WS4 — `/api/library/cover/$id` is unauthenticated; it used to encode a fresh
 * sharp variant (and cache entry) for every distinct w (1..2048) / q the caller
 * sent. It now rides the shared variant ladder, single-flight and CPU gate that
 * the feed image route uses.
 */
import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { VARIANT_WIDTHS } from '@/lib/images/variant-params';

const { getObject } = vi.hoisted(() => ({ getObject: vi.fn() }));

vi.mock('@/lib/storage/s3.server', () => ({ getObject }));
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
});
