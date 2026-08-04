/**
 * Global mount for voice calls.
 *
 * Split from `CallOverlay` so the signalling socket is opened exactly once, by
 * a component with no props and no route dependency, and only for a signed-in
 * viewer — an anonymous visitor has nobody to call and nothing to be called by,
 * and should not open a socket at all.
 */

'use client';

import { useEffect } from 'react';
import { useSession } from '@/components/Providers';
import { initCalls } from '@/lib/call/store';
import { CallOverlay } from '@/components/call/CallOverlay';

export function CallMount() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    initCalls();
  }, [userId]);

  if (!userId) return null;
  return <CallOverlay />;
}
