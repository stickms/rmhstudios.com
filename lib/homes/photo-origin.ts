/**
 * Where a community listing's photos may come from (s11 18), the pure half. A community listing names its author's
 * own photos on this site only: a feed-space upload or a generated photo whose file name starts with the author's id
 * (`ownsFeedImageUrl`). Any other address would make every viewer's browser fetch from a stranger's server, and
 * another member's upload would let the listing outlive, or be erased with, a picture that is not its author's.
 * Both write routes and the listing form run this same check. Client-safe: no server imports.
 */
import { refusalBody } from '@/lib/errors/codes';
import { ownsFeedImageUrl } from '@/lib/storage/keys';

/** The entries of `images` that are not a site photo of `authorId`, in order (a repeated address repeats). */
export function foreignListingPhotos(images: readonly string[], authorId: string): string[] {
  return images.filter((url) => typeof url !== 'string' || !ownsFeedImageUrl(url, authorId));
}

/** Positions in `images` of the photos that fail the check (for marking a tile in the form). */
export function foreignListingPhotoIndexes(images: readonly string[], authorId: string): number[] {
  const out: number[] = [];
  images.forEach((url, i) => {
    if (typeof url !== 'string' || !ownsFeedImageUrl(url, authorId)) out.push(i);
  });
  return out;
}

/** The refusal body when any photo is foreign, or `null` when every one is the author's own site photo. */
export function listingPhotoOriginRefusal(
  images: readonly string[],
  authorId: string,
): ReturnType<typeof refusalBody> | null {
  const foreign = foreignListingPhotos(images, authorId);
  return foreign.length > 0 ? refusalBody('LISTING_PHOTO_NOT_SITE', { count: foreign.length }) : null;
}
