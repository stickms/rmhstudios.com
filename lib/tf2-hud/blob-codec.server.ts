/**
 * Compression for stored HUD files and for uploads.
 *
 * Everything is stored Brotli-compressed unless it is already a compressed
 * format or does not shrink; the blob's identity (its SHA-1) is always of the
 * *uncompressed* bytes, so compression never changes dedupe or the manifest.
 * Decoding is bounded: a tiny upload that inflates to gigabytes is refused, not
 * allocated.
 */

import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';

export type StoredEncoding = 'none' | 'br';

export class CodecError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = 'CodecError';
  }
}

/** Magic numbers of formats that are already compressed (PNG, JPEG, Ogg, MP3, ZIP). */
export function looksCompressed(bytes: Uint8Array): boolean {
  const b = bytes;
  if (b.length < 4) return false;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return true; // OggS
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // ID3 (MP3)
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return true; // MPEG audio frame
  if (b[0] === 0x50 && b[1] === 0x4b) return true; // ZIP
  return false;
}

const MIN_SAVING = 0.95;

/** Choose how to store `bytes`: Brotli if it saves at least 5%, otherwise as-is. */
export function encodeForStorage(bytes: Uint8Array): { body: Buffer; encoding: StoredEncoding } {
  const raw = Buffer.from(bytes);
  if (raw.length < 64 || looksCompressed(raw)) return { body: raw, encoding: 'none' };
  const packed = brotliCompressSync(raw, {
    params: {
      // Files here are small and written once but read often: spend CPU on the write.
      [constants.BROTLI_PARAM_QUALITY]: raw.length > 2 * 1024 * 1024 ? 6 : 9,
      [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
    },
  });
  return packed.length <= raw.length * MIN_SAVING
    ? { body: packed, encoding: 'br' }
    : { body: raw, encoding: 'none' };
}

/** Undo {@link encodeForStorage}. `size` is the expected uncompressed length. */
export function decodeFromStorage(body: Buffer, encoding: string, size: number): Buffer {
  if (encoding !== 'br') return body;
  try {
    return brotliDecompressSync(body, { maxOutputLength: size + 1 });
  } catch {
    throw new CodecError('Stored file is corrupt', 400);
  }
}

/**
 * Decode an upload body. `identity` is passed through; `gzip` (what the browser's
 * `CompressionStream` produces) is inflated with a hard output ceiling.
 */
export function decodeUpload(body: Uint8Array, encoding: string | null, maxOut: number): Buffer {
  const raw = Buffer.from(body);
  if (!encoding || encoding === 'identity') {
    if (raw.length > maxOut) throw new CodecError('File is too large', 413);
    return raw;
  }
  if (encoding !== 'gzip') throw new CodecError('Unsupported upload encoding', 400);
  try {
    return gunzipSync(raw, { maxOutputLength: maxOut });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_BUFFER_TOO_LARGE') throw new CodecError('File is too large', 413);
    throw new CodecError('Upload could not be decompressed', 400);
  }
}
