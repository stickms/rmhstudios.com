/**
 * createRealtimeClient — the socket.io wrapper every app and game shares.
 *
 * Each app used to hand-roll this: same `io()` options, same auth callback,
 * same connect/disconnect/connect_error trio writing to its own store, same
 * `visibilitychange` listener. Same bugs, too — the visibility listener was
 * never removed, `error` and `reconnecting` were reported as the same state,
 * and an emit made during a two-second blip was dropped with a console
 * warning the player never saw.
 *
 * What this adds over a bare `io()`:
 *
 * - **Fast recovery.** socket.io's default backoff starts at 1s and climbs to
 *   10s, so a phone unlocked 30 seconds into a drop sat idle for up to ten
 *   more before trying. Every wake signal the platform offers — visibility,
 *   `online`, `pageshow` (bfcache restore), window focus — resets the backoff
 *   and reconnects immediately.
 * - **An honest status.** `connecting` (cold start) and `reconnecting` (we had
 *   a session and want it back) are different states, so the UI can say so.
 * - **Fresh credentials per attempt.** The auth callback re-reads the session
 *   on every retry, so a reconnect after a token refresh doesn't fail.
 * - **An outbox.** Opt-in per emit; queues while offline and flushes in order
 *   on reconnect, so an intent expressed during a blip survives it.
 */

'use client';

import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';
import type { RealtimeStatus } from './types';

/** Credentials handed to the server on every (re)connection attempt. */
export type AuthResolver = () => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface RealtimeClientOptions {
  /** Used in log lines. */
  name: string;
  /** Server origin. A missing/blank value fails loudly rather than dialling the page origin. */
  url: string | undefined;
  /** socket.io mount path, e.g. `/socket/`. */
  path: string;
  /**
   * Resolve auth for an attempt. Throwing (or returning nothing usable) puts
   * the client in `error` — the caller decides what counts as usable.
   */
  auth: AuthResolver;
  /** Status transitions. Called on every change, never with the same value twice. */
  onStatus?: (status: RealtimeStatus, meta: { attempt: number; reason?: string }) => void;
  /**
   * Runs after every successful connect, including reconnects. This is where
   * an app re-joins its room — the server has a new socket id and has
   * forgotten the old mapping.
   */
  onConnect?: (socket: Socket, info: { isReconnect: boolean }) => void;
  /** Wire the app's own event listeners. Runs once, before the first connect. */
  bind?: (socket: Socket) => void;
  /** Max queued emits; beyond this the oldest are dropped. */
  outboxLimit?: number;
}

export interface RealtimeClient {
  readonly socket: Socket;
  readonly status: RealtimeStatus;
  /**
   * Send an event. Returns true if it went out on the wire.
   *
   * `queue: true` holds it in the outbox while offline and flushes on the next
   * connect. Use it for intents that stay meaningful a few seconds later (chat,
   * a settings change, a ready toggle) — never for anything positional or
   * time-sensitive, which should be re-derived from fresh state instead.
   */
  emit(event: string, data?: unknown, options?: { queue?: boolean }): boolean;
  /** Force an immediate reconnection attempt, ignoring the backoff. */
  reconnectNow(): void;
  /** Close and release every listener, including the document-level ones. */
  destroy(): void;
}

/**
 * Tuned for recovery speed. socket.io's defaults (1s → 10s) were chosen for
 * servers under load; these are chosen for a person staring at a stalled game.
 * The randomization factor keeps a mass reconnect after a server restart from
 * arriving as one synchronised wave.
 */
const RECONNECT_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 300,
  reconnectionDelayMax: 5_000,
  randomizationFactor: 0.5,
  timeout: 8_000,
};

const DEFAULT_OUTBOX_LIMIT = 32;

