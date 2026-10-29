/**
 * Decoded sounds, cached by content hash under a byte budget (least recently used first out).
 *
 * MP3s are small; their decoded PCM is not (32-bit float per sample per channel: a minute of
 * 44.1 kHz mono is ~10 MB), so the cache holds decoded buffers only up to `maxBytes` and drops
 * the least recently used ones that are not playing. A buffer some voice is playing is pinned
 * (`retain` / `release`) and never evicted; while everything is pinned the cache may run over
 * budget until voices finish. Concurrent requests for one sound share one fetch and decode; a
 * failed one is not cached, so the next request retries.
 *
 * No Web Audio import: the loader and decoder are injected, so this runs in tests as is.
 */

/** The part of an AudioBuffer the cache needs. */
export interface SizedBuffer {
  length: number;
  numberOfChannels: number;
}

export interface BufferCacheOptions<B extends SizedBuffer> {
  /** Budget for decoded audio, in bytes. */
  maxBytes: number;
  /** Fetches and decodes one sound; null when it does not exist. */
  load: (sha: string) => Promise<B | null>;
}

interface Slot<B> {
  buffer: B;
  bytes: number;
  pins: number;
}

/** Bytes of decoded PCM (Web Audio stores 32-bit float samples). */
export function decodedBytes(buffer: SizedBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

export class BufferCache<B extends SizedBuffer> {
  readonly maxBytes: number;
  private readonly load: (sha: string) => Promise<B | null>;
  /** Insertion order is recency order: the first key is the least recently used. */
  private readonly slots = new Map<string, Slot<B>>();
  private readonly pending = new Map<string, Promise<B | null>>();
  private total = 0;

  constructor(options: BufferCacheOptions<B>) {
    this.maxBytes = options.maxBytes;
    this.load = options.load;
  }

  /** Bytes of decoded audio held now. */
  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.slots.size;
  }

  has(sha: string): boolean {
    return this.slots.has(sha);
  }

  /** The buffer if it is decoded already (marks it recently used), else null. */
  peek(sha: string): B | null {
    const slot = this.slots.get(sha);
    if (!slot) return null;
    this.touch(sha, slot);
    return slot.buffer;
  }

  /** The decoded buffer, fetching and decoding it once if needed. */
  get(sha: string): Promise<B | null> {
    const hit = this.peek(sha);
    if (hit) return Promise.resolve(hit);
    let p = this.pending.get(sha);
    if (!p) {
      p = this.load(sha).then(
        (buffer) => {
          this.pending.delete(sha);
          if (buffer) this.insert(sha, buffer);
          return buffer;
        },
        (err: unknown) => {
          this.pending.delete(sha);
          throw err;
        },
      );
      this.pending.set(sha, p);
    }
    return p;
  }

  /** Pin a buffer while a voice plays it. */
  retain(sha: string): void {
    const slot = this.slots.get(sha);
    if (slot) slot.pins++;
  }

  /** Unpin it; the cache may evict it again once nothing plays it. */
  release(sha: string): void {
    const slot = this.slots.get(sha);
    if (slot && slot.pins > 0) {
      slot.pins--;
      if (slot.pins === 0) this.evict();
    }
  }

  clear(): void {
    for (const [sha, slot] of this.slots) {
      if (slot.pins === 0) {
        this.slots.delete(sha);
        this.total -= slot.bytes;
      }
    }
  }

  private touch(sha: string, slot: Slot<B>): void {
    this.slots.delete(sha);
    this.slots.set(sha, slot);
  }

  private insert(sha: string, buffer: B): void {
    const existing = this.slots.get(sha);
    if (existing) {
      this.touch(sha, existing);
      return;
    }
    const bytes = decodedBytes(buffer);
    this.slots.set(sha, { buffer, bytes, pins: 0 });
    this.total += bytes;
    this.evict(sha);
  }

  /** Drop least recently used, unpinned buffers until under budget (never `keep`). */
  private evict(keep?: string): void {
    if (this.total <= this.maxBytes) return;
    for (const [sha, slot] of this.slots) {
      if (this.total <= this.maxBytes) break;
      if (slot.pins > 0 || sha === keep) continue;
      this.slots.delete(sha);
      this.total -= slot.bytes;
    }
  }
}
