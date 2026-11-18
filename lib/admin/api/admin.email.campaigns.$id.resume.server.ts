import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailResume } from '@/lib/admin/email.contract';
import { resumeCampaign } from '@/lib/email/campaign.server';

/** POST /api/admin/email/campaigns/$id/resume — restart a send that stopped making progress. */
export const route =
  apiRoute(
    '/api/admin/email/campaigns/$id/resume',
    {
      POST: implement(
        adminEmailResume,
        {
          auth: 'admin',
          rateLimit:
            'write',
        },
        async ({
          userId,
          params,
        }) => {
          const result =
            await resumeCampaign(
              userId,
              params.id,
            );
          if (
            result ===
            'not-found'
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          if (
            result ===
            'not-sending'
          ) {
            return Response.json(
              {
                error:
                  'This email has finished sending',
              },
              {
                status: 409,
              },
            );
          }
          if (
            result ===
            'busy'
          ) {
            return Response.json(
              {
                error:
                  'This email is still sending',
              },
              {
                status: 409,
              },
            );
          }
          return {
            ok: true as const,
          };
        },
      ),
    },
  );
