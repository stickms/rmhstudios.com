/**
 * Webhook event catalog. Pure module shared by the emitter, the webhook
 * endpoints, the dashboard, and the wiki/OpenAPI docs.
 */

export interface WebhookEventDef {
  name: string;
  description: string;
}

export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  { name: 'post.created', description: 'You created a post (via the API or in-app).' },
  { name: 'post.deleted', description: 'One of your posts was deleted.' },
  { name: 'follow.created', description: 'You followed another user.' },
  { name: 'follow.deleted', description: 'You unfollowed a user.' },
  { name: 'like.created', description: 'You liked a post.' },
  { name: 'comment.created', description: 'You commented on a post.' },
  { name: 'bookmark.created', description: 'You bookmarked a post.' },
];

export const WEBHOOK_EVENT_NAMES: string[] = WEBHOOK_EVENTS.map((e) => e.name);

/** True if `name` is a known event or the `*` wildcard. */
export function isValidWebhookEvent(name: string): boolean {
  return name === '*' || WEBHOOK_EVENT_NAMES.includes(name);
}

/** Sanitize a subscription list: keep known events / `*`, trim, de-dupe. */
export function normalizeWebhookEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!isValidWebhookEvent(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** Does an endpoint subscribed to `subscribed` receive `event`? */
export function matchesEvent(subscribed: readonly string[], event: string): boolean {
  return subscribed.includes('*') || subscribed.includes(event);
}
