/**
 * Reads of the synced TF2 files (models, animation clips, particle bundles, paint kits) from object storage,
 * kept in memory so a popular file is fetched from the bucket once rather than once per viewer.
 *
 * Every GET on the bucket costs money and latency, and the same few hundred files are asked for over and over
 * (the class bodies, the common hats, a particle's textures). So:
 *  - a byte-budgeted LRU keeps what was read, as stored (Brotli stays Brotli, which is also what most
 *    browsers are sent), for a few minutes — files only change when a sync runs;
 *  - simultaneous reads of one key share one request;
 *  - a missing key is remembered for a minute, so a client asking for a model that does not exist (every item
 *    without one) does not reach the bucket each time;
 *  - a file too large to be worth holding is passed through uncached rather than evicting the rest.
 * Each file carries an `etag` (a hash of its stored bytes) for conditional requests.
 */

import { createHash } from 'node:crypto';
import { getObjectEncoded } from '@/lib/storage/s3.server';

export type StoredFile = NonNullable<Awaited<ReturnType<typeof getObjectEncoded>>> & {
  etag: string;
};

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TTL_MS = 10 * 60_000;
const MISS_TTL_MS = 60_000;

interface Entry {
  at: number;
  file: StoredFile | null;
  size: number;
}

// A Map iterates in insertion order, so re-inserting on a hit keeps the least recently used first.
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<StoredFile | null>>();
let bytes = 0;

const etagOf = (body: Buffer): string =>
  createHash('sha1').update(body).digest('base64url').slice(0, 22);

function remember(key: string, file: StoredFile | null): void {
  const size = file?.body.length ?? 0;
  if (size > MAX_FILE_BYTES) return;
  const old = entries.get(key);
  if (old) bytes -= old.size;
  entries.delete(key);
  entries.set(key, { at: Date.now(), file, size });
  bytes += size;
  for (const [k, e] of entries) {
    if (bytes <= MAX_BYTES) break;
    entries.delete(k);
    bytes -= e.size;
  }
}

/** The stored file at `key` (as stored: still Brotli-compressed when it was uploaded so), or null when absent. */
export async function readStored(key: string): Promise<StoredFile | null> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < (hit.file ? TTL_MS : MISS_TTL_MS)) {
    entries.delete(key);
    entries.set(key, hit);
    return hit.file;
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = getObjectEncoded(key)
      .then((object) => {
        const file = object ? { ...object, etag: etagOf(object.body) } : null;
        remember(key, file);
        return file;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** For tests: forget everything held. */
export function clearStoredCache(): void {
  entries.clear();
  inflight.clear();
  bytes = 0;
}
