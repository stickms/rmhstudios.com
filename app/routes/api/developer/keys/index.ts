import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { getUserTier, hasApiAccess } from '@/lib/entitlements';
import { generateApiKey } from '@/lib/api/developer-auth.server';
import { normalizeScopes, DEFAULT_SCOPES, ALL_SCOPES } from '@/lib/api/scopes';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
const MAX_KEYS = 10;

/**
 * GET  /api/developer/keys — list the viewer's keys (metadata only, no secrets).
 * POST /api/developer/keys — create a scoped key (subscriber only). The plaintext
 *      is returned exactly once; only its hash is stored.
 */
export const Route = createFileRoute('/api/developer/keys/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const tier = await getUserTier(session.user.id);
          const keys = await prisma.developerApiKey.findMany({
            where: { userId: session.user.id, revokedAt: null },
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, prefix: true, lastFour: true, scopes: true, expiresAt: true, lastUsedAt: true, createdAt: true },
          });
          return Response.json({ keys, hasApiAccess: hasApiAccess(tier), tier, availableScopes: ALL_SCOPES });
        } catch (error) {
          console.error('List API keys error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          // Gate creation on an active subscription (Starter+).
          const tier = await getUserTier(userId);
          if (!hasApiAccess(tier)) {
            return Response.json({ error: 'A Starter subscription or higher is required to use the developer API.' }, { status: 403 });
          }

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'apikey-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

          const count = await prisma.developerApiKey.count({ where: { userId, revokedAt: null } });
          if (count >= MAX_KEYS) return Response.json({ error: `You can have at most ${MAX_KEYS} active keys.` }, { status: 400 });

          // Default to a read-only grant when no scopes are supplied.
          const scopes = parsed.data.scopes ? normalizeScopes(parsed.data.scopes) : [...DEFAULT_SCOPES];
          const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000) : null;

          const { plaintext, hashedKey, prefix, lastFour } = generateApiKey();
          const key = await prisma.developerApiKey.create({
            data: { userId, name: parsed.data.name.trim(), prefix, hashedKey, lastFour, scopes, expiresAt },
            select: { id: true, name: true, prefix: true, lastFour: true, scopes: true, expiresAt: true, createdAt: true },
          });

          // The plaintext is returned once and never stored or shown again.
          return Response.json({ ...key, key: plaintext }, { status: 201 });
        } catch (error) {
          console.error('Create API key error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
