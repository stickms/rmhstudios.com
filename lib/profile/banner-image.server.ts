/**
 * Server-side normalisation of profile banner uploads. The client crops, but
 * its crop is a request, not a fact: whatever arrives is cut to the banner
 * ratio and size here, so a stored banner is always `PROFILE_BANNER_ASPECT`.
 */
import sharp from 'sharp';
import { optimizeImage } from '@/lib/image-optimize';
import {
  PROFILE_BANNER_SOURCE_MAX_EDGE,
  bannerCoverRegion,
  bannerRenditionSize,
} from '@/lib/profile/banner';

export interface EncodedBanner {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
}

/**
 * The banner every viewer is served: the centred banner-ratio region of
 * `input`, at most 1500x500, as WebP. Null when the picture cannot be read or
 * is too small to hold a region.
 */
export async function renderBannerRendition(input: Buffer): Promise<EncodedBanner | null> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return null;
  }
  const rawW = meta.width;
  const rawH = meta.pageHeight ?? meta.height;
  if (!rawW || !rawH) return null;
  // EXIF orientations 5-8 are the quarter turns: the picture is drawn with its axes swapped.
  const turned = (meta.orientation ?? 1) >= 5;
  const region = bannerCoverRegion(turned ? rawH : rawW, turned ? rawW : rawH);
  if (!region) return null;
  const size = bannerRenditionSize(region.width);
  const { data, info } = await sharp(input)
    .rotate()
    .extract(region)
    .resize(size.width, size.height, { fit: 'fill' })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, contentType: 'image/webp', width: info.width, height: info.height };
}

/**
 * The picture a banner was cut from, kept so the owner can re-crop it: the
 * whole upload, upright, bounded to `PROFILE_BANNER_SOURCE_MAX_EDGE`, as WebP.
 */
export async function encodeBannerSource(input: Buffer): Promise<EncodedBanner> {
  return optimizeImage(input, {
    width: PROFILE_BANNER_SOURCE_MAX_EDGE,
    height: PROFILE_BANNER_SOURCE_MAX_EDGE,
    format: 'webp',
    quality: 90,
    autoOrient: true,
  });
}
