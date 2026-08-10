import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { ensureSessionBlurbs, isAITextConfigured } from '@/lib/pf2ecal/blurb.server';
import { blurbRequestSchema } from '@/lib/pf2ecal/types';

/**
 * POST /api/pf2ecal/sessions/blurbs — descriptions for the sessions on screen.
 *
 * POST rather than GET because the request is a list of ids and it may generate:
 * this is not a cacheable read, and a URL with six ids in the query string would
 * be cached as one by anything in front of it.
 *
 * `auth: 'optional'` for the same reason as `/ask`: the descriptions summarise a
 * board that anyone with the link can already read, so an account would gate
 * nothing. And `rateLimit: 'ai'` for the same reason too — this is the second
 * endpoint on the page that spends money upstream, so it sits in the tightest
 * bucket the site has, keyed per IP.
 *
 * ## It always returns 200
 *
 * Every failure below is partial by construction. No API key, DeepSeek down, a
 * model that never produced valid JSON across its retries — each ends as an id
 * missing from the response, not as an error. The client renders the notes the
 * person typed instead, which is what it was already doing before this existed,
 * so a decorative feature can never take the schedule down with it. `configured`
 * is the one signal that comes back, and it exists so the client can stop asking
 * rather than retry a key that is not there.
 */
export const Route = createFileRoute('/api/pf2ecal/sessions/blurbs')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', rateLimit: 'ai', body: blurbRequestSchema },
        async ({ body }) => {
          if (!isAITextConfigured()) {
            return Response.json({ blurbs: {}, configured: false });
          }

          // `ensureSessionBlurbs` already swallows a per-session failure; this
          // catches the rest (a database blip on the read) so the shape the
          // client gets is the same either way.
          const blurbs = await ensureSessionBlurbs(body.ids).catch((cause: unknown) => {
            console.error('[pf2ecal] blurb generation failed:', cause);
            return {};
          });

          return Response.json({ blurbs, configured: true });
        },
      ),
    },
  },
});
