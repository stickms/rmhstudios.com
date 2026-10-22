/**
 * Serving one encoded image variant — server-only.
 *
 * The variant routes each had the same shape: look in the shared LRU, else load
 * the source, run sharp, store, respond. Two things were missing from it, and
 * both are about what happens on a **miss**:
 *
 * 1. **No single-flight.** A page with 30 avatars of one author, or a crawler
 *    hitting a shared post, sends N concurrent requests for one cold tuple; each
 *    loaded the source and ran its own encode. Now concurrent callers of one key
 *    share one load + encode.
 * 2. **No admission control.** sharp does not block the event loop (measured
 *    stall <= 5 ms for every width/format), but it runs on the libuv threadpool,
 *    which `dns.lookup`, `fs` and `crypto` share. Eight concurrent AVIF encodes
 *    held all four threads for 0.7-2.4 s and a `dns.lookup` + `fs.stat` pair that
 *    takes 0.13 ms idle took up to 2.4 s (results/ws-6.md). Encodes now go
 *    through {@link cpuGate}.
 *
 * Source loading (object-store GET / upstream fetch) happens **inside** the
 * gate, with the encode. The queue is what bounds how many source buffers (up
 * to 10 MB each) are alive at once; loading before queueing would let a flood
 * of distinct keys each pin a buffer while waiting for a slot. The cost is that
 * a slow load holds a slot, which is bounded by the loaders' own timeouts.
 */

import {
  getCachedVariant,
  optimizeImage,
  setCachedVariant,
  type CachedImage,
  type ImageFormat,
} from '@/lib/image-optimize';
import { cpuGate, CpuGateFullError } from '@/lib/images/cpu-gate.server';

export { CpuGateFullError };

/** What a loader returns: the source bytes, or a response to relay to the caller. */
export type VariantSource =
  { bytes: Buffer } | { fail: { status: number; body: Record<string, unknown> } };

export type VariantResult =
  | { ok: true; image: CachedImage; hit: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

const inflight = new Map<string, Promise<VariantResult | null>>();

export interface VariantRequest {
  /** `variantCacheKey(...)` — must include every input the bytes depend on. */
  cacheKey: string;
  width?: number;
  height?: number;
  quality: number;
  format: ImageFormat;
  /** Read the source. Returning `null` means "not found". */
  load: () => Promise<VariantSource | null>;
}

/**
 * The encoded variant for `req`: from the LRU, from an encode already running
 * for the same key, or from a fresh load + gated encode. `null` when the source
 * does not exist.
 */
export async function getOrEncodeVariant(req: VariantRequest): Promise<VariantResult | null> {
  const hit = getCachedVariant(req.cacheKey);
  if (hit) return { ok: true, image: hit, hit: true };

  const running = inflight.get(req.cacheKey);
  if (running) return running;

  const p = (async (): Promise<VariantResult | null> => {
    return cpuGate.run(async (): Promise<VariantResult | null> => {
      const source = await req.load();
      if (!source) return null;
      if ('fail' in source) return { ok: false, ...source.fail };
      const result = await optimizeImage(source.bytes, {
        width: req.width,
        height: req.height,
        quality: req.quality,
        format: req.format,
      });
      const image: CachedImage = { buffer: result.buffer, contentType: result.contentType };
      setCachedVariant(req.cacheKey, image);
      return { ok: true, image, hit: false };
    });
  })();

  inflight.set(req.cacheKey, p);
  try {
    return await p;
  } finally {
    inflight.delete(req.cacheKey);
  }
}

/** The 503 a route answers when the gate's queue is full. */
export function busyResponse(): Response {
  return Response.json(
    { error: 'Image service busy, retry shortly' },
    { status: 503, headers: { 'Retry-After': '2', 'Cache-Control': 'no-store' } },
  );
}
