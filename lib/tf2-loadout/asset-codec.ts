/**
 * How the asset sync stores a file in object storage: Brotli-compressed, with the
 * object's `Content-Encoding: br` set, so that
 *   - a browser that accepts `br` (all of them) receives the stored bytes untouched and decodes
 *     them itself (the serving routes pass them straight through), and
 *   - anything else is served the inflated original.
 * A file is stored raw only when Brotli cannot make it smaller (it never makes anything larger).
 * Pure and dependency-free of storage so the publisher and the tests share it.
 */

import { brotliCompressSync, brotliDecompressSync, constants as zc } from 'node:zlib';

export interface EncodedAsset {
  body: Buffer;
  /** `br` when compressed; undefined when Brotli could not shrink it. */
  contentEncoding?: 'br';
}

const TEXT = /^(text\/|application\/json)/;

export function encodeAsset(raw: Buffer, contentType: string): EncodedAsset {
  const br = brotliCompressSync(raw, {
    params: {
      // Text is small and compresses a lot: spend the time. Binary (DXT textures, GLB) is large.
      [zc.BROTLI_PARAM_QUALITY]: TEXT.test(contentType) ? 11 : 9,
      [zc.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  return br.length < raw.length ? { body: br, contentEncoding: 'br' } : { body: raw };
}

/** The original bytes of a stored asset. */
export function decodeAsset(stored: Buffer, contentEncoding?: string): Buffer {
  return contentEncoding === 'br' ? brotliDecompressSync(stored) : stored;
}
