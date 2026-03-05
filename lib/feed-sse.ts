/**
 * Feed SSE — server-side event bus for real-time feed updates.
 *
 * Uses a simple in-process EventEmitter for single-instance deployments.
 * For multi-instance production, swap the emitter for a Redis pub/sub adapter.
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
  | "rmhark.unreposted";

export interface FeedSSEEvent {
  type: FeedSSEEventType;
  /** The rmhark ID this event relates to */
  rmharkId: string;
  /** Full FeedItem for "created" events; partial updates for others */
  payload: Partial<FeedItem> & { id: string };
  /** ISO timestamp */
  timestamp: string;
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
