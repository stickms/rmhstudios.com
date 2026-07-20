/**
 * Feed SSE — server-side event bus for real-time feed updates.
 *
 * Rides the keyed realtime bus (`createBus`, Redis-backed when configured, in-
 * process otherwise). Instead of a single `"all"` firehose that delivered every
 * event to every connected client, events are split across three channel
 * families so an engagement on a viral post no longer reaches every stream:
 *
 *   - `feed:created`        — new posts (`rmhark.created`). Broadcast (every
 *                             stream subscribes); the stream attaches per-viewer
 *                             delivery metadata from the follow graph. Full
 *                             per-follower fan-out is a later phase.
 *   - `feed:post:<postId>`  — engagement patches for ONE post (liked / unliked /
 *                             commented / reposted / unreposted / edited /
 *                             deleted). Only subscribers interested in that post
 *                             receive them, so a like on a viral post costs
 *                             O(viewers-of-that-post), not O(all-clients).
 *   - `feed:user:<userId>`  — targeted events (mention notifications carrying
 *                             `targetUserIds`). Delivered only to the named
 *                             viewers' per-user channels, never broadcast.
 *
 * `publish()` is a backward-compatible smart router: it inspects the event and
 * routes it to the right channel, so existing call sites keep working unchanged.
 * `publishPostCreated` / `publishPostEngagement` / `publishUserEvent` are the
 * explicit equivalents. The `subscribe*` methods are the seam the stream
 * endpoint uses to merge the channels it cares about into one SSE response.
 *
 * Events carry `authorId` so the stream endpoint can target `rmhark.created`
 * events to the viewer's follow graph instead of broadcasting every stranger's
 * post to everyone.
 */

import type { FeedItem } from './feed-types';
import { createBus } from './realtime-bus.server';

/* ------------------------------------------------------------------ */
/*  Event types                                                        */
/* ------------------------------------------------------------------ */

export type FeedSSEEventType =
  | 'rmhark.created'
  | 'rmhark.liked'
  | 'rmhark.unliked'
  | 'rmhark.commented'
  | 'rmhark.deleted'
  | 'rmhark.edited'
  | 'rmhark.reposted'
  | 'rmhark.unreposted'
  | 'notification.mention';

/**
 * Payload for a `notification.mention` event — pushed only to the viewers in
 * the event's `targetUserIds` (the mentioned users), so the client can surface
 * a toast that deep-links to the post.
 */
export interface MentionNotification {
  rmharkId: string;
  /** Short snippet of the post content for the toast body. */
  preview: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    handle: string | null;
  };
}

export interface FeedSSEEvent {
  type: FeedSSEEventType;
  /** The rmhark ID this event relates to */
  rmharkId: string;
  /** Full FeedItem for "created" events; partial updates for others */
  payload: Partial<FeedItem> & { id: string };
  /** ISO timestamp */
  timestamp: string;
  /**
   * Author of the post (for "created" events). The stream endpoint uses this
   * to decide whether the event belongs in a given viewer's Following feed.
   */
  authorId?: string;
  /**
   * When set, the event is delivered ONLY to these viewers (targeted events
   * such as mention notifications) and is never broadcast to anyone else.
   */
  targetUserIds?: string[];
  /** Present for `notification.mention` events. */
  notification?: MentionNotification;
}

/**
 * Per-viewer delivery metadata the stream endpoint attaches to a forwarded
 * `rmhark.created` event so the client can route it correctly:
 *   - followed: viewer follows the author (belongs in Following)
 *   - own:      viewer *is* the author (self-action consistency)
 */
export interface FeedSSEDelivery {
  followed: boolean;
  own: boolean;
}

/* ------------------------------------------------------------------ */
/*  Keyed pub/sub bus (singleton)                                      */
/* ------------------------------------------------------------------ */

// Channel keys on the shared realtime bus. Keeping these as helpers means the
// key scheme lives in exactly one place (mirrored by the stream endpoint's
// subscriptions).
const CREATED_KEY = 'created';
const postKey = (postId: string) => `post:${postId}`;
const userKey = (userId: string) => `user:${userId}`;

/** True for count/state patches that belong on a post's own channel. */
function isEngagementEvent(type: FeedSSEEventType): boolean {
  return (
    type === 'rmhark.liked' ||
    type === 'rmhark.unliked' ||
    type === 'rmhark.commented' ||
    type === 'rmhark.reposted' ||
    type === 'rmhark.unreposted' ||
    type === 'rmhark.edited' ||
    type === 'rmhark.deleted'
  );
}

class FeedEventBus {
  private bus = createBus<FeedSSEEvent>('feed');

  /**
   * Backward-compatible smart publish. Routes by the event shape so every
   * existing call site (`feedEventBus.publish({...})`) lands on the correct
   * channel with no change:
   *   - has `targetUserIds`   → each `feed:user:<id>` (targeted, never broadcast)
   *   - `rmhark.created`      → `feed:created` (broadcast)
   *   - engagement patches    → `feed:post:<rmharkId>`
   */
  publish(event: FeedSSEEvent) {
    if (event.targetUserIds && event.targetUserIds.length > 0) {
      for (const uid of event.targetUserIds) this.bus.publish(userKey(uid), event);
      return;
    }
    if (event.type === 'rmhark.created') {
      this.bus.publish(CREATED_KEY, event);
      return;
    }
    if (isEngagementEvent(event.type)) {
      this.bus.publish(postKey(event.rmharkId), event);
      return;
    }
    // Fallback for any future non-targeted, non-created event: broadcast on the
    // created channel so it is never silently dropped.
    this.bus.publish(CREATED_KEY, event);
  }

  /** Publish a new post to the broadcast `feed:created` channel. */
  publishPostCreated(event: FeedSSEEvent) {
    this.bus.publish(CREATED_KEY, event);
  }

  /** Publish an engagement patch to a single post's `feed:post:<id>` channel. */
  publishPostEngagement(postId: string, event: FeedSSEEvent) {
    this.bus.publish(postKey(postId), event);
  }

  /** Publish a targeted event to one viewer's `feed:user:<id>` channel. */
  publishUserEvent(userId: string, event: FeedSSEEvent) {
    this.bus.publish(userKey(userId), event);
  }

  /** Subscribe to the broadcast new-post channel. Returns an unsubscribe fn. */
  subscribeCreated(handler: (event: FeedSSEEvent) => void): () => void {
    return this.bus.subscribe(CREATED_KEY, handler);
  }

  /** Subscribe to one viewer's targeted-event channel. */
  subscribeUser(userId: string, handler: (event: FeedSSEEvent) => void): () => void {
    return this.bus.subscribe(userKey(userId), handler);
  }

  /**
   * Subscribe to one post's engagement channel. The stream endpoint uses this
   * to receive live count patches only for the posts a viewer actually cares
   * about (see the endpoint for the current subscription policy).
   */
  subscribePost(postId: string, handler: (event: FeedSSEEvent) => void): () => void {
    return this.bus.subscribe(postKey(postId), handler);
  }
}

// Singleton — survives HMR in dev via globalThis
const globalKey = '__feed_event_bus__';

function getEventBus(): FeedEventBus {
  if (!(globalThis as any)[globalKey]) {
    (globalThis as any)[globalKey] = new FeedEventBus();
  }
  return (globalThis as any)[globalKey] as FeedEventBus;
}

export const feedEventBus = getEventBus();
