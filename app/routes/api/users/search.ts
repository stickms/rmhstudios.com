import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';

const TAKE = 5;

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
        if (!q) {
          return Response.json({ users: [] });
        }

        // Exclude the viewer themselves — you can't message/mention yourself.
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const selfId = session?.user?.id ?? null;

        const qLower = q.toLowerCase();
        // Prefix pattern for short queries: trigram similarity (`%`) needs enough
        // shared trigrams, so a 1–2 char query wouldn't match on its own. Escape
        // LIKE metacharacters so user input can't smuggle in wildcards (backslash
        // is the default LIKE escape).
        const prefix = qLower.replace(/[\\%_]/g, '\\$&') + '%';

        // People search via the pg_trgm GIN indexes on lower(name) /
        // lower(username) / lower(handle) (user_name_trgm_idx et al.). `%` gives
        // typo tolerance; the prefix LIKE keeps short/exact prefixes matching.
        // Ordered by best similarity. Fully parameterised — no string concat.
        const matches = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id
          FROM "user"
          WHERE (
            lower(name) % ${qLower} OR lower(name) LIKE ${prefix}
            OR lower(username) % ${qLower} OR lower(username) LIKE ${prefix}
            OR lower(handle) % ${qLower} OR lower(handle) LIKE ${prefix}
          )
          ${selfId ? Prisma.sql`AND id <> ${selfId}` : Prisma.empty}
          ORDER BY GREATEST(
            COALESCE(similarity(lower(name), ${qLower}), 0),
            COALESCE(similarity(lower(username), ${qLower}), 0),
            COALESCE(similarity(lower(handle), ${qLower}), 0)
          ) DESC
          LIMIT ${TAKE}
        `);

        if (matches.length === 0) {
          return Response.json({ users: [] });
        }

        // Hydrate the shared display shape (profile + equipped cosmetics), then
        // restore the similarity ordering the raw query produced.
        const ids = matches.map((m) => m.id);
        const rows = await prisma.user.findMany({
          where: { id: { in: ids } },
          select: userDisplaySelect,
        });
        const byId = new Map(rows.map((u) => [u.id, u]));
        const users = ids
          .map((id) => byId.get(id))
          .filter((u): u is (typeof rows)[number] => Boolean(u))
          .map((u) => resolveUser(u));

        return Response.json({ users });
      },
    },
  },
});
