/**
 * RMH Studios — Library PDF compression (server-only).
 *
 * Every uploaded or migrated PDF is gzip-compressed before it lands in object
 * storage, then served back with `Content-Encoding: gzip` so the browser (and
 * pdf.js) inflate it transparently. PDFs already deflate their internal streams,
 * so we only keep the gzipped copy when it is genuinely smaller — otherwise the
 * original bytes are stored as-is and storage never grows. When we do gzip, the
 * write records `Content-Encoding: gzip` on the object; the serve route reads
 * that back (and falls back to sniffing the gzip magic bytes for older objects).
 *
 * Dependency-free (Node's built-in zlib) so it works in the Bazel/pnpm build
 * without pulling in a native PDF toolchain.
 */
import { gzipSync } from 'node:zlib';

/** Gzip magic bytes — `1f 8b`. A stored object starting with these is gzipped. */
export function isGzipped(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/**
 * Compress a PDF for at-rest storage. Returns the gzipped bytes when that saves
 * space (the common-enough case for metadata-heavy or lightly-compressed PDFs),
 * otherwise the original buffer untouched. Never returns something larger than
 * the input.
 */
export function compressPdfForStorage(pdf: Buffer): Buffer {
  try {
    const gz = gzipSync(pdf, { level: 9 });
    return gz.length < pdf.length ? gz : pdf;
  } catch {
    // If compression fails for any reason, fall back to storing the raw PDF.
    return pdf;
  }
}
