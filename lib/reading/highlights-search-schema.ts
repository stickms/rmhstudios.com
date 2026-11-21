/** Query and body schemas for the highlights notebook (search and export). Client-safe types come from these by `import type`. */

import { z } from 'zod';
import { READING_DOC_KINDS } from './schema';
import { EXPORT_FORMATS } from './highlights-export';

export const HIGHLIGHT_SORTS =
  [
    'newest',
    'oldest',
    'document',
  ] as const;
export type HighlightSort =
  (typeof HIGHLIGHT_SORTS)[number];

const SEARCH_MAX = 200;

/** `GET /api/reading/highlights/search` query string. `hasNote` is only ever sent as `true`. */
export const highlightsSearchQuery =
  z.object(
    {
      q: z
        .string()
        .trim()
        .max(
          SEARCH_MAX,
        )
        .optional(),
      kind: z
        .enum(
          READING_DOC_KINDS,
        )
        .optional(),
      hasNote:
        z
          .literal(
            'true',
          )
          .optional(),
      visibility:
        z
          .enum(
            [
              'public',
              'private',
            ],
          )
          .optional(),
      sort: z
        .enum(
          HIGHLIGHT_SORTS,
        )
        .optional(),
      cursor:
        z
          .string()
          .max(
            64,
          )
          .optional(),
    },
  );

/** The filter as the server uses it (and as the export body carries it). */
export const highlightsFilter =
  z.object(
    {
      q: z
        .string()
        .trim()
        .max(
          SEARCH_MAX,
        )
        .optional(),
      kind: z
        .enum(
          READING_DOC_KINDS,
        )
        .optional(),
      hasNote:
        z
          .boolean()
          .optional(),
      visibility:
        z
          .enum(
            [
              'public',
              'private',
            ],
          )
          .optional(),
      sort: z
        .enum(
          HIGHLIGHT_SORTS,
        )
        .optional(),
    },
  );
export type HighlightsFilter =
  z.infer<
    typeof highlightsFilter
  >;

export const highlightsExportBody =
  z.object(
    {
      format:
        z.enum(
          EXPORT_FORMATS,
        ),
      filter:
        highlightsFilter,
      /** Export only these highlights (those of the filter that the caller owns). */
      ids: z
        .array(
          z
            .string()
            .min(
              1,
            )
            .max(
              64,
            ),
        )
        .max(
          10_000,
        )
        .optional(),
      /** BCP 47 tag for the dates. */
      locale:
        z
          .string()
          .regex(
            /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/,
          )
          .max(
            35,
          )
          .optional(),
      /** Translated Markdown labels (the server has no catalogs of its own). */
      labels:
        z
          .object(
            {
              heading:
                z
                  .string()
                  .trim()
                  .min(
                    1,
                  )
                  .max(
                    80,
                  ),
              note: z
                .string()
                .trim()
                .min(
                  1,
                )
                .max(
                  40,
                ),
              added:
                z
                  .string()
                  .trim()
                  .min(
                    1,
                  )
                  .max(
                    40,
                  ),
            },
          )
          .optional(),
    },
  );
