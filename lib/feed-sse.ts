/**
 * Feed SSE — server-side event bus for real-time feed updates.
 *
 * Uses a simple in-process EventEmitter for single-instance deployments.
 * For multi-instance production, swap the emitter for a Redis pub/sub adapter
 * (Phase 3 of docs/feed/plan.md). The `publish`/`subscribe` surface is the seam:
 * a Redis adapter implements the same two methods and nothing else changes.
 *
 * Events now carry `authorId` so the stream endpoint can target
 * `rmhark.created` events to the viewer's follow graph instead of
 * broadcasting every stranger's post to everyone.
 */

import { EventEmitter } from "events";
import type { FeedItem } from "./feed-types";

/* ------------------------------------------------------------------ */
/*  Event types                                                        */
/* ------------------------------------------------------------------ */

export type FeedSSEEventType =
  | "rmhark.created"
  | "rmhark.liked"
  | "rmhark.unliked"
  | "rmhark.commented"
  | "rmhark.deleted"
  | "rmhark.reposted"
  | "rmhark.unreposted"
  | "notification.mention";

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
/*  In-process pub/sub bus (singleton)                                 */
/* ------------------------------------------------------------------ */

const FEED_EVENT = "feed-event";

class FeedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many SSE connections without warning
    this.emitter.setMaxListeners(500);
  }

  /** Publish an event to all connected SSE clients */
  publish(event: FeedSSEEvent) {
    this.emitter.emit(FEED_EVENT, event);
  }

  /** Subscribe to feed events — returns an unsubscribe function */
  subscribe(handler: (event: FeedSSEEvent) => void): () => void {
    this.emitter.on(FEED_EVENT, handler);
    return () => {
      this.emitter.off(FEED_EVENT, handler);
    };
  }
}

// Singleton — survives HMR in dev via globalThis
const globalKey = "__feed_event_bus__";

function getEventBus(): FeedEventBus {
  if (!(globalThis as any)[globalKey]) {
    (globalThis as any)[globalKey] = new FeedEventBus();
  }
  return (globalThis as any)[globalKey] as FeedEventBus;
}

export const feedEventBus = getEventBus();
