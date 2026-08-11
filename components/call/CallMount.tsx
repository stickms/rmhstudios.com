/**
 * Global mount for voice calls.
 *
 * Split from `CallOverlay` so the signalling socket is opened exactly once, by
 * a component with no props and no route dependency, and only for a signed-in
 * viewer — an anonymous visitor has nobody to call and nothing to be called by,
 * and should not open a socket at all.
 *
 * Both dependencies are reached through `import()`, not a static import, and
 * that is the load-bearing part. `CallMount` is rendered by `Providers`, so it
 * is in *every* page's static graph; `lib/call/store` pulls in
 * `socket.io-client` (40 KB raw). Statically importing it meant every visitor —
 * including the anonymous ones this component deliberately does nothing for —
 * downloaded, parsed and executed the socket library before hydration could
 * finish. Guarding the *call* while leaving the *import* static saves nothing:
 * an import is paid at load time, not at call time.
 */

'use client';

import { Suspense, lazy, useEffect } from 'react';
import { useSession } from '@/components/Providers';

// Lazy so the overlay's own tree (and, through the store, socket.io-client)
// stays out of the shared entry chunk. Anonymous viewers never render it, so
// they never fetch it.
const CallOverlay = lazy(() =>
  import('@/components/call/CallOverlay').then((m) => ({ default: m.CallOverlay })),
);

export function CallMount() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Dynamic so socket.io-client is fetched only for a viewer who can actually
    // receive a call. The cancel flag covers a sign-out (or unmount) that lands
    // while the chunk is still in flight — without it, `initCalls()` would open
    // a socket for a session that no longer exists.
    void import('@/lib/call/store').then(({ initCalls }) => {
      if (!cancelled) initCalls();
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;
  return (
    <Suspense fallback={null}>
      <CallOverlay />
    </Suspense>
  );
}
