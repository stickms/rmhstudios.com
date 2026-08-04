import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { brotliDecompressSync } from 'node:zlib';
import {
  compressForStorage,
  stripJpegAppSegments,
  savingsPercent,
} from '@/lib/storage/compress.server';
import {
  validateVoiceUpload,
  limitsFor,
  expectedBytes,
  VOICE_LIMITS,
  VOICE_ABSOLUTE_MAX_BYTES,
} from '@/lib/media/voice-policy';

/** A deterministic image with enough structure that compression has something to do. */
async function makeImage(format: 'png' | 'webp' | 'jpeg', size = 128): Promise<Buffer> {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    px[i * 3] = (x * 2) % 256;
    px[i * 3 + 1] = (y * 2) % 256;
    px[i * 3 + 2] = ((x ^ y) * 3) % 256;
  }
  const img = sharp(px, { raw: { width: size, height: size, channels: 3 } });
  if (format === 'png') return img.png({ compressionLevel: 0 }).toBuffer();
  if (format === 'webp') return img.webp({ lossless: true, effort: 0 }).toBuffer();
  return img.jpeg({ quality: 90 }).toBuffer();
}

/** Decoded pixels, for proving losslessness rather than asserting it. */
async function pixels(buf: Buffer): Promise<Buffer> {
  return sharp(buf).raw().toBuffer();
}

describe('compressForStorage', () => {
  it('shrinks a poorly-compressed PNG', async () => {
    const input = await makeImage('png');
    const out = await compressForStorage(input, 'image/png');
    expect(out.body.length).toBeLessThan(input.length);
    expect(out.contentType).toBe('image/png');
    expect(out.contentEncoding).toBeUndefined();
  });

  it('keeps PNG pixels bit-for-bit identical', async () => {
    const input = await makeImage('png');
    const out = await compressForStorage(input, 'image/png');
    expect(await pixels(out.body)).toEqual(await pixels(input));
  });

  it('shrinks a low-effort lossless WebP and keeps its pixels', async () => {
    const input = await makeImage('webp');
    const out = await compressForStorage(input, 'image/webp');
    expect(out.body.length).toBeLessThanOrEqual(input.length);
    expect(await pixels(out.body)).toEqual(await pixels(input));
  });

  it('never re-encodes a JPEG — pixels survive exactly', async () => {
    const input = await makeImage('jpeg');
    const out = await compressForStorage(input, 'image/jpeg');
    // Metadata stripping may or may not shrink this synthetic file; what must
    // hold either way is that no pixel moved. A sharp re-encode would fail this.
    expect(await pixels(out.body)).toEqual(await pixels(input));
  });

  it('brotlis JSON and marks the encoding', async () => {
    const json = Buffer.from(JSON.stringify({ items: Array.from({ length: 400 }, (_, i) => ({ i, name: `item-${i}` })) }));
    const out = await compressForStorage(json, 'application/json');
    expect(out.contentEncoding).toBe('br');
    expect(out.body.length).toBeLessThan(json.length);
    // Reversible, exactly.
    expect(brotliDecompressSync(out.body)).toEqual(json);
  });

  it('leaves audio alone — voice is compressed by the client', async () => {
    const audio = Buffer.alloc(4096, 7);
    const out = await compressForStorage(audio, 'audio/webm');
    expect(out.body).toBe(audio);
    expect(out.contentEncoding).toBeUndefined();
  });

  it('leaves already-compressed containers alone', async () => {
    for (const type of ['video/mp4', 'image/gif', 'application/zip', 'image/avif']) {
      const buf = Buffer.alloc(4096, 3);
      const out = await compressForStorage(buf, type);
      expect({ type, same: out.body === buf }).toEqual({ type, same: true });
    }
  });

  it('skips tiny payloads where framing would dominate', async () => {
    const tiny = Buffer.from('{"a":1}');
    const out = await compressForStorage(tiny, 'application/json');
    expect(out.body).toBe(tiny);
  });

  it('never returns a larger body than it was given', async () => {
    // Incompressible noise: every path must decline rather than inflate.
    const noise = Buffer.alloc(8192);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 256;
    for (const type of ['application/json', 'text/plain', 'image/svg+xml']) {
      const out = await compressForStorage(noise, type);
      expect(out.body.length).toBeLessThanOrEqual(noise.length);
    }
  });

  it('returns the original when the encoder chokes', async () => {
    const notAnImage = Buffer.from('this is definitely not a png'.repeat(64));
    const out = await compressForStorage(notAnImage, 'image/png');
    expect(out.body).toBe(notAnImage);
  });

  it('never changes the content type', async () => {
    const cases: [Buffer, string][] = [
      [await makeImage('png'), 'image/png'],
      [await makeImage('webp'), 'image/webp'],
      [await makeImage('jpeg'), 'image/jpeg'],
      [Buffer.from('x'.repeat(2000)), 'text/plain'],
    ];
    for (const [buf, type] of cases) {
      const out = await compressForStorage(buf, type);
      expect(out.contentType).toBe(type);
    }
  });

  it('handles a content type with parameters', async () => {
    const json = Buffer.from(JSON.stringify(Array.from({ length: 200 }, (_, i) => i)));
    const out = await compressForStorage(json, 'application/json; charset=utf-8');
    expect(out.contentEncoding).toBe('br');
  });
});

