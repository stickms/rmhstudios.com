/**
 * The zod input schemas for the webhook console routes (`/api/developer/webhooks`).
 * Split out of the route files so the client contract can name their types.
 */
import { z } from 'zod';

const url = z.string().trim().min(1).max(2048);
const events = z.array(z.string().max(64)).min(1).max(32);
const description = z.string().trim().max(200);

export const createWebhookBody = z.object({
  url,
  events,
  description: description.optional(),
});

export const patchWebhookBody = z.object({
  url: url.optional(),
  events: events.optional(),
  description: description.nullable().optional(),
  enabled: z.boolean().optional(),
});

export const DELIVERY_STATUS_FILTERS = ['all', 'delivered', 'pending', 'failed'] as const;

/** Keyset cursor: `<createdAt ms>_<delivery id>` of the last row of the previous page. */
export const DELIVERY_CURSOR = /^\d{1,16}_[A-Za-z0-9]{1,32}$/;

export const deliveriesQuery = z.object({
  status: z.enum(DELIVERY_STATUS_FILTERS).optional(),
  event: z.string().max(64).optional(),
  cursor: z.string().regex(DELIVERY_CURSOR).optional(),
});

/** `?event=` on a test send: `ping` (the default) or one of the game events. */
export const testEventQuery = z.object({
  event: z.enum(['ping', 'personal_best.created', 'achievement.unlocked']).optional(),
});
