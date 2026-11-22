/**
 * Message digests of text or a file, computed in the browser.
 *
 * The SHA family comes from Web Crypto (`crypto.subtle.digest`). MD5 is not in
 * Web Crypto, but download pages still publish MD5 checksums, so it is
 * implemented here (RFC 1321) — for checking a download, never for security.
 */

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

/** Algorithms broken for collision resistance: fine for a checksum, not for signatures. */
export const WEAK_ALGORITHMS: ReadonlySet<HashAlgorithm> = new Set(['MD5', 'SHA-1']);

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** MD5 of `data` (RFC 1321). */
export function md5(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8;
  const padded = new Uint8Array(((data.length + 8) >>> 6) * 64 + 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(off + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + (K[i] ?? 0) + (m[g] ?? 0)) >>> 0;
      const s = S[i] ?? 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
  return out;
}

/** The digest of `data` as lowercase hex. */
export async function digestHex(algorithm: HashAlgorithm, data: Uint8Array): Promise<string> {
  if (algorithm === 'MD5') return toHex(md5(data));
  const copy = new Uint8Array(data);
  return toHex(new Uint8Array(await crypto.subtle.digest(algorithm, copy)));
}

export async function digestAll(data: Uint8Array): Promise<Record<HashAlgorithm, string>> {
  const entries = await Promise.all(HASH_ALGORITHMS.map(async (a) => [a, await digestHex(a, data)] as const));
  return Object.fromEntries(entries) as Record<HashAlgorithm, string>;
}

/** Lowercase hex with spaces, colons and a leading `0x` removed, or `null` when it is not hex. */
export function normaliseHash(input: string): string | null {
  const clean = input
    .trim()
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/[\s:]+/g, '');
  return /^[0-9a-f]+$/.test(clean) ? clean : null;
}

/** Which algorithm, if any, produced `expected` among the digests computed. */
export function matchDigest(expected: string, digests: Partial<Record<HashAlgorithm, string>>): HashAlgorithm | null {
  const want = normaliseHash(expected);
  if (!want) return null;
  for (const algorithm of HASH_ALGORITHMS) if (digests[algorithm] === want) return algorithm;
  return null;
}
