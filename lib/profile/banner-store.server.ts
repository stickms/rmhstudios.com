/**
 * Where a profile banner lives in object storage. Two objects per banner:
 *
 *  - the rendition (`user-banners/<file>`), public, the 3:1 WebP every viewer
 *    is served and the one `UserProfile.bannerUrl` points at;
 *  - the source (`user-banner-sources/<derived>`), the uncropped upload the
 *    owner re-crops from. Only the owner reads it, through
 *    `GET /api/profile/banner-source`.
 *
 * The source's name is an HMAC of the rendition's file name under the server
 * secret rather than a second column. It has to be unguessable, because the
 * bucket sits behind the CDN and the rendition's name is in every profile
 * response: a source stored under the same name would hand the cropped-out
 * part of the picture to anyone who swapped the prefix. If the secret is
 * rotated the old sources can no longer be found, and "Adjust" falls back to
 * the rendition (see `readBannerSource`).
 */
import { createHmac } from 'node:crypto';
import { deleteObject, getObject } from '@/lib/storage/s3.server';
import { purgeFromCdn } from '@/lib/storage/cdn.server';
import { userBannerFilename, userBannerKey } from '@/lib/storage/keys';

export const USER_BANNER_SOURCE_PREFIX = 'user-banner-sources/';

/** The storage key of the source kept for the rendition `filename`; null when no server secret is set. */
export function bannerSourceKey(filename: string): string | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  const name = createHmac('sha256', secret).update(`banner-source:${filename}`).digest('hex');
  return `${USER_BANNER_SOURCE_PREFIX}${name}.webp`;
}

export interface StoredBannerSource {
  body: Buffer;
  contentType: string;
  /** `rendition` when no source was kept (a banner from before sources existed). */
  kind: 'source' | 'rendition';
}

/**
 * What the owner re-crops from: the kept source, or the rendition itself for a
 * banner that has none. Null when there is no banner or its object is gone.
 */
export async function readBannerSource(
  bannerUrl: string | null | undefined,
): Promise<StoredBannerSource | null> {
  if (!bannerUrl) return null;
  const filename = userBannerFilename(bannerUrl);
  if (!filename) return null;
  const sourceKey = bannerSourceKey(filename);
  if (sourceKey) {
    const source = await getObject(sourceKey).catch(() => null);
    if (source) return { ...source, kind: 'source' };
  }
  const rendition = await getObject(userBannerKey(filename)).catch(() => null);
  return rendition ? { ...rendition, kind: 'rendition' } : null;
}

/** Best-effort removal of a banner's rendition and source from storage and the CDN edge, by stored URL. */
export async function removeStoredBanner(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const filename = userBannerFilename(url);
  if (!filename) return;
  const key = userBannerKey(filename);
  const sourceKey = bannerSourceKey(filename);
  for (const k of sourceKey ? [key, sourceKey] : [key]) {
    try {
      await deleteObject(k);
    } catch {
      // Object may already be gone: non-fatal.
    }
  }
  // The source is never requested through the CDN, so only the rendition is purged.
  await purgeFromCdn(key);
}
