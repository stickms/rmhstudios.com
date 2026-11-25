import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';
import type { MonotonicCounters } from '@/lib/game-saves/conflict';
import { decodeWorld, encodeWorld } from './format';
import type { World } from '../world';

/**
 * The account copy of a town (client-safe; no zod, no network).
 *
 * `encodeWorld` / `decodeWorld` stay the only codec, so every migration and the zod schema still apply to a town that
 * comes back from the account. This file only wraps their bytes: gzip with the browser's `CompressionStream`, then
 * base64 so the shared save table (a JSON column) can hold it.
 */

/** The shared save table's own ceiling on one row, in bytes of JSON. Never raised for a town. */
export const HEARTHWORKS_CLOUD_BYTES = MAX_SAVE_BYTES;

/** What `decodeWorld` accepts, so a small payload cannot inflate into an unbounded buffer first. */
const MAX_WORLD_BYTES = 8 * 1024 * 1024;

/** What the conflict choice needs to tell two towns apart. */
export interface HearthworksSummary {
  /** When this copy was written, ms since epoch (`0` when unknown). */
  savedAt: number;
  tick: number;
  population: number;
  coins: number;
  buildings: number;
}

export interface HearthworksPayload {
  v: 1;
  enc: 'gzip-b64';
  data: string;
  summary: HearthworksSummary;
}

/** Whether this browser can gzip a town. Where it cannot, the account copy is skipped and local saving is unchanged. */
export function compressionSupported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

export function summaryOf(world: World, savedAt: number = Date.now()): HearthworksSummary {
  let coins = 0;
  for (const player of Object.values(world.players)) coins += Math.max(0, Math.floor(player.money) || 0);
  return {
    savedAt,
    tick: world.tick,
    population: world.city.population,
    coins,
    buildings: world.buildings.length,
  };
}

/**
 * The counters a town can be compared on. `population` is the peak: the live figure falls when homes are lost, and a
 * counter that goes down would report a bad week as a second history (the same reason Void Breaker counts cores
 * earned, not cores held).
 */
export function monotonicOf(world: World): MonotonicCounters {
  return {
    tick: world.tick,
    buildings: world.buildings.length,
    population: world.city.peakPopulation,
  };
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes)).catch(() => {});
  void writer.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Inflate, giving up past `limit` bytes. Throws on a stream that is not gzip. */
async function gunzip(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes)).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      void reader.cancel().catch(() => {});
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The size the shared save route measures: the JSON of the whole payload. */
export function payloadBytes(payload: HearthworksPayload): number {
  return JSON.stringify(payload).length;
}

/** The world with every player seat outside `keep` dropped (a copy when anything is dropped; the world itself when not). */
export function withOwnPlayersOnly(world: World, keep: readonly string[]): World {
  const ids = Object.keys(world.players);
  if (ids.every((id) => keep.includes(id))) return world;
  const players: World['players'] = {};
  for (const id of ids) if (keep.includes(id)) players[id] = world.players[id]!;
  return { ...world, players };
}

/**
 * A town as the account stores it, or `null` where `CompressionStream` is missing. The caller checks
 * {@link payloadBytes} against {@link HEARTHWORKS_CLOUD_BYTES} before sending.
 */
export async function packWorld(
  world: World,
  savedAt: number = Date.now(),
  ownPlayerIds?: readonly string[],
): Promise<HearthworksPayload | null> {
  if (!compressionSupported()) return null;
  // A town that was once hosted keeps its past guests' seats (their account ids, money, skins). Those are other
  // members' data and do not belong in this member's account copy (or their export): keep only the member's own.
  const own = ownPlayerIds ? withOwnPlayersOnly(world, ownPlayerIds) : world;
  const zipped = await gzip(encodeWorld(own));
  return { v: 1, enc: 'gzip-b64', data: toBase64(zipped), summary: summaryOf(own, savedAt) };
}

/** A town from what the account holds. Never throws: anything unreadable, corrupt or oversized is `null`. */
export async function unpackWorld(payload: unknown): Promise<World | null> {
  try {
    if (!compressionSupported()) return null;
    if (typeof payload !== 'object' || payload === null) return null;
    const p = payload as Partial<HearthworksPayload>;
    if (p.v !== 1 || p.enc !== 'gzip-b64' || typeof p.data !== 'string') return null;
    if (p.data.length > HEARTHWORKS_CLOUD_BYTES) return null;
    return decodeWorld(await gunzip(fromBase64(p.data), MAX_WORLD_BYTES));
  } catch {
    return null;
  }
}

/** When an account copy says it was written, from its own summary (`0` when it does not say). */
export function payloadSavedAt(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) return 0;
  const at = (payload as { summary?: { savedAt?: unknown } }).summary?.savedAt;
  return typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : 0;
}

/** The tick an account copy says it holds, without inflating it (`null` when it does not say). */
export function payloadTick(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const tick = (payload as { summary?: { tick?: unknown } }).summary?.tick;
  return typeof tick === 'number' && Number.isFinite(tick) ? tick : null;
}
