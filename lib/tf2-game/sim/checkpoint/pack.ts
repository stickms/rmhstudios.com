/**
 * A checkpoint on the wire: `TF2M` · u8 version · deflate-raw(JSON). The host
 * packs one in its listen-server worker every couple of seconds and sends it
 * to its successor over the reliable DataChannel (net/p2p `TAG_CHECKPOINT`).
 *
 * Unpacking is bounded (a hostile or broken host cannot make a member inflate
 * gigabytes) and parsed defensively; the restore that follows checks the
 * version, the build's catalog fingerprint and the map.
 *
 * Environment-agnostic: CompressionStream is in every browser and Node ≥ 18.
 */

import type { WorldCheckpoint } from './world-state';

const MAGIC = [0x54, 0x46, 0x32, 0x4d]; // "TF2M"
export const CHECKPOINT_PACK_VERSION = 1;
/** Largest inflated checkpoint accepted (a 24-player match on a big map is a few MB of JSON). */
export const CHECKPOINT_MAX_INFLATED = 64 * 1024 * 1024;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const out = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  const reader = out.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error('checkpoint too large');
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return all;
}

export async function packCheckpoint(cp: WorldCheckpoint): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(cp));
  const z = await pipe(json, new CompressionStream('deflate-raw'), Number.MAX_SAFE_INTEGER);
  const out = new Uint8Array(5 + z.byteLength);
  out.set(MAGIC, 0);
  out[4] = CHECKPOINT_PACK_VERSION;
  out.set(z, 5);
  return out;
}

export async function unpackCheckpoint(bytes: Uint8Array): Promise<WorldCheckpoint> {
  if (bytes.byteLength < 6 || MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('not a checkpoint');
  if (bytes[4] !== CHECKPOINT_PACK_VERSION) throw new Error(`checkpoint pack version ${bytes[4]}`);
  const json = await pipe(bytes.subarray(5), new DecompressionStream('deflate-raw'), CHECKPOINT_MAX_INFLATED);
  const cp = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)) as WorldCheckpoint;
  if (!cp || typeof cp !== 'object' || typeof cp.version !== 'number' || !cp.graph || !Array.isArray(cp.graph.objs)) {
    throw new Error('malformed checkpoint');
  }
  return cp;
}

/** The tick a packed checkpoint was taken at, without inflating it (null when it is not one). */
export function isPackedCheckpoint(bytes: Uint8Array): boolean {
  return bytes.byteLength > 5 && MAGIC.every((b, i) => bytes[i] === b);
}
