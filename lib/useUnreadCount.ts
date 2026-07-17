'use client';

import { useEffect, useState } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';

/**
 * Shared message-stream bus.
 *
 * `/api/messages/stream` carries every DM signal — `unread` (badge count),
 * `new-message`, `typing`, and `message-reaction`. Previously each consumer
 * opened its OWN EventSource with its own reconnect loop: the unread-count badge
 * (mounted twice — desktop + mobile sidebar), the inbox list (MessagesColumn),
 * AND the open conversation (ConversationView). A single page could therefore
 * hold 3-4 connections to one endpoint and crowd the browser's ~6-per-origin
 * pool.
 *
 * This is now ONE module-level singleton EventSource (mirrors hooks/useFeedSSE):
 * a subscriber registry fanned out to every consumer, with exponential-backoff
 * reconnect and a polling fallback that keeps the badge fresh while SSE is down.
 * The connection opens on the first subscriber and closes when the last leaves.
 */

export type MessageStreamEventType = 'unread' | 'new-message' | 'typing' | 'message-reaction';
export type MessageStreamHandler = (type: MessageStreamEventType, data: unknown) => void;

const STREAM_URL = '/api/messages/stream';
const STREAM_EVENTS: MessageStreamEventType[] = ['unread', 'new-message', 'typing', 'message-reaction'];
const MAX_RECONNECT_DELAY = 15_000;

// Full-stream subscribers (MessagesColumn, ConversationView).
const streamSubscribers = new Set<MessageStreamHandler>();
// Unread-count subscribers (the badge) — a thin fan-out reading just the number.
const countSubscribers = new Set<(n: number) => void>();

let eventSource: EventSource | null = null;
let fallbackInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let beforeUnloadBound = false;
let count = 0;

function hasSubscribers() {
  return streamSubscribers.size > 0 || countSubscribers.size > 0;
}

function broadcastCount(n: number) {
  count = n;
  for (const s of countSubscribers) s(n);
}

function stopPolling() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
}

function startPolling() {
  if (fallbackInterval) return;
  const fetchUnread = () => {
    fetch('/api/messages/unread-count')
      .then((res) => res.json())
      .then((data) => broadcastCount(data.count ?? 0))
      .catch(() => {});
  };
  fetchUnread();
  fallbackInterval = setInterval(fetchUnread, 15_000);
}

function dispatch(type: MessageStreamEventType, raw: string) {
  // A live event means SSE is healthy again: reset backoff and drop any polling.
  retryCount = 0;
  stopPolling();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (type === 'unread') {
    const c = (data as { count?: number }).count;
    if (typeof c === 'number') broadcastCount(c);
  }
  for (const fn of streamSubscribers) fn(type, data);
}

function connectSSE() {
  if (eventSource) return;
  const es = new EventSource(STREAM_URL);
  eventSource = es;

  for (const type of STREAM_EVENTS) {
    es.addEventListener(type, (event) => dispatch(type, (event as MessageEvent).data));
  }

  es.onerror = () => {
    es.close();
    if (eventSource === es) eventSource = null;
    if (!hasSubscribers()) return;

    retryCount++;
    // Keep the badge fresh via polling while SSE is down (after a few failures),
    // but keep retrying SSE indefinitely so chat realtime recovers.
    if (retryCount >= 3) startPolling();
    const delay = Math.min(1000 * 2 ** retryCount, MAX_RECONNECT_DELAY);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (hasSubscribers() && !eventSource) connectSSE();
    }, delay);
  };
}

function ensureStarted() {
  if (typeof window === 'undefined') return;
  if (!beforeUnloadBound) {
    window.addEventListener('beforeunload', stop);
    beforeUnloadBound = true;
  }
  if (!eventSource && !fallbackInterval) connectSSE();
}

function stop() {
  eventSource?.close();
  eventSource = null;
  stopPolling();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  retryCount = 0;
  count = 0;
}

/** Tear the shared connection down only once nobody is listening. */
function maybeStop() {
  if (!hasSubscribers()) stop();
}

/**
 * Subscribe to the shared DM stream. The handler receives every event type
 * (`unread` / `new-message` / `typing` / `message-reaction`) with its parsed
 * payload; filter by `type` in the handler. Returns an unsubscribe function.
 */
export function subscribeMessageStream(handler: MessageStreamHandler): () => void {
  streamSubscribers.add(handler);
  ensureStarted();
  return () => {
    streamSubscribers.delete(handler);
    maybeStop();
  };
}

export function useUnreadCount(isLoggedIn: boolean) {
  const [value, setValue] = useState(count);
  // Defer opening the connection until the browser is idle so it doesn't compete
  // with the feed SSE + hydration for sockets and the main thread.
  const idle = useIdleReady();

  useEffect(() => {
    if (!isLoggedIn || !idle) {
      setValue(0);
      return;
    }
    countSubscribers.add(setValue);
    setValue(count);
    ensureStarted();
    return () => {
      countSubscribers.delete(setValue);
      maybeStop();
    };
  }, [isLoggedIn, idle]);

  return isLoggedIn ? value : 0;
}
