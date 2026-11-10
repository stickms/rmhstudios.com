/**
 * The session context — one `useSession()` answer shared across a document.
 *
 * It lives in its own leaf (not in `components/Providers.tsx`, which re-exports
 * `useSession` from here) so that a separately built island (redesign audit B1,
 * `components/island/`) can provide the same context without importing the
 * site's whole provider stack. Both providers seed it the same way, through
 * {@link useEffectiveSession}.
 */
import { readJson, removeKey, writeJson } from '@/lib/core/persist';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { authClient } from '@/lib/auth-client';

export type SessionCtxValue = ReturnType<typeof authClient.useSession>;

export const SessionCtx = createContext<SessionCtxValue | null>(null);

/** Use this instead of authClient.useSession() in navigation/shell components. */
export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) return { data: null as null, isPending: true };
  return { data: ctx.data, isPending: ctx.isPending };
}

/* ------------------------------------------------------------------ */
/*  Persisted session cache                                            */
/*                                                                     */
/*  better-auth's useSession() starts out { data: null, isPending:    */
/*  true } on every fresh load and only resolves after a network      */
/*  round-trip — which makes the shell flash "signed out" for a       */
/*  moment. We persist the last-known user to localStorage and seed    */
/*  the context with it so the signed-in UI shows immediately, then    */
/*  let the live session take over (and self-heal if it's stale).     */
/*                                                                     */
/*  Only display fields are stored — never a token. This cache is a   */
/*  hint for rendering the shell, never proof of anything: every       */
/*  privileged read is authorized server-side against the session      */
/*  cookie, so a hand-edited entry buys nothing but a wrong avatar     */
/*  until the live session corrects it.                                */
/*                                                                     */
/*  It has nothing to offer a SIGNED-OUT visitor — there is no user    */
/*  to remember — which is why their pending state is answered from    */
/*  the server's own lookup instead (see `useEffectiveSession`).       */
/* ------------------------------------------------------------------ */
const CACHED_USER_KEY = 'rmh-auth-user';

export type CachedSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  handle?: string | null;
  username?: string | null;
  isAdmin?: boolean;
  isVerified?: boolean;
  tier?: string | null;
};

function readCachedUser(): CachedSessionUser | null {
  return readJson<CachedSessionUser | null>(CACHED_USER_KEY, null);
}

function writeCachedUser(user: CachedSessionUser | null) {
  if (user) writeJson(CACHED_USER_KEY, user);
  else removeKey(CACHED_USER_KEY);
}

/**
 * The session handed to the rest of the document: the live Better Auth session,
 * seeded by what the server resolved from the cookie (`initialUser` /
 * `sessionResolved`) and the persisted last-known user, so nothing paints
 * signed-out for a visitor who is signed in, and nothing waits on a spinner for
 * one the server already knows is signed out.
 */
export function useEffectiveSession(
  session: SessionCtxValue,
  initialUser: CachedSessionUser | null | undefined,
  sessionResolved: boolean | undefined,
): SessionCtxValue {
  // Seed the known user from the server-resolved session so the shell renders
  // signed-in on the first paint (SSR) and the first client render — matching
  // markup, no hydration mismatch, no flash. `initialUser` is authoritative
  // for that first frame because the server read the actual session cookie; we
  // only fall back to the persisted localStorage copy when the server didn't
  // provide one (e.g. a client-only render path).
  const [cachedUser, setCachedUser] = useState<CachedSessionUser | null>(initialUser ?? null);
  useEffect(() => {
    if (initialUser) return;
    // The server resolving to NOBODY is an answer, not a gap. A stale copy in
    // localStorage must not override it — that is a signed-out visitor watching
    // the shell paint signed-in and then snap back a frame later. Drop the copy
    // instead; the server just told us it is wrong.
    if (sessionResolved) {
      writeCachedUser(null);
      return;
    }
    // Only when the server could NOT resolve (failed or timed out) is the
    // persisted user the best guess available.
    const stored = readCachedUser();
    if (stored) setCachedUser(stored);
  }, [initialUser, sessionResolved]);

  // Persist the live session whenever it resolves (and clear it on sign-out).
  const liveUser = session.data?.user;
  useEffect(() => {
    if (session.isPending) return;
    if (liveUser) {
      const snapshot: CachedSessionUser = {
        id: liveUser.id,
        name: liveUser.name,
        email: liveUser.email,
        image: liveUser.image,
        handle: (liveUser as { handle?: string | null }).handle,
        username: (liveUser as { username?: string | null }).username,
        isAdmin: (liveUser as { isAdmin?: boolean }).isAdmin,
        isVerified: (liveUser as { isVerified?: boolean }).isVerified,
        tier: (liveUser as { tier?: string | null }).tier,
      };
      writeCachedUser(snapshot);
      setCachedUser(snapshot);
    } else {
      writeCachedUser(null);
      setCachedUser(null);
    }
  }, [session.isPending, liveUser]);

  // Effective session handed to the rest of the app: while the live session is
  // still loading, fall back to the persisted user so nothing flashes as
  // signed-out. Once the real session resolves it always wins.
  return useMemo<SessionCtxValue>(() => {
    if (session.isPending && cachedUser) {
      return {
        ...session,
        isPending: false,
        data: { user: cachedUser, session: null },
      } as unknown as SessionCtxValue;
    }
    // The server read the cookie and found nobody, and we have never seen a
    // live session. Signed-out is KNOWN from the first frame, so say so.
    //
    // Falling through to better-auth's raw state here is what made every
    // signed-out visit start on a spinner: its `useSession()` begins
    // `{ data: null, isPending: true }` and only settles after a network
    // round-trip, so `isPending` stayed true for a visitor the SERVER had
    // already answered for. Everything gated on it rendered its loading branch
    // and then re-rendered — the feed composer painted its full-height
    // signed-in placeholder and snapped to the short sign-in card a frame later.
    //
    // `!session.data` keeps this to the cold signed-out case: once a session
    // has ever landed, a later refetch goes through `cachedUser` above instead
    // of being reported as signed out.
    if (sessionResolved && !initialUser && session.isPending && !session.data) {
      return { ...session, isPending: false, data: null } as unknown as SessionCtxValue;
    }
    // Server couldn't resolve the session and we have no cached user: the
    // answer is UNKNOWN. Report pending (not signed out) until the client
    // session lands, so the shell shows a neutral placeholder instead of
    // telling a signed-in visitor to sign in.
    if (!sessionResolved && session.isPending && !cachedUser) {
      return { ...session, isPending: true, data: null } as unknown as SessionCtxValue;
    }
    return session;
  }, [session, cachedUser, sessionResolved, initialUser]);
}
