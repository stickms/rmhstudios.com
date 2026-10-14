import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createExperimentSchema, updateExperimentSchema } from '@/lib/ops/schema';
import { createExperiment, listExperiments, updateExperiment } from '@/lib/ops/experiments.server';

/**
 * GET   /api/admin/insights/experiments — experiments with per-arm counts + significance.
 * POST  /api/admin/insights/experiments — create (starts as DRAFT).
 * PATCH /api/admin/insights/experiments — start / stop, or set the test share while not running.
 */
export const Route = createFileRoute('/api/admin/insights/experiments')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ experiments: await listExperiments() }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createExperimentSchema },
        async ({ userId, body }) => {
          try {
            const row = await createExperiment(body);
            await logAdminAction(userId, 'experiment.create', {
              targetType: 'Experiment',
              targetId: row.id,
              detail: body.key,
            });
            return Response.json({ id: row.id }, { status: 201 });
          } catch {
            return Response.json({ error: 'That key is already taken' }, { status: 409 });
          }
        },
      ),
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: updateExperimentSchema },
        async ({ userId, body }) => {
          const { id, ...patch } = body;
          const ok = await updateExperiment(id, patch);
          if (!ok) return Response.json({ error: 'Not found, or running' }, { status: 404 });
          await logAdminAction(userId, 'experiment.update', {
            targetType: 'Experiment',
            targetId: id,
            detail: JSON.stringify(patch),
          });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
