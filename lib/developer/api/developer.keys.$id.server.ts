import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { revokeDeveloperKeyApi, updateDeveloperKeyApi } from '@/lib/developer/keys.contract';
import { patchKeyBody } from '@/lib/developer/keys-schema';
import { generateApiKey } from '@/lib/api/developer-auth.server';
import { normalizeScopes } from '@/lib/api/scopes';
import { tierMinuteLimit } from '@/lib/api/tier-limits';
import { getUserTier } from '@/lib/entitlements';

/**
 * PATCH  /api/developer/keys/$id — rename, re-scope, change expiry, restrict the
 *        allowed addresses or per-minute limit, or rotate the secret of one of your keys.
 *        Every request re-reads the key, so a change applies to the next request. Rotating returns a new plaintext once.
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

      // A key's own limit can only lower the tier's. Checked against the tier the
      // owner holds now (a lapsed plan is refused at request time anyway).
      if (body.rateLimitPerMinute != null) {
        const maxLimit = tierMinuteLimit(await getUserTier(session.user.id));
        if (body.rateLimitPerMinute > maxLimit) {
          return Response.json(
            { error: `Requests per minute can be at most ${maxLimit} on your plan.` },
            { status: 400 },
          );
        }
      }

      const data: Record<string, unknown> = {};
      if (body.allowedCidrs !== undefined) data.allowedCidrs = body.allowedCidrs;
      if (body.rateLimitPerMinute !== undefined) data.rateLimitPerMinute = body.rateLimitPerMinute;
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
          allowedCidrs: true,
          rateLimitPerMinute: true,
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