export function createRealtimeClient(options: RealtimeClientOptions): RealtimeClient {
  const {
    name,
    url,
    path,
    auth,
    onStatus,
    onConnect,
    bind,
    outboxLimit = DEFAULT_OUTBOX_LIMIT,
  } = options;

  if (!url) {
    // A blank VITE_*_SOCKET_URL silently becomes the page origin, where the
    // handshake 404s and the client retries forever against nothing.
    throw new Error(`[${name}] Realtime URL is not configured`);
  }

  let status: RealtimeStatus = 'idle';
  let attempt = 0;
  /** Distinguishes a cold start from a recovery. */
  let hasConnected = false;
  let destroyed = false;
  const outbox: { event: string; data?: unknown }[] = [];

  const setStatus = (next: RealtimeStatus, reason?: string) => {
    if (status === next || destroyed) return;
    status = next;
    onStatus?.(next, { attempt, reason });
  };

  setStatus('connecting');

  const socket = io(ensureTrailingSlash(url), {
    ...RECONNECT_OPTIONS,
    path,
    auth: (cb) => {
      // Resolved per attempt so a reconnect after a token refresh carries the
      // new token rather than the one that just expired.
      Promise.resolve()
        .then(auth)
        .then((credentials) => cb(credentials))
        .catch((error) => {
          console.error(`[${name}] Could not resolve credentials`, error);
          // Handing back an empty object lets the server reject cleanly, which
          // surfaces as `connect_error` below rather than hanging the attempt.
          cb({});
        });
    },
  });

  bind?.(socket);

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  socket.on('connect', () => {
    const isReconnect = hasConnected;
    hasConnected = true;
    attempt = 0;
    setStatus('connected');

    onConnect?.(socket, { isReconnect });

    // Flush after the rejoin above, so queued events land in a room the server
    // has already put us back into.
    if (outbox.length) {
      const pending = outbox.splice(0, outbox.length);
      for (const message of pending) socket.emit(message.event, message.data);
    }
  });

  socket.on('disconnect', (reason) => {
    if (destroyed) return;
    // `io client disconnect` is our own `destroy()`/`disconnect()`; `io server
    // disconnect` is the server telling us not to come back (kicked, banned,
    // duplicate session). Neither is retried by socket.io, so neither is
    // "reconnecting".
    if (reason === 'io client disconnect' || reason === 'io server disconnect') {
      setStatus('disconnected', reason);
    } else {
      setStatus('reconnecting', reason);
    }
  });

  socket.io.on('reconnect_attempt', (n) => {
    attempt = n;
    if (status !== 'connected') setStatus('reconnecting', `attempt ${n}`);
  });

  socket.on('connect_error', (error) => {
    const message = error?.message ?? '';
    // An auth failure will fail identically forever, so retrying is just noise
    // — surface it and let the app re-authenticate.
    if (/auth|token|unauthor/i.test(message)) {
      socket.io.reconnection(false);
      setStatus('error', message);
      return;
    }
    setStatus(hasConnected ? 'reconnecting' : 'connecting', message);
  });

  // ─── Wake signals ───────────────────────────────────────────────────────

  /**
   * Reconnect *now*, skipping whatever backoff is pending. Without the manager
   * reset, socket.io keeps its existing timer, so a user who returns 30s into
   * an outage still waits out the current 5s window before anything happens.
   */
  const reconnectNow = () => {
    if (destroyed || socket.connected) return;
    // `_backOff` is manager-internal; guard so a socket.io upgrade that renames
    // it degrades to the ordinary (still correct, just slower) retry.
    const backoff = (socket.io as unknown as { backoff?: { reset(): void } }).backoff;
    backoff?.reset();
    socket.connect();
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') reconnectNow();
  };
  const onOnline = () => reconnectNow();
  const onFocus = () => reconnectNow();
  const onPageShow = (event: PageTransitionEvent) => {
    // A bfcache restore resumes a page whose socket the browser froze and
    // closed; there is no `visibilitychange` for it on some engines.
    if (event.persisted) reconnectNow();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
  }

  // ─── Public surface ─────────────────────────────────────────────────────

  return {
    socket,
    get status() {
      return status;
    },
    emit(event, data, emitOptions) {
      if (socket.connected) {
        socket.emit(event, data);
        return true;
      }
      if (emitOptions?.queue) {
        if (outbox.length >= outboxLimit) outbox.shift();
        outbox.push({ event, data });
      }
      return false;
    },
    reconnectNow,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      outbox.length = 0;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pageshow', onPageShow);
      }
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    },
  };
}
