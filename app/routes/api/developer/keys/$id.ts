import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { generateApiKey } from '@/lib/api/developer-auth.server';
import { normalizeScopes } from '@/lib/api/scopes';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  rotate: z.boolean().optional(),
});

/**
 * PATCH  /api/developer/keys/$id — rename, re-scope, change expiry, or rotate
 *        the secret of one of your keys. Rotating returns a new plaintext once.
 * DELETE /api/developer/keys/$id — revoke one of your API keys.
 */
export const Route = createFileRoute('/api/developer/keys/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const key = await prisma.developerApiKey.findUnique({ where: { id: params.id }, select: { userId: true, revokedAt: true } });
          if (!key || key.userId !== session.user.id) return Response.json({ error: 'Not found' }, { status: 404 });
          if (key.revokedAt) return Response.json({ error: 'Key has been revoked' }, { status: 400 });

          const body = await request.json().catch(() => ({}));
          const parsed = patchSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

          const data: Record<string, unknown> = {};
          if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
          if (parsed.data.scopes !== undefined) data.scopes = normalizeScopes(parsed.data.scopes);
          if (parsed.data.expiresInDays !== undefined) {
            data.expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000) : null;
          }

          // Rotation: issue a fresh secret, invalidating the old one immediately.
          let plaintext: string | undefined;
          if (parsed.data.rotate) {
            const gen = generateApiKey();
            plaintext = gen.plaintext;
            data.hashedKey = gen.hashedKey;
            data.prefix = gen.prefix;
            data.lastFour = gen.lastFour;
          }

          const updated = await prisma.developerApiKey.update({
            where: { id: params.id },
            data,
            select: { id: true, name: true, prefix: true, lastFour: true, scopes: true, expiresAt: true, lastUsedAt: true, createdAt: true },
          });
          return Response.json(plaintext ? { ...updated, key: plaintext } : updated);
        } catch (error) {
          console.error('Update API key error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const key = await prisma.developerApiKey.findUnique({ where: { id: params.id }, select: { userId: true, revokedAt: true } });
          if (!key || key.userId !== session.user.id) return Response.json({ error: 'Not found' }, { status: 404 });
          if (key.revokedAt) return Response.json({ success: true });

          await prisma.developerApiKey.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Revoke API key error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
