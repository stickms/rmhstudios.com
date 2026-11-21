import { refineRankedPoll } from '@/lib/feed/ranked-poll-schema';
import { RANKED_MAX_OPTIONS } from '@/lib/feed/ranked-poll';
import { z } from 'zod';
import { MAX_GIF_ALT_LENGTH } from '@/lib/feed/gif-alt';
import { contentWarningFieldSchema } from '@/lib/feed/content-warning-schema';
import { isFeedImageUrl } from '@/lib/storage/keys';

import {
  MAX_RMHARK_LENGTH,
  MAX_RMHARK_IMAGES,
  MAX_IMAGE_ALT_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
} from '@/lib/rmhark-limits';
import { postsPlusComposeFields } from '@/lib/posts-plus/schema';
import { codeEmbedSchema } from '@/lib/code-embed/schema';

// Re-exported for the API routes. Client code imports `@/lib/rmhark-limits`
// directly — this module is zod.
export {
  MAX_RMHARK_LENGTH,
  MAX_RMHARK_IMAGES,
  MAX_IMAGE_ALT_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
};
// Accepts the local proxy path or the public CDN URL (see isFeedImageUrl).
export const feedImageUrlSchema =
  z
    .string()
    .refine(
      isFeedImageUrl,
      'Invalid image reference',
    );

const IMAGE_EXT_REGEX =
  /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

/** A GIF's description: plain text, capped like an image description; refused (not truncated) when too long. */
export const gifAltSchema =
  z
    .string()
    .max(
      MAX_GIF_ALT_LENGTH,
      `GIF description must be at most ${MAX_GIF_ALT_LENGTH} characters`,
    );

export const gifUrlSchema =
  z
    .string()
    .url(
      'Must be a valid URL',
    )
    .refine(
      (
        url,
      ) => {
        try {
          const parsed =
            new URL(
              url,
            );
          const host =
            parsed.hostname;
          if (
            host.endsWith(
              'tenor.com',
            ) ||
            host.endsWith(
              'giphy.com',
            )
          )
            return true;
          if (
            IMAGE_EXT_REGEX.test(
              parsed.pathname,
            )
          )
            return true;
          return false;
        } catch {
          return false;
        }
      },
      {
        message:
          'Must be a Tenor/Giphy link or a direct image URL',
      },
    );

const pollSchema =
  z.object(
    {
      question:
        z
          .string()
          .min(
            1,
            'Poll question cannot be empty',
          )
          .max(
            MAX_POLL_QUESTION_LENGTH,
            `Poll question must be at most ${MAX_POLL_QUESTION_LENGTH} characters`,
          ),
      options:
        z
          .array(
            z
              .string()
              .min(
                1,
                'Option cannot be empty',
              )
              .max(
                MAX_POLL_OPTION_LENGTH,
                `Option must be at most ${MAX_POLL_OPTION_LENGTH} characters`,
              ),
          )
          .min(
            MIN_POLL_OPTIONS,
            `Poll must have at least ${MIN_POLL_OPTIONS} options`,
          )
          // A ranked poll takes up to RANKED_MAX_OPTIONS; `refineRankedPoll` holds a plain poll to MAX_POLL_OPTIONS.
          .max(
            RANKED_MAX_OPTIONS,
            `Poll can have at most ${RANKED_MAX_OPTIONS} options`,
          ),
      multiSelect:
        z
          .boolean()
          .default(
            false,
          ),
      // s06-19: a ranked-choice poll (3-6 options, a required end, never multi-select; refined below).
      ranked:
        z
          .boolean()
          .default(
            false,
          ),
      // Optional scheduled close, in hours from now (max 30 days).
      durationHours:
        z
          .number()
          .int()
          .min(
            1,
          )
          .max(
            720,
          )
          .optional(),
    },
  )
  .superRefine(
    refineRankedPoll,
  );

