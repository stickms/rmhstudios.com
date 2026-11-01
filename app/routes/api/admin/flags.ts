import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { FLAG_KEY_PATTERN } from '@/lib/flags/evaluate';
import { invalidateFlags } from '@/lib/flags/flags.server';
import { logAdminAction } from '@/lib/admin-audit.server';

const upsertSchema = z.object({
  key: z.string().regex(FLAG_KEY_PATTERN),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).default(100),
  description: z.string().max(280).default(''),
});

const deleteSchema = z.object({ key: z.string().regex(FLAG_KEY_PATTERN) });

/**
 * /api/admin/flags — manage feature flags (admin only).
 *   GET    list every flag
 *   PUT    create or update one: { key, enabled, rolloutPercent?, description? }
 *   DELETE remove one: { key }
 */
export const Route = createFileRoute('/api/admin/flags')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin' }, async () =>
        Response.json({ flags: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) }),
      ),
      PUT: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: upsertSchema },
        async ({ userId, body }) => {
          const flag = await prisma.featureFlag.upsert({
            where: { key: body.key },
            create: { ...body, updatedBy: userId },
            update: { ...body, updatedBy: userId },
          });
          invalidateFlags();
          await logAdminAction(userId, 'flag.upsert', {
            targetType: 'feature_flag',
            targetId: body.key,
            detail: `${body.enabled ? 'on' : 'off'} · ${body.rolloutPercent}%`,
          });
          return Response.json({ flag });
        },
      ),
      DELETE: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: deleteSchema },
        async ({ userId, body }) => {
          await prisma.featureFlag.deleteMany({ where: { key: body.key } });
          invalidateFlags();
          await logAdminAction(userId, 'flag.delete', { targetType: 'feature_flag', targetId: body.key });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
