import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { verifyProfileLink } from '@/lib/profile-links/verify.server';
import { toProfileLinkDTO } from '@/lib/profile-links/links.server';

/**
 * POST /api/profile-links/$id/verify — run the `rel="me"` check for one link.
 *
 * **The rate limit is the security control here**, not politeness. Pressing this
 * button makes the server fetch a URL the caller chose: it is an SSRF surface
 * (closed by `safeFetch`) and a request-amplification surface (closed by this
 * bucket) at the same time. 6 per hour per user+IP is enough to set up five
 * links and retry a typo, and far too few to point the site at anything.
 */
export const Route = createFileRoute('/api/profile-links/$id/verify')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 6,
            windowMs: 60 * 60_000,
            prefix: 'profile-link-verify',
            scope: 'user',
            message: 'Too many verification attempts. Try again later.',
          },
        },
        async ({ userId, params }) => {
          const result = await verifyProfileLink(userId, params.id);
          if (!result) return notFound('Link not found');
          return Response.json({
            outcome: result.outcome,
            link: toProfileLinkDTO(result.link),
          });
        },
      ),
    },
  },
});
