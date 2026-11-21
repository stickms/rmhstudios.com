/**
 * Zod pieces for message image descriptions. Imported by routes and schemas
 * only; the client reaches the types through the contracts.
 */
import { z } from 'zod';
import { MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-limits';
import { MAX_GIF_ALT_LENGTH } from '@/lib/feed/gif-alt';
import { imageAltsAligned } from '@/lib/messages/image-alts';

/** One description per image, each at most 1,000 characters; at most one per possible image. */
export const messageImageAltsField =
  z
    .array(
      z
        .string()
        .max(
          MAX_IMAGE_ALT_LENGTH,
          `A description must be at most ${MAX_IMAGE_ALT_LENGTH} characters`,
        ),
    )
    .max(
      4,
    )
    .optional();

/** The description of a message's GIF (sprint 06 #15): plain text, refused (not truncated) past the image limit. */
export const messageGifAltField =
  z
    .string()
    .max(
      MAX_GIF_ALT_LENGTH,
      `A description must be at most ${MAX_GIF_ALT_LENGTH} characters`,
    )
    .optional();

/** Refinement for any body that carries both lists: the lengths must match. */
export function altsMatchImages(d: {
  imageUrls?:
    | string[]
    | undefined;
  imageAlts?:
    | string[]
    | undefined;
}): boolean {
  return imageAltsAligned(
    d.imageUrls,
    d.imageAlts,
  );
}

export const ALTS_MISMATCH_ISSUE: {
  message: string;
  path: string[];
} =
  {
    message:
      'Provide exactly one description per image',
    path: [
      'imageAlts',
    ],
  };

/** PATCH a sent message's descriptions. */
export const editMessageAltsBody =
  z.object(
    {
      messageId:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          ),
      imageAlts:
        z
          .array(
            z
              .string()
              .max(
                MAX_IMAGE_ALT_LENGTH,
              ),
          )
          .min(
            1,
          )
          .max(
            4,
          ),
    },
  );
