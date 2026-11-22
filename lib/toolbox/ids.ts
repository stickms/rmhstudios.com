/**
 * Identifier generation and inspection: UUID v4 and v7 (RFC 9562), ULID and
 * nano IDs, all from `crypto.getRandomValues`.
 *
 * v7 and ULID carry their creation time in the leading 48 bits, so they sort by
 * time (the repo's own policy for new high-volume tables, lib/CLAUDE.md).
 * `inspectId` reads that time back out, and the version and variant of any UUID.
 */

import { randomBytes as cryptoBytes } from '@/lib/toolbox/random';

export type IdKind = 'uuid-v4' | 'uuid-v7' | 'ulid' | 'nanoid';

export const ID_KINDS: readonly IdKind[] = ['uuid-v4', 'uuid-v7', 'ulid', 'nanoid'];

export type ByteSource = (n: number) => Uint8Array;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function formatUuid(bytes: Uint8Array): string {
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function uuidV4(bytes: ByteSource = cryptoBytes): string {
  const b = bytes(16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(b);
}

function writeTime48(b: Uint8Array, ms: number) {
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
}

export function uuidV7(now = Date.now(), bytes: ByteSource = cryptoBytes): string {
  const b = bytes(16);
  writeTime48(b, now);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(b);
}

/** Crockford's Base32: no I, L, O or U, so an ID survives being read aloud. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now = Date.now(), bytes: ByteSource = cryptoBytes): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  // 80 random bits = 16 characters of 5 bits.
  const r = bytes(10);
  let bits = 0;
  let value = 0;
  let rand = '';
  for (const byte of r) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      rand += CROCKFORD.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return time + rand;
}

export const NANOID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/**
 * A nano ID of `size` characters from `alphabet`, with the mask-and-reject
 * method so every character is equally likely whatever the alphabet's length.
 */
export function nanoid(size = 21, alphabet = NANOID_ALPHABET, bytes: ByteSource = cryptoBytes): string {
  if (alphabet.length < 2 || alphabet.length > 256) throw new RangeError('nanoid: alphabet must have 2 to 256 symbols');
  const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * size) / alphabet.length);
  let id = '';
  for (;;) {
    for (const byte of bytes(step)) {
      const i = byte & mask;
      if (i < alphabet.length) {
        id += alphabet.charAt(i);
        if (id.length === size) return id;
      }
    }
  }
}

export function generateId(kind: IdKind, opts: { size?: number; alphabet?: string } = {}): string {
  switch (kind) {
    case 'uuid-v4':
      return uuidV4();
    case 'uuid-v7':
      return uuidV7();
    case 'ulid':
      return ulid();
    case 'nanoid':
      return nanoid(opts.size, opts.alphabet);
  }
}

/** Bits of randomness in one ID of this kind (for nano IDs, at the given size and alphabet). */
export function entropyBits(kind: IdKind, size = 21, alphabetLength = NANOID_ALPHABET.length): number {
  switch (kind) {
    case 'uuid-v4':
      return 122;
    case 'uuid-v7':
      return 74;
    case 'ulid':
      return 80;
    case 'nanoid':
      return Math.floor(size * Math.log2(alphabetLength));
  }
}

export type IdInspection =
  | {
      kind: 'uuid';
      version: number;
      variant: 'rfc' | 'ncs' | 'microsoft' | 'future';
      time?: Date;
      nil?: boolean;
      max?: boolean;
    }
  | { kind: 'ulid'; time: Date }
  | { kind: 'unknown' };

/** What an identifier is, and the time inside it when it has one (UUID v1, v6, v7; ULID). */
export function inspectId(input: string): IdInspection {
  const s = input.trim();
  const uuid = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i.exec(s);
  if (uuid) {
    const h = uuid.slice(1).join('').toLowerCase();
    if (/^0+$/.test(h)) return { kind: 'uuid', version: 0, variant: 'ncs', nil: true };
    if (/^f+$/.test(h)) return { kind: 'uuid', version: 15, variant: 'future', max: true };
    const version = Number.parseInt(h.charAt(12), 16);
    const v = Number.parseInt(h.charAt(16), 16);
    const variant = v < 8 ? 'ncs' : v < 12 ? 'rfc' : v < 14 ? 'microsoft' : 'future';
    let time: Date | undefined;
    if (version === 7) time = new Date(Number.parseInt(h.slice(0, 12), 16));
    if (version === 1 || version === 6) {
      // 60-bit count of 100 ns intervals since 1582-10-15.
      const ticks =
        version === 1
          ? BigInt(`0x${h.slice(13, 16)}${h.slice(8, 12)}${h.slice(0, 8)}`)
          : BigInt(`0x${h.slice(0, 12)}${h.slice(13, 16)}`);
      time = new Date(Number(ticks / 10_000n - 12_219_292_800_000n));
    }
    return { kind: 'uuid', version, variant, ...(time ? { time } : {}) };
  }
  const upper = s.toUpperCase();
  if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(upper)) {
    let ms = 0;
    for (const c of upper.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(c);
    return { kind: 'ulid', time: new Date(ms) };
  }
  return { kind: 'unknown' };
}
