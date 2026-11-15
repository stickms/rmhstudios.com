import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { revokeDeveloperKeyApi, updateDeveloperKeyApi } from '@/lib/devplatform/keys.contract';
import { patchKeyBody } from '@/lib/devplatform/keys-schema';
import { generateApiKey } from '@/lib/api/developer-auth.server';
import { normalizeScopes } from '@/lib/api/scopes';

/**
 * PATCH  /api/developer/keys/$id — rename, re-scope, change expiry, or rotate
 *        the secret of one of your keys. Rotating returns a new plaintext once.
 * DELETE /api/developer/keys/$id — revoke one of your API keys.
 */
export const route = apiRoute('/api/developer/keys/$id', {
  PATCH: implement(
    updateDeveloperKeyApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:developer/keys/:id' },
      body: patchKeyBody,
      allowEmptyBody: true,
      verboseValidationErrors: true,
    },
    async ({ params, session, body }) => {
      const key = await prisma.developerApiKey.findUnique({
        where: { id: params.id },
        select: { userId: true, revokedAt: true },
      });
      if (!key || key.userId !== session.user.id)
        return Response.json({ error: 'Not found' }, { status: 404 });
      if (key.revokedAt) return Response.json({ error: 'Key has been revoked' }, { status: 400 });

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name.trim();
      if (body.scopes !== undefined) data.scopes = normalizeScopes(body.scopes);
      if (body.expiresInDays !== undefined) {
        data.expiresAt = body.expiresInDays
          ? new Date(Date.now() + body.expiresInDays * 86_400_000)
          : null;
      }

      // Rotation: issue a fresh secret, invalidating the old one immediately.
      let plaintext: string | undefined;
      if (body.rotate) {
        const gen = generateApiKey();
        plaintext = gen.plaintext;
        data.hashedKey = gen.hashedKey;
        data.prefix = gen.prefix;
        data.lastFour = gen.lastFour;
      }

      const updated = await prisma.developerApiKey.update({
        where: { id: params.id },
        data,
        select: {
          id: true,
          name: true,
          prefix: true,
          lastFour: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
      });
      return Response.json(plaintext ? { ...updated, key: plaintext } : updated);
    },
  ),

  DELETE: implement(
    revokeDeveloperKeyApi,
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:developer/keys/:id' } },
    async ({ params, session }) => {
      const key = await prisma.developerApiKey.findUnique({
        where: { id: params.id },
        select: { userId: true, revokedAt: true },
      });
      if (!key || key.userId !== session.user.id)
        return Response.json({ error: 'Not found' }, { status: 404 });
      if (key.revokedAt) return Response.json({ success: true });

      await prisma.developerApiKey.update({
        where: { id: params.id },
        data: { revokedAt: new Date() },
      });
      return Response.json({ success: true });
    },
  ),
});
