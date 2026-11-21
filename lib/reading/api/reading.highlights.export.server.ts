import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { exportHighlightsApi } from '@/lib/reading/highlights.contract';
import { highlightsExportBody } from '@/lib/reading/highlights-search-schema';
import { exportHighlights } from '@/lib/reading/highlights.server';
import {
  groupByDocument,
  toCsv,
  toJson,
  toMarkdown,
  type ExportFormat,
} from '@/lib/reading/highlights-export';

const FILES: Record<
  ExportFormat,
  {
    type: string;
    ext: string;
  }
> =
  {
    markdown:
      {
        type: 'text/markdown; charset=utf-8',
        ext: 'md',
      },
    csv: {
      type: 'text/csv; charset=utf-8',
      ext: 'csv',
    },
    json: {
      type: 'application/json; charset=utf-8',
      ext: 'json',
    },
  };

/**
 * POST /api/reading/highlights/export — the caller's highlights (everything the
 * filter matches, or just `ids` among them) as a Markdown, CSV or JSON download.
 * Session-only and limited to 3 a 10 minutes, like the account export; the
 * titles and links are resolved here, so the file is complete whatever the
 * client had loaded.
 */
export const route =
  apiRoute(
    '/api/reading/highlights/export',
    {
      POST: implement(
        exportHighlightsApi,
        {
          rateLimit:
            {
              limit: 3,
              windowMs: 600_000,
              prefix:
                'highlights-export',
              message:
                'You can export your highlights a few times per hour. Please wait.',
            },
          body: highlightsExportBody,
        },
        async ({
          userId,
          body,
        }) => {
          const rows =
            await exportHighlights(
              userId,
              body.filter,
              body.ids,
            );
          const file =
            FILES[
              body
                .format
            ];
          const text =
            body.format ===
            'markdown'
              ? toMarkdown(
                  groupByDocument(
                    rows,
                  ),
                  {
                    ...(body.locale
                      ? {
                          locale:
                            body.locale,
                        }
                      : {}),
                    ...(body.labels
                      ? {
                          labels:
                            body.labels,
                        }
                      : {}),
                  },
                )
              : body.format ===
                  'csv'
                ? toCsv(
                    rows,
                  )
                : toJson(
                    rows,
                  );
          const stamp =
            new Date()
              .toISOString()
              .slice(
                0,
                10,
              );
          return new Response(
            text,
            {
              headers:
                {
                  'Content-Type':
                    file.type,
                  'Content-Disposition': `attachment; filename="rmhstudios-highlights-${stamp}.${file.ext}"`,
                  'Cache-Control':
                    'private, no-store',
                  'X-Content-Type-Options':
                    'nosniff',
                },
            },
          );
        },
      ),
    },
  );
