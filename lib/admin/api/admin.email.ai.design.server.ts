import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  adminEmailAiDesign,
  adminEmailDesignModels,
} from '@/lib/admin/email.contract';
import { aiDesignBodySchema } from '@/lib/email/campaign-schema';
import {
  designEmail,
  designModels,
} from '@/lib/email/ai.server';

/**
 * GET  /api/admin/email/ai/design — which designers are configured.
 * POST /api/admin/email/ai/design — design the email with DeepSeek or Kimi,
 *      from the draft and the brand kit. Returns structure, never HTML.
 */
export const route =
  apiRoute(
    '/api/admin/email/ai/design',
    {
      GET: implement(
        adminEmailDesignModels,
        {
          auth: 'admin',
        },
        async () =>
          designModels(),
      ),
      POST: implement(
        adminEmailAiDesign,
        {
          auth: 'admin',
          rateLimit:
            {
              limit: 10,
              windowMs: 60_000,
              scope:
                'user',
              prefix:
                'admin-email-ai-design',
            },
          body: aiDesignBodySchema,
        },
        async ({
          body,
        }) => {
          if (
            !designModels()[
              body
                .model
            ]
          ) {
            const name =
              body.model ===
              'kimi'
                ? 'Kimi'
                : 'DeepSeek';
            return Response.json(
              {
                error: `${name} is not configured.`,
              },
              {
                status: 503,
              },
            );
          }
          const design =
            await designEmail(
              body,
            );
          if (
            !design
          ) {
            return Response.json(
              {
                error:
                  'The design came back unusable. Try again.',
              },
              {
                status: 502,
              },
            );
          }
          return {
            design,
          };
        },
      ),
    },
  );
