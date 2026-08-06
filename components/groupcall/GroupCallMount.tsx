/**
 * Global mount for group voice calls.
 *
 * Split from `GroupCallOverlay` for the same reason `CallMount` is split from
 * `CallOverlay`: the signalling socket is opened exactly once, by a component
 * with no route dependency, and only for a signed-in viewer — an anonymous
 * visitor has no room to be rung into and should not open a socket at all.
 *
 * `initGroupCalls()` is idempotent and no-ops on a browser without WebRTC, so
 * calling it on every page is safe; an ad-hoc room has to be able to ring
 * somebody who is reading the blog.
 */

'use client';

import { useEffect } from 'react';
import { useSession } from '@/components/Providers';
import { initGroupCalls } from '@/lib/groupcall/store';
import { GroupCallOverlay } from '@/components/groupcall/GroupCallOverlay';

export interface GroupCallMountProps {
  /**
   * Open the invite picker from the in-call panel.
   *
   * Forwarded to the overlay. The picker is not mounted here because it is a
   * search-backed dialog (`/api/groupcalls/invitable`) reachable from several
   * entry points, so it is wired in by whoever owns those — until then the
   * in-call Invite button is simply absent rather than inert.
   */
  onInvite?: () => void;
}

export function GroupCallMount({ onInvite }: GroupCallMountProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    initGroupCalls();
  }, [userId]);

  if (!userId) return null;
  return <GroupCallOverlay onInvite={onInvite} />;
}
