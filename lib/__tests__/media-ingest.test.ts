import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

/**
 * ─────────── the one media ingest pipeline (C10) ───────────
 *
 * `lib/media/ingest.server.ts` composes what already existed — magic-byte
 * validation, the tier quota, the sharp re-encode, the key builders,
 * `putObject` — behind one call with a per-surface policy. The tests here are
 * the properties that surfaces disagreed about while each one composed those
 * pieces itself.
 *
 * The load-bearing one is metadata. A photo posted with its GPS EXIF intact is
 * a privacy leak that no profile privacy setting compensates for, and before
 * this module stripping was a SIDE EFFECT of choosing WebP for size — nothing
 * declared it and nothing tested it, so a route that stored an original for
 * quality reasons would have reintroduced it silently.
 */

const { putObject, mediaCreate } = vi.hoisted(() => ({
  putObject: vi.fn(async () => {}),
  mediaCreate: vi.fn(async () => ({})),
}));

vi.mock('@/lib/storage/s3.server', () => ({ putObject }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { media: { create: mediaCreate } } }));
// The CDN base decides between a CDN URL and the Node proxy path; pinning it
// off keeps the asserted URLs stable regardless of the developer's env.
vi.mock('@/lib/storage/asset', () => ({ CDN_BASE: '' }));

import {
  ingest,
  IngestError,
  POLICIES,
  sniffImageType,
  stripMetadata,
  type MediaSurface,
} from '@/lib/media/ingest.server';

const USER = 'user_1';

/** A real, decodable JPEG carrying an EXIF block with a GPS IFD pointer. */
async function jpegWithExif(): Promise<Buffer> {
  const plain = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#4488cc' },
  })
    .jpeg()
    .toBuffer();

  // Splice an APP1/Exif segment in right after SOI. The payload only has to be
  // structurally a segment — the point of the test is that the SEGMENT is gone,
  // not that a particular tag was parsed.
  const payload = Buffer.concat([
    Buffer.from('Exif\0\0', 'ascii'),
    Buffer.alloc(2048, 0x41), // stand-in for the TIFF/GPS IFD
  ]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([plain.subarray(0, 2), header, payload, plain.subarray(2)]);
}

async function pngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 4, background: '#fff' } })
    .png()
    .toBuffer();
}

function fileFrom(buffer: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buffer)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('policy declares what happens to metadata — it is never inherited', () => {
  it('never lets a surface store bytes that neither path cleaned', () => {
    // The two mechanisms are a sharp re-encode (implied by `variants`) and an
    // explicit `strip`. A policy with neither would store camera output whole.
    for (const [surface, policy] of Object.entries(POLICIES)) {
      // Asserted against the real union rather than `!== 'none'`: `strip` is
      // typed `'all' | 'gps'`, so the old comparison could never be false and
      // the test passed without checking anything. This still fails if someone
      // widens the union to add a no-op mode.
      const covered = policy.variants.length > 0 || ['all', 'gps'].includes(policy.strip);
      expect(covered, `${surface} stores original bytes with strip: 'none'`).toBe(true);
    }
  });

  it("names 'gps' as the weakest choice any surface makes", () => {
    for (const [surface, policy] of Object.entries(POLICIES)) {
      expect(['gps', 'all'], `${surface}`).toContain(policy.strip);
    }
  });

  it('accepts only formats the pipeline can actually strip', () => {
    // AVIF and HEIC are what a current phone camera exports and both carry GPS
    // EXIF; `compressForStorage` skips them entirely, so accepting one anywhere
    // would mean storing it unstripped.
    for (const [surface, policy] of Object.entries(POLICIES)) {
      expect(policy.mime, surface).not.toContain('image/avif');
      expect(policy.mime, surface).not.toContain('image/heic');
    }
  });
});

describe('stripMetadata', () => {
  it('removes a JPEG EXIF segment without touching the scan', async () => {
    const withExif = await jpegWithExif();
    expect(withExif.includes(Buffer.from('Exif\0\0', 'ascii'))).toBe(true);

    const out = await stripMetadata(withExif, 'image/jpeg', 'gps');
    expect(out.includes(Buffer.from('Exif\0\0', 'ascii'))).toBe(false);
    expect(out.length).toBeLessThan(withExif.length);
    // Lossless: the entropy-coded scan is byte-identical, so the image itself
    // is unchanged. A sharp round-trip here would have re-encoded it.
    const original = await sharp(withExif).raw().toBuffer();
    const stripped = await sharp(out).raw().toBuffer();
    expect(stripped.equals(original)).toBe(true);
  });

  it("returns the bytes untouched for 'none'", async () => {
    const withExif = await jpegWithExif();
    expect(await stripMetadata(withExif, 'image/jpeg', 'none')).toBe(withExif);
  });
});

