/**
 * Offline write queue — page side (B10).
 *
 * The queue itself lives in the service worker (`public/sw.js`): it intercepts
 * POSTs to an allowlist, parks them in IndexedDB when the network is gone, and
 * replays them via Background Sync. This module is the half the app talks to:
 *
 *  - `postWithOutbox` — issue a write with a client-generated `Idempotency-Key`,
 *    and tell the caller whether the response is a real one or a 202 receipt;
 *  - `subscribeOutbox` — observe what happened to a queued write, so a UI can
 *    show a pending row and then resolve it instead of pretending it posted.
 *    Note the `blocked` event: a replay that comes back 401 means the session
 *    expired while the write was queued, and the worker KEEPS the entry rather
 *    than dropping it. Deleting someone's post because their cookie aged out is
 *    the one outcome this queue exists to prevent, so that case is surfaced
 *    (`outboxBlockedOnAuth`) and resolved by signing in, not by a retry;
 *  - `initOfflineOutbox` — the Safari path. Background Sync does not exist
 *    there, so the page nudges the worker to replay on load and on `online`.
 *
 * The idempotency key is generated ONCE per user-initiated mutation and reused
 * across every retry of that mutation. That is the entire contract that makes
 * replay safe: `defineHandler({ idempotent: true })` stores the first response
 * under the key and replays it for any repeat, so a queued write that partially
 * succeeded before the connection died cannot post twice.
 */

/** Sync tag the worker registers; kept here so both halves agree on the string. */
export const OUTBOX_SYNC_TAG = 'rmh-outbox';

/** What the worker reports back about a queued write. */
export type OutboxEvent =
  | { type: 'queued'; key: string | null; pending: number }
  | { type: 'sent'; key: string | null; body: string; pending: number }
  | {
      type: 'failed';
      key: string | null;
      reason: 'expired' | 'unreachable' | 'rejected';
      status?: number;
      pending: number;
    }
  /**
   * The write is still queued but cannot be sent: the server answered 401, so
   * the session expired between composing and replaying. Distinct from `failed`
   * on purpose — nothing was thrown away, and signing in is what resolves it.
   */
  | { type: 'blocked'; key: string | null; reason: 'auth'; pending: number }
  | { type: 'state'; pending: number };

type Listener = (event: OutboxEvent) => void;

const listeners = new Set<Listener>();
let pendingCount = 0;
let blockedOnAuth = false;
let installed = false;

/** How many writes are sitting in the queue, as of the last worker message. */
export function outboxPending(): number {
  return pendingCount;
}

/**
 * Whether the queue is stuck behind a sign-in, as of the last worker message.
 *
 * Exposed separately from the event stream because the event that set it fires
 * during the replay the page kicks off on load — before most UI has mounted.
 * A surface that wants to prompt ("your post is waiting — sign in to send it")
 * reads this on mount and subscribes for the rest.
 */
export function outboxBlockedOnAuth(): boolean {
  return blockedOnAuth;
}

/**
 * Observe queue activity. Returns an unsubscribe function.
 *
 * A surface that queued a write should keep the optimistic row visible and
 * resolve it on `sent` / roll it back on `failed`. A queue nobody can see is
 * worse than a visible failure.
 */
export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  installMessageBridge();
  return () => listeners.delete(listener);
}

function emit(event: OutboxEvent): void {
  pendingCount = event.pending;
  // An empty queue cannot be blocked on anything.
  if (event.pending === 0) blockedOnAuth = false;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error('[outbox] listener threw:', err);
    }
  }
}

interface WorkerMessage {
  type?: string;
  key?: string | null;
  body?: string;
  reason?: string;
  status?: number;
  pending?: number;
}

function installMessageBridge(): void {
  if (installed) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installed = true;

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as WorkerMessage | null;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('RMH_OUTBOX_')) return;
    const pending = typeof data.pending === 'number' ? data.pending : pendingCount;
    const key = data.key ?? null;

    switch (data.type) {
      case 'RMH_OUTBOX_QUEUED':
        emit({ type: 'queued', key, pending });
        break;
      case 'RMH_OUTBOX_SENT':
        // Anything got through, so the session is good again.
        blockedOnAuth = false;
        emit({ type: 'sent', key, body: data.body ?? '', pending });
        break;
      case 'RMH_OUTBOX_BLOCKED':
        blockedOnAuth = true;
        emit({ type: 'blocked', key, reason: 'auth', pending });
        break;
      case 'RMH_OUTBOX_FAILED':
        emit({
          type: 'failed',
          key,
          reason: (data.reason as 'expired' | 'unreachable' | 'rejected') ?? 'rejected',
          status: data.status,
          pending,
        });
        break;
      default:
        emit({ type: 'state', pending });
    }
  });
}

/** A key that survives retries of the same user action. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Pre-`randomUUID` browsers. Not a UUID, but unique enough for a per-action key.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface OutboxPostResult<T> {
  /** True when the service worker parked the write instead of sending it. */
  queued: boolean;
  /** The raw response — a 202 receipt when `queued`. */
  response: Response;
  /** Parsed JSON body, or `null` when there is none / it is unparseable. */
  data: T | null;
  /** The key this write (and every retry of it) carries. */
  idempotencyKey: string;
}

export interface OutboxPostOptions {
  /**
   * Reuse an existing key instead of minting one. Pass the key from the first
   * attempt when the CALLER retries — a new key would defeat the whole thing.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** True for the 202 receipt the worker returns for a parked write. */
export function isQueuedResponse(response: Response, data: unknown): boolean {
  return (
    response.status === 202 &&
    typeof data === 'object' &&
    data !== null &&
    (data as { queued?: unknown }).queued === true
  );
}

/**
 * POST JSON with an `Idempotency-Key`, tolerating the offline path.
 *
 * The header is what lets the write be replayed safely, so it is sent on EVERY
 * call — not only when offline. The service worker refuses to queue a keyless
 * write for exactly that reason.
 */
export async function postWithOutbox<T = unknown>(
  url: string,
  body: unknown,
  options: OutboxPostOptions = {},
): Promise<OutboxPostResult<T>> {
  const idempotencyKey = options.idempotencyKey ?? newIdempotencyKey();
  installMessageBridge();

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...options.headers,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  const data = (await response.json().catch(() => null)) as T | null;
  return {
    queued: isQueuedResponse(response, data),
    response,
    data,
    idempotencyKey,
  };
}

/** Ask the worker to drain the queue now. */
export function requestOutboxReplay(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: 'RMH_OUTBOX_REPLAY' }))
    .catch(() => {});
}

/**
 * Wire the page half of the queue.
 *
 * Background Sync is Chromium-only. Everywhere else (Safari, and any browser
 * where the sync registration was refused) the queue would sit there until the
 * user happened to make another write — so the page asks for a replay on load
 * and whenever the connection comes back. Both paths are idempotent: a replay
 * with an empty queue does nothing.
 */
export function initOfflineOutbox(): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installMessageBridge();

  navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({ type: 'RMH_OUTBOX_STATUS' });
      requestOutboxReplay();
    })
    .catch(() => {});

  window.addEventListener('online', requestOutboxReplay);
}
