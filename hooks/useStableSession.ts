'use client';

/**
 * `authClient.useSession()`, without the sign-in takeover that flashes when you
 * come back to the tab.
 *
 * ## The bug
 *
 * Better Auth's `useSession` revalidates when the document regains focus. While
 * that request is in flight — or if it fails, which a tab the browser froze and
 * thawed makes likely — the store can read `{ data: null, isPending: false }`.
 * Any UI written as the obvious
 *
 * ```tsx
 * {!session.data && !session.isPending && <SignInWall />}
 * ```
 *
 * therefore throws up a "you must sign in" takeover, mid-session, for a user
 * whose cookie is still perfectly valid — and the state clears itself a moment
 * later, which is exactly what makes it read as random.
 *
 * ## The fix, and why it is not just a latch
 *
 * A plain "once signed in, never show the wall again" latch trades a false
 * lockout for a false welcome: sign out in another tab and this one keeps
 * showing you a signed-in UI forever.
 *
 * So a null that arrives *after* we have seen a real session is treated as
 * unproven rather than as a fact. The last known-good session keeps rendering
 * while one `getSession()` goes to the server to settle it:
 *
 * - server returns a session ⇒ it was a blip; nothing was ever shown.
 * - server returns nothing ⇒ genuinely signed out; the latch drops and the
 *   wall appears, once, correctly.
 *
 * `signedOut` is therefore *proven* signed-out, never merely "not currently
 * holding a session object", and that is the only thing a takeover should key
 * on. Reads that merely decorate (an owner-only button) can keep using `data`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { authClient } from '@/lib/auth-client';

type LiveSession = ReturnType<typeof authClient.useSession>;
type SessionData = LiveSession['data'];

export interface StableSession {
  /** The last session known to be good, which outlives a revalidation blip. */
  data: SessionData;
  /** True while the very first resolution is still outstanding. */
  isPending: boolean;
  /**
   * True only once the SERVER has confirmed there is no session. This is what
   * a sign-in takeover should render on.
   */
  signedOut: boolean;
}

export function useStableSession(): StableSession {
  const live = authClient.useSession();
  const [confirmedOut, setConfirmedOut] = useState(false);

  // Not state: writing it during render is the point — the very first render
  // that sees a session must already be able to hold on to it, and a `setState`
  // here would render the gap once before closing it.
  const lastGood = useRef<SessionData>(null);
  const verifying = useRef(false);

  if (live.data) {
    lastGood.current = live.data;
    if (confirmedOut) {
      // A fresh sign-in. Re-arm so a later sign-out can be proven again.
      queueMicrotask(() => setConfirmedOut(false));
    }
  }

  const verify = useCallback(async () => {
    if (verifying.current) return;
    verifying.current = true;
    try {
      const result = await authClient.getSession();
      if (result?.data) {
        lastGood.current = result.data as SessionData;
        setConfirmedOut(false);
      } else {
        lastGood.current = null;
        setConfirmedOut(true);
      }
    } catch {
      // The network said nothing, so neither do we: a failed probe is not
      // evidence of a signed-out user, and treating it as one would put the
      // takeover back for exactly the frozen-tab case this exists to fix.
    } finally {
      verifying.current = false;
    }
  }, []);

  const hadSession = lastGood.current !== null;
  const looksSignedOut = !live.isPending && !live.data;

  useEffect(() => {
    // Only a null that CONTRADICTS a session we have already seen needs
    // settling. A visitor who was never signed in is signed out immediately,
    // with no probe and no delay.
    if (looksSignedOut && hadSession && !confirmedOut) void verify();
  }, [looksSignedOut, hadSession, confirmedOut, verify]);

  if (!hadSession) {
    return { data: null, isPending: live.isPending, signedOut: looksSignedOut };
  }

  return {
    data: confirmedOut ? null : (live.data ?? lastGood.current),
    isPending: false,
    signedOut: confirmedOut,
  };
}