describe('sniffImageType reads the bytes, not the declared type', () => {
  it('identifies the formats the policies accept', async () => {
    expect(sniffImageType(await pngBuffer())).toBe('image/png');
    expect(sniffImageType(await jpegWithExif())).toBe('image/jpeg');
  });

  it('names AVIF and HEIC so they can be refused by name', () => {
    const avif = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from('ftypavif', 'ascii'),
      Buffer.alloc(8),
    ]);
    const heic = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from('ftypheic', 'ascii'),
      Buffer.alloc(8),
    ]);
    expect(sniffImageType(avif)).toBe('image/avif');
    expect(sniffImageType(heic)).toBe('image/heic');
  });

  it('returns null for anything else', () => {
    expect(sniffImageType(Buffer.from('not an image at all'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('ingest', () => {
  it('stores a re-encoded WebP whose bytes carry no EXIF', async () => {
    const source = await jpegWithExif();
    const result = await ingest(fileFrom(source, 'holiday.jpg', 'image/jpeg'), 'post', {
      userId: USER,
    });

    expect(putObject).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = putObject.mock.calls[0] as unknown as [string, Buffer, string];
    expect(key.startsWith('rmharks/')).toBe(true);
    expect(contentType).toBe('image/webp');
    expect(body.includes(Buffer.from('Exif\0\0', 'ascii'))).toBe(false);
    expect(result.url).toContain(USER);
    expect(result.contentType).toBe('image/webp');
  });

  it('tags feed filenames with their pixel size and leaves avatars alone', async () => {
    await ingest(fileFrom(await pngBuffer(), 'a.png', 'image/png'), 'post', { userId: USER });
    const feedKey = (putObject.mock.calls[0] as unknown as [string])[0];
    // `-40x40` before the extension — what `parseImageDimensions` reads back so
    // the timeline can reserve layout space.
    expect(feedKey).toMatch(/-40x40\.webp$/);

    putObject.mockClear();
    await ingest(fileFrom(await pngBuffer(), 'a.png', 'image/png'), 'avatar', { userId: USER });
    const avatarKey = (putObject.mock.calls[0] as unknown as [string])[0];
    expect(avatarKey.startsWith('user-avatars/')).toBe(true);
    expect(avatarKey).not.toMatch(/-\d+x\d+\.webp$/);
  });

  it('refuses a file over the surface ceiling before decoding it', async () => {
    const huge = Buffer.alloc(POLICIES.post.maxBytes + 1);
    await expect(
      ingest(fileFrom(huge, 'big.png', 'image/png'), 'post', { userId: USER }),
    ).rejects.toBeInstanceOf(IngestError);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('refuses a format the policy does not accept, whatever the header claims', async () => {
    // A PNG announced as a JPEG is fine (the sniffer decides). A text file
    // announced as a PNG is not.
    const lie = fileFrom(Buffer.from('<?php echo 1; ?>'), 'x.png', 'image/png');
    await expect(ingest(lie, 'post', { userId: USER })).rejects.toBeInstanceOf(IngestError);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('refuses an animated GIF where the policy is stills only', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    await expect(
      ingest(fileFrom(gif, 'x.gif', 'image/gif'), 'avatar', { userId: USER }),
    ).rejects.toBeInstanceOf(IngestError);
    // …and accepts it on the feed, which does allow animation.
    await expect(
      ingest(fileFrom(gif, 'x.gif', 'image/gif'), 'post', { userId: USER }),
    ).resolves.toBeTruthy();
  });

  it('lets `reserve` refuse against the STORED size, before anything is written', async () => {
    const seen: number[] = [];
    await expect(
      ingest(fileFrom(await pngBuffer(), 'a.png', 'image/png'), 'avatar', {
        userId: USER,
        reserve: (bytes) => {
          seen.push(bytes);
          return 'Total avatar storage limit reached.';
        },
      }),
    ).rejects.toThrow('Total avatar storage limit reached.');

    expect(putObject).not.toHaveBeenCalled();
    // The encoded size, not the uploaded size — that is the number a storage
    // cap is actually about.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeGreaterThan(0);
  });

  it('does not create a Media row unless the caller asks for one', async () => {
    // A `Media` row is a claim ticket: created PENDING and swept — along with
    // the OBJECT — 24 hours later unless something attaches it. A URL-only
    // caller that got one silently would lose its images the next day.
    await ingest(fileFrom(await pngBuffer(), 'a.png', 'image/png'), 'post', { userId: USER });
    expect(mediaCreate).not.toHaveBeenCalled();

    const withRow = await ingest(fileFrom(await pngBuffer(), 'a.png', 'image/png'), 'post', {
      userId: USER,
      record: true,
    });
    expect(mediaCreate).toHaveBeenCalledTimes(1);
    expect(withRow.mediaId).toMatch(/^media_/);
    expect(withRow.expiresAt).toBeInstanceOf(Date);
  });

  it('writes every declared variant and returns the largest as the canonical one', async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();

    const result = await ingest(fileFrom(big, 'slide.png', 'image/png'), 'album', {
      userId: USER,
      entityId: 'album_1',
    });

    expect(putObject).toHaveBeenCalledTimes(POLICIES.album.variants.length);
    expect(result.variants).toHaveLength(POLICIES.album.variants.length);
    // Ascending, and the canonical one is the last.
    const widths = result.variants.map((v) => v.width);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    expect(result.width).toBe(widths[widths.length - 1]);
    expect(result.key).toBe(result.variants[result.variants.length - 1].key);
    for (const v of result.variants) expect(v.key.startsWith('albums/album_1/')).toBe(true);
  });

  it('refuses an album slide with no album id rather than writing to a shared prefix', async () => {
    await expect(
      ingest(fileFrom(await pngBuffer(), 'a.png', 'image/png'), 'album', { userId: USER }),
    ).rejects.toBeInstanceOf(IngestError);
  });

  it('covers every surface the design named', () => {
    const surfaces: MediaSurface[] = ['avatar', 'post', 'album', 'library', 'build', 'chat'];
    expect(Object.keys(POLICIES).sort()).toEqual([...surfaces].sort());
  });
});