export const createRMHarkSchema =
  z
    .object(
      {
        content:
          z
            .string()
            .max(
              MAX_RMHARK_LENGTH,
              `RMHark must be at most ${MAX_RMHARK_LENGTH} characters`,
            )
            .optional()
            .default(
              '',
            ),
        poll: pollSchema.optional(),
        gifUrl:
          gifUrlSchema.optional(),
        // Description of the GIF (sprint 06 #15); cleaned and capped server-side by `normalizeGifAlt`.
        gifAlt:
          gifAltSchema.optional(),
        imageUrls:
          z
            .array(
              feedImageUrlSchema,
            )
            .max(
              MAX_RMHARK_IMAGES,
              `At most ${MAX_RMHARK_IMAGES} images allowed`,
            )
            .optional(),
        // Per-image alt text, aligned by index with imageUrls. Optional and may be
        // shorter than imageUrls; entries are trimmed and capped server-side.
        imageAlts:
          z
            .array(
              z
                .string()
                .max(
                  MAX_IMAGE_ALT_LENGTH,
                  `Alt text must be at most ${MAX_IMAGE_ALT_LENGTH} characters`,
                ),
            )
            .max(
              MAX_RMHARK_IMAGES,
            )
            .optional(),
        // Quote-repost: id of the post being quoted.
        originalId:
          z
            .string()
            .max(
              64,
            )
            .optional(),
        // Audience visibility.
        audience:
          z
            .enum(
              [
                'PUBLIC',
                'FOLLOWERS',
                'PRIVATE',
                'CIRCLE',
              ],
            )
            .optional(),
        // Content warning: hide media/text behind a click-to-reveal overlay.
        isSensitive:
          z
            .boolean()
            .optional(),
        // Why the post is warned (sprint 06 #16): implies `isSensitive` and also covers the text.
        contentWarning:
          contentWarningFieldSchema,
        // Who is allowed to reply.
        replyControl:
          z
            .enum(
              [
                'EVERYONE',
                'FOLLOWING',
                'MENTIONED',
              ],
            )
            .optional(),
        // Paid post: coins required to unlock (0/undefined = free).
        unlockPrice:
          z
            .number()
            .int()
            .min(
              0,
            )
            .max(
              1_000_000,
            )
            .optional(),
        // Optional community to post into (viewer must be a member).
        communityId:
          z
            .string()
            .max(
              64,
            )
            .optional(),
        // Take meter (X6): readers vote agree/disagree; the split shows after voting.
        isTake:
          z
            .boolean()
            .optional(),
        // P23 F14: a runnable HTML/CSS/JS snippet shown click-to-run in a sandboxed iframe.
        codeEmbed:
          codeEmbedSchema.optional(),
        // RMH Vibes: a vibe page pinned to one of its versions, shown click-to-run on the post.
        // The server resolves the page by slug; the client never sends a page id.
        vibe: z
          .object(
            {
              slug: z
                .string()
                .max(
                  64,
                ),
              versionId:
                z
                  .string()
                  .max(
                    40,
                  ),
            },
          )
          .optional(),
        // P06 communities-plus: flair (N1) and challenge entry (N5); community posts only.
        flairId:
          z
            .string()
            .max(
              64,
            )
            .optional(),
        challengeId:
          z
            .string()
            .max(
              64,
            )
            .optional(),
        // posts-plus: X8 expiry (ttl), X5 series, X4 question-of-the-day answer.
        ...postsPlusComposeFields,
      },
    )
    .refine(
      (
        data,
      ) =>
        data.content.trim()
          .length >
          0 ||
        data.poll ||
        data.gifUrl ||
        (data
          .imageUrls
          ?.length ??
          0) >
          0 ||
        !!data.codeEmbed ||
        !!data.vibe ||
        !!data.originalId,
      {
        message:
          'Post must have text, a poll, an image/GIF, or be a quote',
      },
    )
    .refine(
      (
        data,
      ) =>
        (data
          .imageAlts
          ?.length ??
          0) <=
        (data
          .imageUrls
          ?.length ??
          0),
      {
        message:
          'Cannot provide more alt-text entries than images',
        path: [
          'imageAlts',
        ],
      },
    );

export const editRMHarkSchema =
  z.object(
    {
      content:
        z
          .string()
          .max(
            MAX_RMHARK_LENGTH,
            `RMHark must be at most ${MAX_RMHARK_LENGTH} characters`,
          )
          .optional()
          .default(
            '',
          ),
      // null clears an existing GIF; undefined leaves it unchanged.
      gifUrl:
        gifUrlSchema.nullish(),
      // null clears the description; undefined leaves it (or, with a new gifUrl, starts it empty).
      gifAlt:
        gifAltSchema.nullish(),
      // The content warning (sprint 06 #16): a reason implies the warning, `isSensitive: false` clears both,
      // undefined leaves it unchanged.
      isSensitive:
        z
          .boolean()
          .optional(),
      contentWarning:
        contentWarningFieldSchema,
    },
  );

export const createCommentSchema =
  z.object(
    {
      content:
        z
          .string()
          .min(
            1,
            'Comment cannot be empty',
          )
          .max(
            MAX_COMMENT_LENGTH,
            `Comment must be at most ${MAX_COMMENT_LENGTH} characters`,
          ),
      parentId:
        z
          .string()
          .optional(),
      // S1: set when the author chose to post after the "reconsider" prompt.
      confirmReconsider:
        z
          .boolean()
          .optional(),
    },
  );

export type CreateRMHarkInput =
  z.infer<
    typeof createRMHarkSchema
  >;
export type CreateCommentInput =
  z.infer<
    typeof createCommentSchema
  >;
export type PollInput =
  z.infer<
    typeof pollSchema
  >;
