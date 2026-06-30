import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { validateWebhookUrl } from '@/lib/webhooks/emit.server';
import { normalizeWebhookEvents } from '@/lib/webhooks/events';

const patchSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  description: z.string().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET    /api/v1/webhooks/{id} — one endpoint + recent deliveries.
 * PATCH  /api/v1/webhooks/{id} — update url / events / description / enabled.
 * DELETE /api/v1/webhooks/{id} — remove an endpoint.
 */
export const Route = createFileRoute('/api/v1/webhooks/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const w = await prisma.webhookEndpoint.findUnique({
              where: { id: params.id },
              select: {
                id: true, userId: true, url: true, events: true, description: true, enabled: true, failureCount: true, lastDeliveryAt: true, createdAt: true,
                deliveries: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, event: true, status: true, attempts: true, responseStatus: true, error: true, createdAt: true, deliveredAt: true } },
              },
            });
            if (!w || w.userId !== userId) return error('not_found', 'Webhook not found.', 404);
            return json({
              id: w.id, url: w.url, events: w.events, description: w.description, enabled: w.enabled,
              failureCount: w.failureCount, lastDeliveryAt: w.lastDeliveryAt, createdAt: w.createdAt, recentDeliveries: w.deliveries,
            });
          },
          { scope: 'manage:webhooks' }
        ),

      PATCH: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const existing = await prisma.webhookEndpoint.findUnique({ where: { id: params.id }, select: { userId: true } });
            if (!existing || existing.userId !== userId) return error('not_found', 'Webhook not found.', 404);

            const body = await request.json().catch(() => null);
            const parsed = patchSchema.safeParse(body);
            if (!parsed.success) return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);

            const data: { url?: string; events?: string[]; description?: string | null; enabled?: boolean; failureCount?: number } = {};
            if (parsed.data.url !== undefined) {
              const urlError = validateWebhookUrl(parsed.data.url);
              if (urlError) return error('invalid_request', urlError, 400);
              data.url = parsed.data.url;
            }
            if (parsed.data.events !== undefined) {
              const events = normalizeWebhookEvents(parsed.data.events);
              if (events.length === 0) return error('invalid_request', 'Provide at least one valid event name (or ["*"]).', 400);
              data.events = events;
            }
            if (parsed.data.description !== undefined) data.description = parsed.data.description;
            if (parsed.data.enabled !== undefined) {
              data.enabled = parsed.data.enabled;
              if (parsed.data.enabled) data.failureCount = 0; // re-enabling clears the failure streak
            }

            const updated = await prisma.webhookEndpoint.update({
              where: { id: params.id },
              data,
              select: { id: true, url: true, events: true, description: true, enabled: true, failureCount: true, lastDeliveryAt: true, createdAt: true },
            });
            return json(updated);
          },
          { scope: 'manage:webhooks' }
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, error, noContent }) => {
            const existing = await prisma.webhookEndpoint.findUnique({ where: { id: params.id }, select: { userId: true } });
            if (!existing || existing.userId !== userId) return error('not_found', 'Webhook not found.', 404);
            await prisma.webhookEndpoint.delete({ where: { id: params.id } });
            return noContent();
          },
          { scope: 'manage:webhooks', idempotent: true }
        ),
    },
  },
});
