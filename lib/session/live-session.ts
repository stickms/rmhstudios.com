/**
 * The live session, without the auth client in the entry (third-pass audit RT1).
 *
 * The document already carries who is signed in (`getInitialUser` in
 * `app/routes/__root.tsx`), so the shell does not need Better Auth's client
 * (with its Stripe and passkey plugins and @simplewebauthn, ~48 KB) to render.
 * What it does still need from the client is one request, and this module makes
 * it itself: `GET /api/auth/get-session` after hydration, again when the tab
 * comes back, when the connection returns, and when another tab signs in or
 * out. That request is not optional. It is the only place the browser is handed
 * a refreshed session cookie and the five-minute `session_data` cache cookie
 * (`lib/auth.ts`): the server render reads the cookie but cannot set one.
 *
 * `lib/auth-client.ts` loads with the pages that sign in, sign out or manage an
 * account, and with whatever route the router preloads. It never becomes a
 * second source: it calls {@link refreshLiveSession} when a request made
 * through it changes the session, and this store asks the endpoint again.
 *
 * The timings mirror Better Auth's own refresh manager
 * (`better-auth/dist/client/session-refresh.mjs`), so nothing is fetched more
 * or less often than before.
 */
import { api } from '@/lib/contract/client';
import { getSessionApi, type SessionPayload } from './session.contract';

export interface LiveSession {
  data: SessionPayload | null;
  error: unknown;
  isPending: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
}

/** The localStorage key Better Auth posts cross-tab session changes under. */
const BROADCAST_KEY = 'better-auth.message';
/** A returning tab does not refetch a session it asked for this recently. */
const FOCUS_REFETCH_MIN_MS = 5000;

const PENDING: LiveSession = {
  data: null,
  error: null,
  isPending: true,
  isRefetching: false,
  refetch: () => fetchSession(),
};

let current = PENDING;
let lastRequest = 0;
let latest = 0;
let inFlight: Promise<void> | undefined;
let stopListening: (() => void) | undefined;
const listeners = new Set<() => void>();

/** Better Auth's cross-tab message: `{ event: 'session', data: { trigger } }`. */
function isSessionBroadcast(raw: string | null): boolean {
  try {
    const message = JSON.parse(raw ?? '{}') as { event?: unknown; data?: unknown } | null;
    return message?.event === 'session' && Boolean(message.data);
  } catch {
    return false;
  }
}

function publish(next: LiveSession): void {
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Ask the endpoint. A request already on its way is shared, unless `fresh`: the
 * session has just changed, so an answer that left the server before the change
 * must not be the one that lands. Only the latest request publishes.
 */
function fetchSession(fresh = false): Promise<void> {
  if (inFlight && !fresh) return inFlight;
  lastRequest = Date.now();
  const id = ++latest;
  const request = api(getSessionApi)
    .then(
      (data) => {
        if (id === latest) publish({ ...current, data: data ?? null, error: null, isPending: false });
      },
      (error: unknown) => {
        // A failed request says nothing about who is signed in: keep what is known.
        if (id === latest) publish({ ...current, error, isPending: false });
      },
    )
    .finally(() => {
      if (inFlight === request) inFlight = undefined;
    });
  inFlight = request;
  return request;
}

/**
 * One fresh read of the session endpoint, for a caller that needs the session
 * itself rather than the shared state: a socket handshake sends its token. Like
 * the auth client's `getSession()`, it answers `null` instead of throwing.
 */
export async function readSession(): Promise<SessionPayload | null> {
  try {
    return await api(getSessionApi);
  } catch {
    return null;
  }
}

export function getLiveSession(): LiveSession {
  return current;
}

/** What the server renders, and what the client hydrates with: not asked yet. */
export function getPendingSession(): LiveSession {
  return PENDING;
}

export function subscribeLiveSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ask for the session and keep it fresh. Browser only (call it from an effect).
 */
export function startLiveSession(): () => void {
  if (stopListening) return () => {};
  void fetchSession();

  const refetchIfStale = () => {
    if (Date.now() - lastRequest >= FOCUS_REFETCH_MIN_MS) void fetchSession();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') refetchIfStale();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === BROADCAST_KEY && isSessionBroadcast(event.newValue)) void fetchSession(true);
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', refetchIfStale);
  window.addEventListener('storage', onStorage);
  const stop = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', refetchIfStale);
    window.removeEventListener('storage', onStorage);
    if (stopListening === stop) stopListening = undefined;
  };
  stopListening = stop;
  return stop;
}

/**
 * The session changed through the auth client in this tab (a sign-in, a
 * sign-out, a profile update): ask again now. Called by `lib/auth-client.ts`.
 */
export function refreshLiveSession(): void {
  void fetchSession(true);
}
