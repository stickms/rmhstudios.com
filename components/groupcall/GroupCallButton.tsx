'use client';

/**
 * "Group call" — the ad-hoc entry point, sitting beside the 1:1 `CallButton` in a
 * DM header and on a profile.
 *
 * Same judgement as its sibling about when to disappear: it renders nothing when
 * a call could not be placed at all (signed out, yourself, a browser with no
 * WebRTC) rather than offering a control that fails on press — but while a call
 * is already running it is **disabled, not hidden**, because a control vanishing
 * mid-call reads as a bug.
 *
 * The one behavioural difference is `seedUser`. In a DM the common case is not
 * "ring these strangers", it is "this conversation, plus others", so the person
 * you are already talking to starts in the selection and the picker is there to
 * add to them. On a profile the same applies to the profile's owner.
 *
 * Who may actually be rung is still the hub's decision, per invitee, when the
 * `START` lands — this button only decides whether the control makes sense.
 */

import { useMemo, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import {
  GroupCallInviteDialog,
  type InvitablePerson,
} from '@/components/groupcall/GroupCallInviteDialog';
import { groupCallSupported } from '@/lib/groupcall/mesh';
import { isGroupCallBusy } from '@/lib/groupcall/state';
import { startGroupCall, useGroupCallStore } from '@/lib/groupcall/store';
import { cn } from '@/lib/utils';

export interface GroupCallButtonProps {
  /**
   * The signed-in viewer, so the button can hide on your own surfaces. Optional:
   * falls back to the session, so a surface that doesn't already have the
   * viewer's id doesn't have to thread one through.
   */
  viewerId?: string | null;
  /** The DM thread, when the button lives in one. Recorded on the call. */
  conversationId?: string;
  /** Pre-selected in the picker — the other half of this DM, or this profile. */
  seedUser?: InvitablePerson | null;
  /** `icon` for a conversation header, `full` for a profile action row. */
  variant?: 'icon' | 'full';
  className?: string;
}

export function GroupCallButton({
  viewerId,
  conversationId,
  seedUser,
  variant = 'icon',
  className,
}: GroupCallButtonProps) {
  const { t } = useTranslation('c-groupcall');
  const { data: session } = useSession();
  const busy = useGroupCallStore((state) => isGroupCallBusy(state));
  const [open, setOpen] = useState(false);

  const viewer = viewerId ?? session?.user?.id ?? null;
  // Memoised on the fields rather than on `seedUser` itself: every host builds
  // that object inline, so its identity changes on each of their renders and an
  // identity-keyed memo would be no memo at all.
  const seedId = seedUser?.id ?? null;
  const seedName = seedUser?.name ?? null;
  const seedHandle = seedUser?.handle ?? null;
  const seedImage = seedUser?.image ?? null;
  const seed = useMemo(
    () =>
      seedId && seedId !== viewer
        ? [{ id: seedId, name: seedName, handle: seedHandle, image: seedImage }]
        : [],
    [seedId, seedName, seedHandle, seedImage, viewer],
  );

  if (!viewer || seedUser?.id === viewer) return null;
  if (typeof window !== 'undefined' && !groupCallSupported()) return null;

  const label = t('start', { defaultValue: 'Start a group call' });

  return (
    <>
      <Button
        type="button"
        variant={variant === 'icon' ? 'ghost' : 'outline'}
        disabled={busy}
        onClick={() => setOpen(true)}
        aria-label={variant === 'icon' ? label : undefined}
        className={cn(variant === 'icon' && 'h-9 w-9 rounded-full p-0', className)}
      >
        <UsersRound className="h-4 w-4" aria-hidden />
        {variant === 'full' && <span>{label}</span>}
      </Button>
      <GroupCallInviteDialog
        open={open}
        onOpenChange={setOpen}
        seed={seed}
        onConfirm={(inviteeIds) => {
          setOpen(false);
          void startGroupCall({ origin: 'adhoc', inviteeIds, conversationId });
        }}
      />
    </>
  );
}
