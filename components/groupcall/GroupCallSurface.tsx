/**
 * Everything a group call needs on screen, loaded on demand.
 *
 * Split out of `GroupCallMount` for one reason: `Providers.tsx` is in the
 * client entry chunk, so anything it imports at top level is downloaded and
 * parsed on every page of the site before it can hydrate — including pages
 * with no call on them, by people who never place one. The store, the overlay
 * and the invite picker are all only reachable once a call exists, so they
 * belong behind a dynamic import.
 *
 * `GroupCallMount` keeps the session check and the `React.lazy` boundary; this
 * file keeps the behaviour. Splitting them this way costs one round trip after
 * hydration for signed-in viewers and nothing at all for anonymous ones.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initGroupCalls, inviteToGroupCall, useGroupCallStore } from '@/lib/groupcall/store';
import { GroupCallOverlay } from '@/components/groupcall/GroupCallOverlay';
import { GroupCallInviteDialog } from '@/components/groupcall/GroupCallInviteDialog';
import { MAX_GROUP_CALL_PARTICIPANTS } from '@/lib/groupcall/events';

export function GroupCallSurface() {
  const { t } = useTranslation('c-groupcall');
  const [inviteOpen, setInviteOpen] = useState(false);

  // A number, not the roster — this subscribes on every page in the app, and a
  // record selector would re-render the whole tree on every mute.
  //
  // Counting the WHOLE roster rather than the joined part is what keeps the
  // picker honest: the hub charges a ringing invitee a slot until they answer
  // or time out, so offering seats it would refuse would let someone pick
  // people who then silently vanish from the invite.
  const rosterSize = useGroupCallStore((s) => Object.keys(s.participants).length);
  const remaining = Math.max(0, MAX_GROUP_CALL_PARTICIPANTS - rosterSize);

  // Mounting this component IS the decision to be reachable, so the socket
  // opens here. `initGroupCalls()` is idempotent and no-ops without WebRTC.
  useEffect(() => {
    initGroupCalls();
  }, []);

  const openInvite = useCallback(() => setInviteOpen(true), []);
  const confirmInvite = useCallback((ids: string[]) => {
    inviteToGroupCall(ids);
    setInviteOpen(false);
  }, []);

  return (
    <>
      <GroupCallOverlay onInvite={remaining > 0 ? openInvite : undefined} />
      {inviteOpen && (
        <GroupCallInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          max={remaining}
          confirmLabel={t('invite', { defaultValue: 'Invite' })}
          onConfirm={confirmInvite}
        />
      )}
    </>
  );
}
