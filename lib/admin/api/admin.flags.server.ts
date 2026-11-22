import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
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

/** What the admin console reads of a flag. The allow and deny lists are served only by the targeting endpoint. */
const flagSelect = {
  key: true,
  enabled: true,
  rolloutPercent: true,
  description: true,
} as const;

const deleteSchema = z.object({ key: z.string().regex(FLAG_KEY_PATTERN) });

/**
 * /api/admin/flags — manage feature flags (admin only).
 *   GET    list every flag
 *   PUT    create or update one: { key, enabled, rolloutPercent?, description? }
 *   DELETE remove one: { key } (its allow and deny lists go with the row)
 * Per-member lists, the check tool and the history are the /api/admin/flags/$key/* endpoints.
 */
export const route = apiRoute('/api/admin/flags', {
  GET: implement(C.listAdminFlagsApi, { auth: 'admin' }, async () =>
    Response.json({ flags: await prisma.featureFlag.findMany({ select: flagSelect, orderBy: { key: 'asc' } }) }),
  ),
  PUT: implement(
    C.upsertAdminFlagApi,
    { auth: 'admin', rateLimit: 'write', body: upsertSchema },
    async ({ userId, body }) => {
      const flag = await prisma.featureFlag.upsert({
        where: { key: body.key },
        create: { ...body, updatedBy: userId },
        update: { ...body, updatedBy: userId },
        select: flagSelect,
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
  DELETE: implement(
    C.deleteAdminFlagApi,
    { auth: 'admin', rateLimit: 'write', body: deleteSchema },
    async ({ userId, body }) => {
      // The lists live on the flag's row, so deleting it deletes them; the audit line says how many people were
      // named, since the history is all that is left of them.
      const row = await prisma.featureFlag.findUnique({
        where: { key: body.key },
        select: { allowUserIds: true, denyUserIds: true },
      });
      await prisma.featureFlag.deleteMany({ where: { key: body.key } });
      invalidateFlags();
      const named = row ? row.allowUserIds.length + row.denyUserIds.length : 0;
      await logAdminAction(userId, 'flag.delete', {
        targetType: 'feature_flag',
        targetId: body.key,
        ...(named > 0 ? { detail: `${named} targeted members removed with it` } : {}),
      });
      return Response.json({ ok: true });
    },
  ),
});
