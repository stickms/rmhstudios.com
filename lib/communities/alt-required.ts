/**
 * Communities that require image descriptions (s07-16), pure part.
 *
 * `Community.requireImageAlt` is read through the cached `CommunitySettings`; the gate runs `communityAltMissing`
 * (the same `missingAltIndexes` as the member rule) on every path in `COMMUNITY_ALT_WRITE_PATHS`. A GIF counts like an
 * image (as in the member rule, sprint 06 15): an undescribed one is refused. Text-only posts never trip it.
 */
import { missingAltIndexes } from '@/lib/feed/alt-text';
import { gifMissingAlt } from '@/lib/feed/gif-alt';

export const ALT_REQUIRED_CODE =
  'ALT_REQUIRED';
export const ALT_REQUIRED_MESSAGE =
  'This community needs a description on every image. Add one to each image and try again.';

/** Indexes of images that break the rule; empty when the community does not require descriptions. */
export function communityAltMissing(
  requireImageAlt: boolean,
  imageUrls:
    | readonly string[]
    | undefined,
  imageAlts:
    | readonly string[]
    | undefined,
): number[] {
  if (
    !requireImageAlt ||
    !imageUrls?.length
  )
    return [];
  return missingAltIndexes(
    imageUrls,
    imageAlts,
  );
}

/** True when a requiring community refuses this GIF: attached with no (or a blank) description. */
export function communityGifAltMissing(
  requireImageAlt: boolean,
  gifUrl: string | null | undefined,
  gifAlt: string | null | undefined,
): boolean {
  return requireImageAlt && gifMissingAlt(gifUrl, gifAlt);
}

/** True when `alts` clears a description that `before` had (the rule's "no removing a description" half). */
export function clearsDescription(
  before:
    | readonly string[]
    | undefined,
  after:
    | readonly string[]
    | undefined,
): boolean {
  return (
    before ??
    []
  ).some(
    (
      a,
      i,
    ) =>
      !!a?.trim() &&
      !after?.[
        i
      ]?.trim(),
  );
}

/**
 * Every server path that can put an image into a community, or take a description off one there. Each one runs the
 * rule; `community-alt-write-paths.test.ts` scans these sources for it. Feature 11 adds the v1 create's own entry.
 */
export const COMMUNITY_ALT_WRITE_PATHS: readonly string[] =
  [
    // create
    'lib/feed/api/rmharks.server.ts',
    // create through the developer API (POST /api/v1/posts with a communityId)
    'lib/api/v1/communities.server.ts',
    // scheduled create
    'lib/scheduled/api/scheduled.server.ts',
    // scheduled publish (refused with a notice, the draft stays)
    'lib/scheduled/publish.server.ts',
    // post edit
    'lib/feed/api/rmharks.$id.server.ts',
    // description edit (clearing a description is refused)
    'lib/feed/alt-text-edit.server.ts',
  ];
