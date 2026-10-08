/**
 * Global mount for group voice calls.
 *
 * Split from `GroupCallOverlay` for the same reason `CallMount` is split from
 * `CallOverlay`: the signalling socket is opened exactly once, by a component
 * with no route dependency, and only for a signed-in viewer — an anonymous
 * visitor has no room to be rung into and should not open a socket at all.
 *
 * This file is deliberately almost empty. It is mounted from `Providers.tsx`,
 * which lives in the client entry chunk, so every top-level import here is
 * weight on the critical path of every page on the site — the blog, a game, a
 * legal page. The call machinery (store, mesh, overlay, invite picker) sits
 * behind the `lazy()` boundary below instead, which costs signed-in viewers one
 * round trip after hydration and anonymous viewers nothing at all.
 *
 * The delay is invisible in practice: the socket is what makes a ring arrive,
 * and it opens as soon as the surface loads, milliseconds after hydration.
 */

'use client';

import { Suspense, lazy } from 'react';
import { useSession } from '@/components/Providers';

const GroupCallSurface = lazy(() =>
  import('@/components/groupcall/GroupCallSurface').then((m) => ({ default: m.GroupCallSurface })),
);

export function GroupCallMount() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  if (!userId) return null;

  // No fallback: there is nothing to show until a call exists, and a spinner in
  // global chrome would flash on every page load.
  return (
    <Suspense fallback={null}>
      <GroupCallSurface />
    </Suspense>
  );
}
