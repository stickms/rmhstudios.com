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

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { initGroupCalls, inviteToGroupCall, useGroupCallStore } from '@/lib/groupcall/store';
import { GroupCallOverlay } from '@/components/groupcall/GroupCallOverlay';
import { GroupCallInviteDialog } from '@/components/groupcall/GroupCallInviteDialog';
import { MAX_GROUP_CALL_PARTICIPANTS } from '@/lib/groupcall/events';

export function GroupCallMount() {
  const { t } = useTranslation('c-groupcall');
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
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

  useEffect(() => {
    if (!userId) return;
    initGroupCalls();
  }, [userId]);

  const openInvite = useCallback(() => setInviteOpen(true), []);
  const confirmInvite = useCallback((ids: string[]) => {
    inviteToGroupCall(ids);
    setInviteOpen(false);
  }, []);

  if (!userId) return null;

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
