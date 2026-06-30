import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { generateWebhookSecret, validateWebhookUrl } from '@/lib/webhooks/emit.server';
import { normalizeWebhookEvents } from '@/lib/webhooks/events';

const MAX_ENDPOINTS = 10;

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().max(200).optional(),
});

function serialize(w: { id: string; url: string; events: string[]; description: string | null; enabled: boolean; failureCount: number; lastDeliveryAt: Date | null; createdAt: Date }) {
  return { id: w.id, url: w.url, events: w.events, description: w.description, enabled: w.enabled, failureCount: w.failureCount, lastDeliveryAt: w.lastDeliveryAt, createdAt: w.createdAt };
}

/**
 * GET  /api/v1/webhooks — your webhook endpoints.
 * POST /api/v1/webhooks — register a webhook endpoint (secret returned once).
 */
export const Route = createFileRoute('/api/v1/webhooks')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const rows = await prisma.webhookEndpoint.findMany({
              where: { userId },
              orderBy: { createdAt: 'desc' },
              select: { id: true, url: true, events: true, description: true, enabled: true, failureCount: true, lastDeliveryAt: true, createdAt: true },
            });
            return json({ data: rows.map(serialize) });
          },
          { scope: 'manage:webhooks' }
        ),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = await request.json().catch(() => null);
            const parsed = createSchema.safeParse(body);
            if (!parsed.success) return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);

            const urlError = validateWebhookUrl(parsed.data.url);
            if (urlError) return error('invalid_request', urlError, 400);

            const events = normalizeWebhookEvents(parsed.data.events);
            if (events.length === 0) return error('invalid_request', 'Provide at least one valid event name (or ["*"]).', 400);

            const count = await prisma.webhookEndpoint.count({ where: { userId } });
            if (count >= MAX_ENDPOINTS) return error('invalid_request', `You can register at most ${MAX_ENDPOINTS} webhook endpoints.`, 400);

            const secret = generateWebhookSecret();
            const created = await prisma.webhookEndpoint.create({
              data: { userId, url: parsed.data.url, events, description: parsed.data.description ?? null, secret },
              select: { id: true, url: true, events: true, description: true, enabled: true, failureCount: true, lastDeliveryAt: true, createdAt: true },
            });
            // The signing secret is returned exactly once.
            return json({ ...serialize(created), secret }, 201);
          },
          { scope: 'manage:webhooks', idempotent: true }
        ),
    },
  },
});
