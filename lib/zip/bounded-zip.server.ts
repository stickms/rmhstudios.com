/**
 * A zip read that never trusts the archive's own numbers.
 *
 * `jszip` checks nothing but the size an entry DECLARES before it inflates, and that field is the sender's: a header that
 * says 1 KB over a deflate stream that is 1 GB inflates all of it. This reader parses the central directory itself and
 * inflates each entry with `zlib.inflateRawSync(..., { maxOutputLength })`, which stops at the limit however the header
 * reads, and it counts every inflated byte against one total for the file. Only what the importers need is supported:
 * stored and deflated entries, no encryption, no zip64 (a file of a few MB never needs it). Every error message is fixed
 * text: nothing from the archive is echoed.
 */
import { inflateRawSync } from 'node:zlib';

export class ZipLimitError extends Error {
  constructor(message = 'Archive part is too large') {
    super(message);
    this.name = 'ZipLimitError';
  }
}

export class ZipFormatError extends Error {
  constructor(message = 'Archive is damaged or unsupported') {
    super(message);
    this.name = 'ZipFormatError';
  }
}

interface Entry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

export interface BoundedZip {
  has(path: string): boolean;
  /** The entry's bytes, or null when absent. Throws `ZipLimitError` past `maxBytes` or past the archive's total. */
  read(path: string, maxBytes: number): Buffer | null;
  /** Inflated bytes handed out so far. */
  readonly inflatedBytes: number;
}

export interface OpenZipOptions {
  /** Inflated bytes across every part read from this archive. */
  maxTotalBytes: number;
  /** Entries in the central directory. */
  maxEntries?: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function openZip(buffer: Buffer, opts: OpenZipOptions): BoundedZip {
  const maxEntries = opts.maxEntries ?? 5_000;
  // The end-of-central-directory record is within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipFormatError();
  const count = buffer.readUInt16LE(eocd + 10);
  const dirOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff) throw new ZipFormatError();
  if (count > maxEntries) throw new ZipLimitError('Archive has too many parts');

  const entries = new Map<string, Entry>();
  let pos = dirOffset;
  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CENTRAL) throw new ZipFormatError();
    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen > buffer.length) throw new ZipFormatError();
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    if ((flags & 1) === 0 && !entries.has(name)) entries.set(name, { method, compressedSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  let inflated = 0;
  return {
    has: (path) => entries.has(path),
    get inflatedBytes() {
      return inflated;
    },
    read(path, maxBytes) {
      const e = entries.get(path);
      if (!e) return null;
      const at = e.localOffset;
      if (at + 30 > buffer.length || buffer.readUInt32LE(at) !== LOCAL) throw new ZipFormatError();
      const start = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
      const end = start + e.compressedSize;
      if (end > buffer.length) throw new ZipFormatError();
      const raw = buffer.subarray(start, end);
      const room = Math.min(maxBytes, opts.maxTotalBytes - inflated);
      if (room < 0) throw new ZipLimitError();
      let out: Buffer;
      if (e.method === 0) {
        if (raw.length > room) throw new ZipLimitError();
        out = Buffer.from(raw);
      } else if (e.method === 8) {
        try {
          out = inflateRawSync(raw, { maxOutputLength: Math.max(1, room) });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new ZipLimitError();
          throw new ZipFormatError();
        }
        if (out.length > room) throw new ZipLimitError();
      } else {
        throw new ZipFormatError();
      }
      inflated += out.length;
      return out;
    },
  };
}
