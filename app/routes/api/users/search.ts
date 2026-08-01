import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { searchPeople } from '@/lib/search/people.server';

const TAKE = 5;

/**
 * GET /api/users/search?q=… — the people typeahead behind @mentions, DM
 * recipient pickers and invite fields.
 *
 * Delegates to the shared people search so the typeahead and the full search
 * page can never disagree about who matches — in particular, both now find a
 * user by the display name the site actually renders for them
 * (`user_profile.displayName`), not just the OAuth `user.name` behind it.
 */
export const Route = createFileRoute('/api/users/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        // This is a typeahead endpoint — it fires on (debounced) keystrokes, so
        // the limit is deliberately generous. checkRateLimit applies the global
        // ×RATE_LIMIT_MULTIPLIER (default 4), so a base of 60 → ~240 req/min per
        // IP before throttling, comfortably above fast typing. On the rare
        // throttle we soft-fail with an empty list so the input never errors.
        const { allowed } = await checkRateLimit(ip, {
          limit: 60,
          windowMs: 60_000,
          prefix: 'users-search',
        });
        if (!allowed) return Response.json({ users: [] });

        const q = new URL(request.url).searchParams.get('q')?.trim();
        if (!q) return Response.json({ users: [] });

        // Exclude the viewer themselves — you can't message/mention yourself.
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const selfId = session?.user?.id ?? null;

        try {
          const results = await searchPeople(q.slice(0, 100), {
            limit: TAKE,
            excludeUserId: selfId,
          });
          return Response.json({ users: results.map((r) => r.user) });
        } catch (error) {
          console.error('User search error:', error);
          // A typeahead that errors is worse than one that quietly finds nothing.
          return Response.json({ users: [] });
        }
      },
    },
  },
});
