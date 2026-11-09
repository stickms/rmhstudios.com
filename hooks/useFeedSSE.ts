/**
 * useFeedSSE — React hook that connects to the feed SSE stream
 * and pushes real-time updates into the Zustand feed store.
 *
 * Uses a **singleton** EventSource so only ONE connection exists at a time,
 * even across HMR remounts. This prevents exhausting the browser's ~6
 * concurrent HTTP/1.1 connection limit.
 */

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFeedStore } from "@/stores/feedStore";
import { showMentionToast } from "@/components/feed/MentionToast";
import type { FeedSSEEvent, FeedSSEEventType, FeedSSEDelivery } from "@/lib/feed-sse";

const SSE_URL = "/api/feed/stream";
const MAX_BACKOFF = 30_000;
/**
 * The backoff resets only once a connection has stayed up this long. Resetting
 * on `connected` meant a server that accepts and then drops (a proxy timeout, a
 * crash loop) was re-dialled every ~1s forever.
 */
const STABLE_MS = 30_000;
/**
 * Consecutive failures before the stream stops retrying on its own (≈2.5 min of
 * backoff). It resumes on the next wake signal — `online`, the tab becoming
 * visible again, a bfcache restore — rather than hammering a dead endpoint.
 */
const MAX_RETRIES = 10;

/* ------------------------------------------------------------------ */
/*  Singleton connection — stored on globalThis to survive HMR          */
/* ------------------------------------------------------------------ */

interface SSEState {
  es: EventSource | null;
  refCount: number;
  retries: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  /** Pending "this connection is stable" reset of `retries`. */
  stableTimer?: ReturnType<typeof setTimeout> | null;
  /** Retries exhausted: idle until a wake signal. */
  gaveUp?: boolean;
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
  "rmhark.edited",
  "rmhark.reposted",
  "rmhark.unreposted",
  "notification.mention",
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
  if (s.stableTimer) {
    clearTimeout(s.stableTimer);
    s.stableTimer = null;
  }
  if (s.es) {
    s.es.close();
    s.es = null;
  }
}

// `pagehide`, not `beforeunload`: a `beforeunload` listener makes the page
// ineligible for the back/forward cache in Firefox, and an open EventSource does
// the same everywhere — so the stream is closed as the page is hidden and
// reopened if the browser restores it from the cache (`pageshow.persisted`),
// which is what makes back/forward instant instead of a full reload.
function handlePageHide() {
  closeConnection();
}

function handlePageShow(e: PageTransitionEvent) {
  if (!e.persisted) return;
  const s = getState();
  if (s.refCount > 0 && !s.es) {
    s.retries = 0;
    s.gaveUp = false;
    openConnection();
  }
}

/** `online` / tab visible: revive a stream that ran out of retries. */
function handleWake() {
  if (document.visibilityState === "hidden") return;
  const s = getState();
  if (!s.gaveUp || s.refCount === 0 || s.es) return;
  s.gaveUp = false;
  s.retries = 0;
  openConnection();
}

function setWakeListeners(on: boolean) {
  window.removeEventListener("online", handleWake);
  document.removeEventListener("visibilitychange", handleWake);
  if (!on) return;
  window.addEventListener("online", handleWake);
  document.addEventListener("visibilitychange", handleWake);
}

function openConnection() {
  const s = getState();

  // Close any stale connection first
  closeConnection();

  const es = new EventSource(SSE_URL);
  s.es = es;

  // Close on page hide to avoid "connection interrupted" errors (and keep bfcache eligibility)
  window.removeEventListener("pagehide", handlePageHide);
  window.addEventListener("pagehide", handlePageHide);
  window.removeEventListener("pageshow", handlePageShow);
  window.addEventListener("pageshow", handlePageShow);

  es.addEventListener("connected", () => {
    const st = getState();
    if (st.es !== es) return;
    if (st.stableTimer) clearTimeout(st.stableTimer);
    st.stableTimer = setTimeout(() => {
      const cur = getState();
      cur.stableTimer = null;
      if (cur.es === es) cur.retries = 0;
    }, STABLE_MS);
  });

  for (const type of EVENT_TYPES) {
    es.addEventListener(type, dispatch);
  }

  es.onerror = () => {
    es.close();
    const st = getState();
    // A stale connection's error (already replaced or closed) schedules nothing.
    if (st.es !== es) return;
    st.es = null;
    if (st.stableTimer) {
      clearTimeout(st.stableTimer);
      st.stableTimer = null;
    }

    // Only reconnect if there are active subscribers
    if (st.refCount > 0) {
      if (st.retries >= MAX_RETRIES) {
        // Terminal until a wake signal (see `handleWake`).
        st.gaveUp = true;
        return;
      }
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
    s.gaveUp = false;
    setWakeListeners(true);
    openConnection();
  }
}

function unsubscribe() {
  const s = getState();
  s.refCount = Math.max(0, s.refCount - 1);
  if (s.refCount === 0) {
    closeConnection();
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    setWakeListeners(false);
    s.retries = 0;
    s.gaveUp = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useFeedSSE() {
  const { updateItem, removeItem, receiveCreated } = useFeedStore();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: FeedSSEEvent & { delivery?: FeedSSEDelivery }) => {
      const { type, rmharkId, payload } = event;

      switch (type) {
        case "notification.mention":
          if (event.notification) showMentionToast(event.notification, navigate);
          break;

        case "rmhark.created":
          if (payload.content !== undefined || payload.type === "rmhark") {
            // Route via the store: Following auto-prepends followed/own posts;
            // For You buffers strangers behind an "N new posts" pill.
            const delivery = event.delivery ?? { followed: false, own: false };
            receiveCreated(payload as any, delivery);
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
          removeItem(rmharkId);
          break;

        case "rmhark.edited":
          updateItem(rmharkId, { content: payload.content, edited: true });
          break;
      }
    };

    getState().listeners.add(handler);
    subscribe();

    return () => {
      getState().listeners.delete(handler);
      unsubscribe();
    };
  }, [receiveCreated, updateItem, removeItem, navigate]);
}
