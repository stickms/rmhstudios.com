/**
 * The profile banner's shape, written once. Client-safe.
 *
 * Everything that draws or produces a banner reads these: the box on the
 * profile and in the editor (`components/profile/ProfileBanner.tsx`), the crop
 * frame (`ImageCropModal` via `useProfileAssets`), and the server's rendition
 * (`lib/profile/banner-image.server.ts`). One ratio in all four places is what
 * makes the framed picture the picture every viewer gets, at every width.
 *
 * 3:1 because that is what the upload endpoint has always resized towards
 * (1500x500), so banners stored before this constant existed already fit, and
 * because it is the height the profile column can afford: 119px of a 358px
 * phone column, 213px of the 640px desktop one.
 */
export const PROFILE_BANNER_ASPECT = 3;

/** The stored rendition: twice the widest column the banner is drawn in. */
export const PROFILE_BANNER_WIDTH = 1500;
export const PROFILE_BANNER_HEIGHT = PROFILE_BANNER_WIDTH / PROFILE_BANNER_ASPECT;

/** Per-image upload limit, for the crop and for the picture it was cut from. */
export const PROFILE_BANNER_MAX_MB = 8;

/**
 * Longest edge of the kept source picture (the uncropped upload the owner
 * re-crops from). Twice the rendition's width, so a crop that takes half the
 * picture still fills the rendition without upscaling.
 */
export const PROFILE_BANNER_SOURCE_MAX_EDGE = 3000;

export interface BannerRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The largest centred region of a `width`x`height` picture that has the banner
 * ratio, in whole pixels; null when the picture is too small to hold one. A
 * picture already at the ratio (what the cropper sends) comes back whole.
 */
export function bannerCoverRegion(
  width: number,
  height: number,
  aspect: number = PROFILE_BANNER_ASPECT,
): BannerRegion | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const w = Math.floor(width);
  const h = Math.floor(height);
  let regionW = w;
  let regionH = Math.round(w / aspect);
  if (regionH > h) {
    regionH = h;
    regionW = Math.round(h * aspect);
  }
  regionW = Math.min(regionW, w);
  if (regionW < 1 || regionH < 1) return null;
  return {
    left: Math.floor((w - regionW) / 2),
    top: Math.floor((h - regionH) / 2),
    width: regionW,
    height: regionH,
  };
}

/** The pixel size the rendition is encoded at for a region `regionWidth` wide: never enlarged. */
export function bannerRenditionSize(regionWidth: number): { width: number; height: number } {
  const width = Math.max(1, Math.min(PROFILE_BANNER_WIDTH, Math.floor(regionWidth)));
  return { width, height: Math.max(1, Math.round(width / PROFILE_BANNER_ASPECT)) };
}
