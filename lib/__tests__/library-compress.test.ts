import { describe, test, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { compressPdfForStorage, isGzipped } from '@/lib/library/compress.server';

describe('compressPdfForStorage', () => {
  test('gzips a compressible PDF and round-trips back to the original', () => {
    // Highly repetitive bytes compress well, so the gzipped copy is kept.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64 * 1024, 0x41)]);
    const stored = compressPdfForStorage(pdf);
    expect(isGzipped(stored)).toBe(true);
    expect(stored.length).toBeLessThan(pdf.length);
    expect(gunzipSync(stored).equals(pdf)).toBe(true);
  });

  test('keeps the original bytes when gzip would not be smaller', () => {
    // Already-incompressible data: gzip overhead makes it grow, so we keep raw.
    const pdf = Buffer.from('%PDF-1.7 tiny');
    const stored = compressPdfForStorage(pdf);
    expect(stored.equals(pdf)).toBe(true);
    expect(isGzipped(stored)).toBe(false);
  });
});

describe('isGzipped', () => {
  test('detects the gzip magic bytes', () => {
    expect(isGzipped(Buffer.from([0x1f, 0x8b, 0x08]))).toBe(true);
    expect(isGzipped(Buffer.from('%PDF'))).toBe(false);
    expect(isGzipped(Buffer.alloc(0))).toBe(false);
  });
});
