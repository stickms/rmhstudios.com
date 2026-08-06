'use client';

/**
 * The open-room affordance for a community or a party.
 *
 * An open room is not a ring: nobody is called, eligible members simply walk in.
 * So this is a *presence* surface first — "there is a conversation happening in
 * here, and these many people are in it" — and a control second. It follows the
 * shape `LiveNowRail` established for liveness: ask, render nothing until there
 * is an answer, and never leave empty chrome behind.
 *
 * Three states, and the difference between the first two is the whole reason
 * `rooms` distinguishes `undefined` from `null`:
 *
 *  - **never looked up** (`undefined`) — render nothing. A "Start voice" button
 *    that appears a beat before the "Join 3 people" it should have been is worse
 *    than a beat of nothing.
 *  - **no room** (`null`) — offer to open one.
 *  - **a live room** — say who is in it and offer the way in.
 *
 * `START` on an open origin is create-or-join server-side, so two people pressing
 * "Start voice" in the same second get the same room rather than two. There is
 * deliberately no client-side guard against that race: the guard would be a lie,
 * since it can only see this tab.
 *
 * Membership is the host surface's business — this renders wherever it is put.
 * `CommunityColumn` only mounts it for members and `PartyBar` only when a party
 * exists; the hub checks again with `canJoinOpenRoom` before admitting anyone.
 */

import { useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { AsyncReveal } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MAX_GROUP_CALL_PARTICIPANTS, type OpenRoomOrigin } from '@/lib/groupcall/events';
import { groupCallSupported } from '@/lib/groupcall/mesh';
import { isGroupCallBusy } from '@/lib/groupcall/state';
import {
  joinGroupCall,
  lookupOpenRoom,
  selectOpenRoom,
  startGroupCall,
  useGroupCallStore,
} from '@/lib/groupcall/store';
import { cn } from '@/lib/utils';

export interface VoiceRoomBannerProps {
  origin: OpenRoomOrigin;
  /** Community id or party id. */
  originId: string;
  /** The host surface's own rhythm — the separator and padding it lives in. */
  className?: string;
}

/** How many faces the stack shows before it stops. */
const MAX_FACES = 4;

export function VoiceRoomBanner({ origin, originId, className }: VoiceRoomBannerProps) {
  const { t } = useTranslation('c-groupcall');
  const { data: session } = useSession();
  const room = useGroupCallStore((state) => selectOpenRoom(state, { origin, originId }));
  const connection = useGroupCallStore((state) => state.connection);
  const busy = useGroupCallStore((state) => isGroupCallBusy(state));
  const activeCallId = useGroupCallStore((state) => state.callId);

  useEffect(() => {
    // Asked on mount (which also connects the socket) and again every time the
    // transport settles: a reconnect hands us a new socket that is not in the
    // origin's presence room yet, so whatever `rooms` holds is from before the
    // drop and may name a room that has since closed.
    if (connection === 'connecting' || connection === 'reconnecting') return;
    lookupOpenRoom({ origin, originId });
  }, [origin, originId, connection]);

  const viewer = session?.user?.id ?? null;
  // Same rule as `CallButton`: a control that could never work is not shown at
  // all. Everything else — already in a call, room full — disables instead.
  if (!viewer) return null;
  if (typeof window !== 'undefined' && !groupCallSupported()) return null;

  const inThisRoom = Boolean(room && activeCallId === room.callId);
  const faces = room?.participants.slice(0, MAX_FACES) ?? [];

  return (
    <AsyncReveal
      show={room !== undefined}
      as="section"
      className={cn('flex flex-wrap items-center gap-3', className)}
      aria-label={t('voice-room', { defaultValue: 'Voice room' })}
    >
      <Volume2 className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-site-text">
          {t('voice-room', { defaultValue: 'Voice room' })}
        </p>
        <p className="truncate text-xs text-site-text-muted">
          {!room
            ? t('voice-room-empty', { defaultValue: 'No one is talking yet' })
            : room.full
              ? t('room-full', {
                  max: MAX_GROUP_CALL_PARTICIPANTS,
                  defaultValue: 'This call is full — it holds up to {{max}} people.',
                })
              : t('participants', {
                  count: room.participantCount,
                  defaultValue: '{{count}} person',
                  defaultValue_other: '{{count}} people',
                })}
        </p>
      </div>

      {faces.length > 0 && (
        <div className="flex -space-x-2" aria-hidden>
          {faces.map((participant) => (
            <UserAvatar
              key={participant.userId}
              src={participant.image ?? undefined}
              alt=""
              size={24}
              fallbackName={participant.name}
              className="ring-2 ring-site-bg"
            />
          ))}
        </div>
      )}

      {inThisRoom ? (
        <span className="shrink-0 text-xs font-medium text-site-accent">
          {t('voice-room-joined', { defaultValue: "You're in" })}
        </span>
      ) : room ? (
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={busy || room.full}
          onClick={() => void joinGroupCall(room.callId)}
        >
          {t('join-voice', { defaultValue: 'Join voice' })}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void startGroupCall({ origin, originId })}
        >
          {t('start-voice', { defaultValue: 'Start voice' })}
        </Button>
      )}
    </AsyncReveal>
  );
}
