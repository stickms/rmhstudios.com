/**
 * The profile banner has one ratio, written once (`lib/profile/banner.ts`).
 *
 * Two shipped bugs are pinned here. The profile drew the banner in a fixed-height strip, so the
 * part of the picture on show changed with the column's width; and the editor previewed it in two
 * other boxes of two other heights. Now the profile, the editor's field and the editor's preview
 * draw one component at the constant's ratio, the cropper frames at it, and the server cuts every
 * upload to it, so what the owner frames is what every viewer sees.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  PROFILE_BANNER_ASPECT,
  PROFILE_BANNER_HEIGHT,
  PROFILE_BANNER_WIDTH,
  bannerCoverRegion,
  bannerRenditionSize,
} from '@/lib/profile/banner';
import { encodeBannerSource, renderBannerRendition } from '@/lib/profile/banner-image.server';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } })
    .png()
    .toBuffer();

describe('profile banner ratio', () => {
  it('is one constant, and the stored size follows from it', () => {
    expect(PROFILE_BANNER_WIDTH / PROFILE_BANNER_HEIGHT).toBe(PROFILE_BANNER_ASPECT);
    expect(Number.isInteger(PROFILE_BANNER_HEIGHT)).toBe(true);
  });

  it('the banner box takes its shape from the constant and from nothing else', () => {
    const box = read('components/profile/ProfileBanner.tsx');
    expect(box).toMatch(/aspectRatio:\s*PROFILE_BANNER_ASPECT/);
    // A height or a max-* clamp beside the ratio would bring the width-dependent crop back.
    expect(box).not.toMatch(/\b(?:h|max-h|min-h|max-w)-(?!full)[\w[\]/.-]+/);
    expect(box).not.toMatch(/block-size|blockSize|(?:max|min)?-?height\s*:|[hH]eight:/);
  });

  it('the profile, the cover field and the preview all draw that box', () => {
    for (const file of [
      'components/profile/ProfileHero.tsx',
      'components/feed/profile-edit/CoverField.tsx',
      'components/feed/profile-edit/EditorPreview.tsx',
    ]) {
      expect(read(file), file).toMatch(/<ProfileBanner\b/);
    }
    // The stylesheet places the banner; it does not size it.
    const css = read('components/profile/profile.css');
    const rule = /\.profile-head__banner\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).not.toMatch(/block-size|height|aspect-ratio|background-size/);
  });

  it('the cropper frames the banner at the constant and fills the frame', () => {
    const modal = read('components/feed/ProfileEditModal.tsx');
    const banner = /<ImageCropModal(?:(?!\/>)[\s\S])*bannerCrop(?:(?!\/>)[\s\S])*\/>/.exec(
      modal,
    )?.[0];
    expect(banner).toBeDefined();
    expect(banner).toMatch(/aspect=\{PROFILE_BANNER_ASPECT\}/);
    expect(banner).toMatch(/cropShape="rect"/);
    expect(banner).toMatch(/\bcover\b/);
  });
});

describe('bannerCoverRegion', () => {
  it('returns a picture already at the ratio whole', () => {
    expect(bannerCoverRegion(1500, 500)).toEqual({ left: 0, top: 0, width: 1500, height: 500 });
  });
  it('takes the centred band of a taller picture', () => {
    expect(bannerCoverRegion(1200, 1200)).toEqual({ left: 0, top: 400, width: 1200, height: 400 });
  });
  it('takes the centred column of a wider picture', () => {
    expect(bannerCoverRegion(4000, 500)).toEqual({ left: 1250, top: 0, width: 1500, height: 500 });
  });
  it('never leaves the picture, whatever its size', () => {
    for (const [w, h] of [
      [1, 1],
      [2, 1],
      [3, 1],
      [7, 5],
      [1499, 501],
      [10, 4000],
    ] as const) {
      const r = bannerCoverRegion(w, h);
      if (!r) continue;
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(w);
      expect(r.top + r.height).toBeLessThanOrEqual(h);
    }
    expect(bannerCoverRegion(1, 1)).toBeNull();
    expect(bannerCoverRegion(0, 10)).toBeNull();
  });
  it('the rendition is capped at the stored size and never enlarged', () => {
    expect(bannerRenditionSize(6000)).toEqual({ width: 1500, height: 500 });
    expect(bannerRenditionSize(900)).toEqual({ width: 900, height: 300 });
  });
});

describe('server normalisation', () => {
  it('cuts an upload of any shape to the banner ratio', async () => {
    for (const [w, h] of [
      [1500, 500],
      [1000, 1000],
      [4000, 600],
      [640, 480],
    ] as const) {
      const out = await renderBannerRendition(await solid(w, h));
      expect(out, `${w}x${h}`).not.toBeNull();
      expect(out!.contentType).toBe('image/webp');
      expect(out!.width).toBeLessThanOrEqual(PROFILE_BANNER_WIDTH);
      expect(Math.abs(out!.width / out!.height - PROFILE_BANNER_ASPECT)).toBeLessThan(0.01);
      const meta = await sharp(out!.buffer).metadata();
      expect([meta.width, meta.height]).toEqual([out!.width, out!.height]);
    }
  });

  it('measures a phone photo the way it is displayed (EXIF quarter turn)', async () => {
    // Stored 600x1800 with orientation 6: displayed 1800x600, already the banner ratio.
    const turned = await sharp(await solid(600, 1800))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await renderBannerRendition(turned);
    expect([out?.width, out?.height]).toEqual([1500, 500]);
  });

  it('refuses what is not a picture', async () => {
    expect(await renderBannerRendition(Buffer.from('not an image'))).toBeNull();
  });

  it('keeps the source whole, bounded on its longest edge', async () => {
    const out = await encodeBannerSource(await solid(4000, 1000));
    expect([out.width, out.height]).toEqual([3000, 750]);
    expect(out.contentType).toBe('image/webp');
  });
});
