/**
 * useFeedSSE — React hook that connects to the feed SSE stream
 * and pushes real-time updates into the Zustand feed store.
 *
 * Uses a **singleton** EventSource so only ONE connection exists at a time,
 * even across HMR remounts. This prevents exhausting the browser's ~6
 * concurrent HTTP/1.1 connection limit.
 */

"use client";

import { useEffect } from "react";
import { useFeedStore } from "@/stores/feedStore";
import type { FeedSSEEvent, FeedSSEEventType } from "@/lib/feed-sse";

const SSE_URL = "/api/feed/stream";
const MAX_BACKOFF = 30_000;

/* ------------------------------------------------------------------ */
/*  Singleton connection — stored on globalThis to survive HMR          */
/* ------------------------------------------------------------------ */

interface SSEState {
  es: EventSource | null;
  refCount: number;
  retries: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  listeners: Set<(event: FeedSSEEvent) => void>;
}

const GLOBAL_KEY = "__feed_sse_state__";

function getState(): SSEState {
  if (!(window as any)[GLOBAL_KEY]) {
    (window as any)[GLOBAL_KEY] = {
      es: null,
      refCount: 0,
      retries: 0,
      reconnectTimer: null,
      listeners: new Set<(event: FeedSSEEvent) => void>(),
    };
  }
  return (window as any)[GLOBAL_KEY] as SSEState;
}

const EVENT_TYPES: FeedSSEEventType[] = [
  "rmhark.created",
  "rmhark.liked",
  "rmhark.unliked",
  "rmhark.commented",
  "rmhark.deleted",
  "rmhark.reposted",
  "rmhark.unreposted",
];

function dispatch(e: MessageEvent) {
  try {
    const event: FeedSSEEvent = JSON.parse(e.data);
    const s = getState();
    for (const fn of s.listeners) fn(event);
  } catch {
    // Malformed event — ignore
  }
}

function closeConnection() {
  const s = getState();
  if (s.reconnectTimer) {
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
  }
  if (s.es) {
    s.es.close();
    s.es = null;
  }
}

function handleBeforeUnload() {
  closeConnection();
}

function openConnection() {
  const s = getState();

  // Close any stale connection first
  closeConnection();

  const es = new EventSource(SSE_URL);
  s.es = es;

  // Clean up on page unload to avoid "connection interrupted" errors
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("beforeunload", handleBeforeUnload);

  es.addEventListener("connected", () => {
    getState().retries = 0;
  });

  for (const type of EVENT_TYPES) {
    es.addEventListener(type, dispatch);
  }

  es.onerror = () => {
    es.close();
    const st = getState();
    if (st.es === es) st.es = null;

    // Only reconnect if there are active subscribers
    if (st.refCount > 0) {
      const delay = Math.min(1000 * 2 ** st.retries, MAX_BACKOFF);
      st.retries++;
      st.reconnectTimer = setTimeout(openConnection, delay);
    }
  };
}

function subscribe() {
  const s = getState();
  s.refCount++;
  if (s.refCount === 1) {
    openConnection();
  }
}

function unsubscribe() {
  const s = getState();
  s.refCount = Math.max(0, s.refCount - 1);
  if (s.refCount === 0) {
    closeConnection();
    window.removeEventListener("beforeunload", handleBeforeUnload);
    s.retries = 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useFeedSSE() {
  const { prependItem, updateItem } = useFeedStore();

  useEffect(() => {
    const handler = (event: FeedSSEEvent) => {
      const { type, rmharkId, payload } = event;

      switch (type) {
        case "rmhark.created":
          if (payload.content !== undefined || payload.type === "rmhark") {
            prependItem(payload as any);
          }
          break;

        case "rmhark.liked":
        case "rmhark.unliked":
          updateItem(rmharkId, { likeCount: payload.likeCount });
          break;

        case "rmhark.commented":
          updateItem(rmharkId, { commentCount: payload.commentCount });
          break;

        case "rmhark.reposted":
        case "rmhark.unreposted":
          updateItem(rmharkId, { repostCount: payload.repostCount });
          break;

        case "rmhark.deleted":
          updateItem(rmharkId, {
            deletedAt: payload.deletedAt,
            deletedByAdmin: payload.deletedByAdmin,
            content: payload.content,
          });
          break;
      }
    };

    getState().listeners.add(handler);
    subscribe();

    return () => {
      getState().listeners.delete(handler);
      unsubscribe();
    };
  }, [prependItem, updateItem]);
}