describe('stripJpegAppSegments', () => {
  it('drops an EXIF block without touching the scan data', async () => {
    const base = await makeImage('jpeg');
    // Splice a fake APP1/EXIF segment in after SOI.
    const exifPayload = Buffer.alloc(2000, 0x41);
    const seg = Buffer.concat([
      Buffer.from([0xff, 0xe1]),
      (() => {
        const b = Buffer.alloc(2);
        b.writeUInt16BE(exifPayload.length + 2, 0);
        return b;
      })(),
      exifPayload,
    ]);
    const withExif = Buffer.concat([base.subarray(0, 2), seg, base.subarray(2)]);

    const out = stripJpegAppSegments(withExif);
    expect(out.length).toBeLessThan(withExif.length);
    expect(await pixels(out)).toEqual(await pixels(base));
  });

  it('returns non-JPEG input untouched', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    expect(stripJpegAppSegments(png)).toBe(png);
  });

  it('returns truncated input untouched rather than guessing', () => {
    const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00]);
    expect(stripJpegAppSegments(truncated)).toBe(truncated);
  });
});

describe('savingsPercent', () => {
  it('reports the reduction', () => {
    expect(savingsPercent(1000, 750)).toBe(25);
    expect(savingsPercent(1000, 1000)).toBe(0);
    expect(savingsPercent(0, 0)).toBe(0);
    expect(savingsPercent(100, 120)).toBe(0);
  });
});

describe('voice policy', () => {
  const ok = { bytes: 40_000, durationMs: 20_000, contentType: 'audio/webm;codecs=opus' };

  it('accepts an ordinary clip on every tier', () => {
    for (const tier of ['free', 'starter', 'pro', 'enterprise'] as const) {
      expect(validateVoiceUpload({ ...ok, tier }).ok).toBe(true);
    }
  });

  it('is strictly more lenient as the tier rises', () => {
    const tiers = ['free', 'starter', 'pro', 'enterprise'] as const;
    for (let i = 1; i < tiers.length; i++) {
      const lower = VOICE_LIMITS[tiers[i - 1]];
      const higher = VOICE_LIMITS[tiers[i]];
      expect(higher.maxBytes).toBeGreaterThan(lower.maxBytes);
      expect(higher.maxDurationMs).toBeGreaterThan(lower.maxDurationMs);
      expect(higher.bitrate).toBeGreaterThanOrEqual(lower.bitrate);
    }
  });

  it('rejects a clip longer than the tier allows', () => {
    const r = validateVoiceUpload({ ...ok, durationMs: 61_000, tier: 'free' });
    expect(r).toMatchObject({ ok: false, reason: 'too-long' });
  });

  it('lets a paid tier record what free cannot', () => {
    expect(validateVoiceUpload({ ...ok, durationMs: 150_000, tier: 'free' }).ok).toBe(false);
    expect(
      validateVoiceUpload({ bytes: 400_000, durationMs: 150_000, contentType: 'audio/webm', tier: 'starter' }).ok,
    ).toBe(true);
  });

  it('rejects an oversized clip even inside the duration cap', () => {
    const r = validateVoiceUpload({ bytes: 900_000, durationMs: 30_000, contentType: 'audio/webm', tier: 'free' });
    expect(r).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('catches an implausible bitrate — a large object with a small claimed duration', () => {
    // Inside the byte cap, inside the duration cap, but ~10x the bitrate asked for.
    const r = validateVoiceUpload({
      bytes: 250_000,
      durationMs: 8_000,
      contentType: 'audio/webm',
      tier: 'free',
    });
    expect(r).toMatchObject({ ok: false, reason: 'implausible-bitrate' });
  });

  it('does not hold very short clips to a bitrate', () => {
    expect(
      validateVoiceUpload({ bytes: 20_000, durationMs: 1_200, contentType: 'audio/webm', tier: 'free' }).ok,
    ).toBe(true);
  });

  it('rejects a non-audio content type', () => {
    expect(
      validateVoiceUpload({ ...ok, contentType: 'image/png', tier: 'pro' }),
    ).toMatchObject({ ok: false, reason: 'unsupported-type' });
  });

  it('rejects empty input', () => {
    expect(validateVoiceUpload({ ...ok, bytes: 0, tier: 'pro' })).toMatchObject({
      ok: false,
      reason: 'empty',
    });
    expect(validateVoiceUpload({ ...ok, durationMs: 0, tier: 'pro' })).toMatchObject({
      ok: false,
      reason: 'empty',
    });
  });

  it('gives every tier byte headroom over its own bitrate budget', () => {
    // Otherwise an honest recorder at the tier's own settings would be rejected
    // at full length — the bug this assertion exists to prevent.
    for (const [tier, l] of Object.entries(VOICE_LIMITS)) {
      const needed = expectedBytes(l.maxDurationMs, l.bitrate);
      expect({ tier, headroom: l.maxBytes > needed * 1.2 }).toEqual({ tier, headroom: true });
    }
  });

  it('exposes an absolute ceiling matching the most generous tier', () => {
    expect(VOICE_ABSOLUTE_MAX_BYTES).toBe(VOICE_LIMITS.enterprise.maxBytes);
  });

  it('falls back to free limits for an unknown tier', () => {
    expect(limitsFor('nonsense' as never)).toEqual(VOICE_LIMITS.free);
  });
});
