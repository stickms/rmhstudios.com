import type { FeedSSEEvent } from '@/lib/feed-sse';

/**
 * perf: a broadcast event used to be `JSON.stringify`d once PER connected client.
 * The event object is shared by every listener on the instance, so serialize it
 * once (WeakMap, freed with the event) and splice each client's `delivery` onto
 * the end. The result is byte-identical to `JSON.stringify({ ...event, delivery })`
 * (the spread appends `delivery` last) — only the redundant work is gone. If an
 * event already carries its own `delivery` key the spread would override it in
 * place, so that (never-expected) case keeps the original path.
 */
const serializedEvents = new WeakMap<
  FeedSSEEvent,
  { base: string; byDelivery: Map<number, string> }
>();

export function serializeWithDelivery(
  event: FeedSSEEvent,
  delivery: { followed: boolean; own: boolean },
): string {
  if ('delivery' in event) return JSON.stringify({ ...event, delivery });
  let memo = serializedEvents.get(event);
  if (!memo) {
    const base = JSON.stringify(event);
    // An empty object has no member to append after; take the plain path.
    if (base === '{}') return JSON.stringify({ ...event, delivery });
    memo = { base, byDelivery: new Map() };
    serializedEvents.set(event, memo);
  }
  const variant = (delivery.followed ? 1 : 0) | (delivery.own ? 2 : 0);
  let out = memo.byDelivery.get(variant);
  if (out === undefined) {
    out = `${memo.base.slice(0, -1)},"delivery":${JSON.stringify(delivery)}}`;
    memo.byDelivery.set(variant, out);
  }
  return out;
}
