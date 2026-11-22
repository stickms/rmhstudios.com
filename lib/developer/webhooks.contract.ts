/**
 * Contracts for the webhook console (`/api/developer/webhooks/**`). Session
 * authenticated, owner only: a foreign id answers 404. Client-safe: request types
 * come from the zod schemas by `import type`; dates are ISO strings on the wire.
 * The signing secret appears in exactly two responses (create, rotate), once.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  createWebhookBody,
  deliveriesQuery,
  testEventQuery,
  patchWebhookBody,
} from '@/lib/developer/webhooks-schema';
import type { WebhookHealth } from '@/lib/webhooks/health';

export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

/** An endpoint's metadata. Never carries a secret. */
export interface WebhookEndpointRow {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  createdAt: string;
  /** From the last 20 deliveries. */
  health: WebhookHealth;
  /** The latest delivery error, set only while the endpoint is disabled (why it was switched off). */
  disabledReason: string | null;
  /** When the rotated-out secret stops being accepted, while an overlap is open. */
  previousSecretExpiresAt: string | null;
  /** Set while an admin has the endpoint off: when, and the reason they wrote. The owner cannot enable it. */
  adminDisabled: { at: string; reason: string } | null;
}

export interface WebhookDeliveryRow {
  id: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
  /** The delivery this one re-sent, when it is a redelivery. */
  redeliveryOfId: string | null;
  payload: unknown;
}

export const listWebhooksApi = endpoint<{
  res: { endpoints: WebhookEndpointRow[]; max: number };
}>()({ method: 'GET', path: '/api/developer/webhooks' });

/** 201. `secret` is the signing secret, returned exactly once. */
export const createWebhookApi = endpoint<{
  body: z.infer<typeof createWebhookBody>;
  res: { endpoint: WebhookEndpointRow; secret: string };
}>()({ method: 'POST', path: '/api/developer/webhooks' });

/** One endpoint and a page of its deliveries, newest first. */
export const getWebhookApi = endpoint<{
  query: z.infer<typeof deliveriesQuery>;
  res: {
    endpoint: WebhookEndpointRow;
    deliveries: WebhookDeliveryRow[];
    nextCursor: string | null;
  };
}>()({ method: 'GET', path: '/api/developer/webhooks/$id' });

/** Edit, enable or disable. Enabling resets the failure count. */
export const updateWebhookApi = endpoint<{
  body: z.infer<typeof patchWebhookBody>;
  res: { endpoint: WebhookEndpointRow };
}>()({ method: 'PATCH', path: '/api/developer/webhooks/$id' });

export const deleteWebhookApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/developer/webhooks/$id' });

/** New secret, returned once; the old one keeps signing until `previousSecretExpiresAt`. */
export const rotateWebhookSecretApi = endpoint<{
  res: { endpoint: WebhookEndpointRow; secret: string };
}>()({ method: 'POST', path: '/api/developer/webhooks/$id/rotate' });

/** Sends a `ping` (or, with `?event=`, a sample game event) to this endpoint only and returns the recorded delivery. */
export const testWebhookApi = endpoint<{
  query: z.infer<typeof testEventQuery>;
  res: { delivery: WebhookDeliveryRow };
}>()({ method: 'POST', path: '/api/developer/webhooks/$id/test' });

/** Sends a delivered or failed delivery again as a new row pointing at the original. */
export const redeliverWebhookApi = endpoint<{
  res: { delivery: WebhookDeliveryRow };
}>()({ method: 'POST', path: '/api/developer/webhooks/deliveries/$id/redeliver' });
