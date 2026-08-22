/**
 * The whole group-call UI: the incoming-room card, the in-call bar and the
 * ended-room notice.
 *
 * The group sibling of `components/call/CallOverlay.tsx`, and it keeps that
 * file's shape on purpose — a ring is a dialog because it demands an answer now,
 * a live call is a bar because the site has to stay usable while you talk, and
 * an ended call is the same bar for four seconds and then nothing. Mounted once,
 * globally (`GroupCallMount` → `Providers.tsx`), because a room has to ring
 * wherever the user happens to be and must survive navigating away from it.
 *
 * What is different, and all of it follows from the mesh:
 *
 *   - **The roster is the content.** A 1:1 ring says one name; a group ring has
 *     to say who is already in the room, because that is the reason to answer.
 *     `GroupCallRoster` owns it, including the per-peer connection state that
 *     has no call-level equivalent.
 *   - **The timer counts from `startedAt`, not `joinedAt`.** `startedAt` is when
 *     the ROOM opened, so two people who joined ten minutes apart see the same
 *     number — which is what a shared timer has to mean.
 *   - **The host gets one extra control**, and it lives in the expanded panel
 *     rather than beside Leave: "end for everyone" is a room-wide destructive
 *     action and must not be an icon the same size as the one that only affects
 *     you.
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  UserPlus,
} from 'lucide-react';
import {
  declineGroupCall,
  dismissGroupCall,
  endGroupCall,
  joinGroupCall,
  leaveGroupCall,
  selectIsHost,
  toggleGroupMute,
  useGroupCallStore,
} from '@/lib/groupcall/store';
import {
  durationSeconds,
  formatDuration,
  participantCount,
  pendingInvitees,
} from '@/lib/groupcall/state';
import type { GroupCallEndReason, GroupCallOrigin } from '@/lib/groupcall/events';
import { GroupCallRoster } from '@/components/groupcall/GroupCallRoster';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';

/** How long the ended-room notice lingers before it clears itself. */
const ENDED_LINGER_MS = 4000;

/** The narrow `t` shape the label helpers need, so they stay outside the component. */
type Translate = (key: string, options: { defaultValue: string }) => string;

/**
 * Seconds since the ROOM opened.
 *
 * `startedAt`, never `joinedAt`: the number in the chrome is a property of the
 * call and has to agree between everyone on it.
 */
function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return durationSeconds(startedAt, now);
}

function endReasonLabel(reason: GroupCallEndReason | null, t: Translate): string {
  switch (reason) {
    case 'host-ended':
      return t('ended-host-ended', { defaultValue: 'The host ended the call' });
    case 'left':
      return t('ended-left', { defaultValue: 'You left the call' });
    case 'empty':
      return t('ended-empty', { defaultValue: 'Everyone left' });
    case 'declined':
      return t('ended-declined', { defaultValue: 'Everyone declined' });
    case 'unanswered':
      return t('ended-unanswered', { defaultValue: 'No answer' });
    case 'failed':
      return t('ended-failed', { defaultValue: "Couldn't connect" });
    case 'full':
      return t('ended-full', { defaultValue: 'That call is full' });
    case 'gone':
      return t('ended-gone', { defaultValue: 'That call has ended' });
    case 'busy':
      return t('ended-busy', { defaultValue: "You're already on a call" });
    case 'not-member':
      return t('ended-not-member', { defaultValue: "You're not a member of this space" });
    case 'blocked':
    case 'privacy':
      // One key for two reasons, exactly as the 1:1 overlay does it: a caller
      // must not be able to tell a block from a privacy setting, and two keys
      // with identical English are two keys a translator can make differ.
      return t('ended-blocked', { defaultValue: "Can't call this person" });
    default:
      return t('ended', { defaultValue: 'Call ended' });
  }
}

/** What kind of room this is — an ad-hoc ring, or a space's open voice room. */
function originLabel(origin: GroupCallOrigin | null, t: Translate): string {
  switch (origin) {
    case 'community':
      return t('origin-community', { defaultValue: 'Community voice room' });
    case 'party':
      return t('origin-party', { defaultValue: 'Party voice room' });
    default:
      return t('title', { defaultValue: 'Group call' });
  }
}

export interface GroupCallOverlayProps {
  /**
   * Open the invite picker.
   *
   * The picker itself is not mounted from here: it needs
   * `/api/groupcalls/invitable` and a search field, and it is reachable from
   * several entry points besides this bar. So the bar raises the intent and
   * whoever mounts the overlay decides what opens — the button is simply not
   * rendered when nothing is listening, rather than sitting there inert.
   */
  onInvite?: () => void;
}

export function GroupCallOverlay({ onInvite }: GroupCallOverlayProps) {
  const { t } = useTranslation('c-groupcall');

  const phase = useGroupCallStore((s) => s.phase);
  const callId = useGroupCallStore((s) => s.callId);
  const origin = useGroupCallStore((s) => s.origin);
  const muted = useGroupCallStore((s) => s.muted);
  const startedAt = useGroupCallStore((s) => s.startedAt);
  const endReason = useGroupCallStore((s) => s.endReason);
  const ringingFrom = useGroupCallStore((s) => s.ringingFrom);
  const micDenied = useGroupCallStore((s) => s.self.micDenied);
  const isHost = useGroupCallStore(selectIsHost);
  // Scalars derived from the roster. Both are plain numbers, so they need no
  // shallow subscription — the array the helper builds never leaves the
  // selector, and a level tick that changes neither re-renders nothing.
  const joinedCount = useGroupCallStore(participantCount);
  const ringingCount = useGroupCallStore((s) => pendingInvitees(s).length);

  const elapsed = useElapsed(startedAt);
  const [rosterOpen, setRosterOpen] = useState(false);
  const rosterPanelId = useId();
  const incomingTitleId = useId();
  const incomingCardRef = useRef<HTMLDivElement | null>(null);

  // Clear the ended notice on its own so a stale "call ended" never sits there.
  useEffect(() => {
    if (phase !== 'ended') return;
    const id = setTimeout(() => dismissGroupCall(), ENDED_LINGER_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Escape declines a ringing room — the same affordance as the button.
  useEffect(() => {
    if (phase !== 'incoming') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') declineGroupCall();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // Move focus into the card so the dialog is announced and Escape reaches it.
  // The CARD takes focus, never Accept: a stray Return keystroke that lands the
  // instant a room starts ringing must not answer it.
  useEffect(() => {
    if (phase === 'incoming') incomingCardRef.current?.focus();
  }, [phase]);

  // A room that ends while the panel is open should not reopen it on the next
  // call, and the panel has nothing to show once the mesh is gone.
  useEffect(() => {
    if (phase === 'idle' || phase === 'ended') setRosterOpen(false);
  }, [phase]);

  if (phase === 'idle') return null;

  /* ── Incoming: a dialog, because it needs an answer now ─────────────────── */
  if (phase === 'incoming') {
    const callerName = ringingFrom?.name || ringingFrom?.handle || null;

    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={incomingTitleId}
      >
        <div
          className="absolute inset-0 bg-black/50"
          aria-hidden
          onClick={() => declineGroupCall()}
        />
        {/* Floating UI is L4 per the design language — a card on a blur-less
            tier ghosts against whatever is behind it. */}
        <div
          ref={incomingCardRef}
          tabIndex={-1}
          className="glass-overlay relative w-full max-w-sm rounded-site p-6 outline-none"
        >
          <p className="flex items-center justify-center gap-2 text-sm text-site-text-muted">
            <PhoneIncoming className="h-4 w-4" aria-hidden />
            {t('incoming', { defaultValue: 'Incoming group call' })}
          </p>

          <div className="mt-5 flex flex-col items-center gap-3 text-center">
            {ringingFrom && (
              <UserAvatar
                src={ringingFrom.image}
                alt=""
                size={80}
                fallbackName={callerName ?? undefined}
              />
            )}
            <h2 id={incomingTitleId} className="text-lg font-semibold text-site-text">
              {callerName
                ? t('incoming-from', {
                    name: callerName,
                    defaultValue: '{{name}} is calling',
                  })
                : originLabel(origin, t)}
            </h2>
            <p className="text-xs text-site-text-muted">{originLabel(origin, t)}</p>
          </div>

          <GroupCallRoster
            className="mt-5"
            layout="list"
            excludeUserId={ringingFrom?.id ?? null}
            heading={
              <p className="text-xs font-medium uppercase tracking-wide text-site-text-muted">
                {t('incoming-roster', { defaultValue: 'Already in this call' })}
              </p>
            }
          />

          <div className="mt-7 flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="destructive"
              className="h-14 w-14 rounded-full p-0"
              onClick={() => declineGroupCall()}
              aria-label={t('decline', { defaultValue: 'Decline' })}
            >
              <PhoneOff className="h-5 w-5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="accent"
              className="h-14 w-14 rounded-full p-0"
              onClick={() => callId && void joinGroupCall(callId)}
              aria-label={t('accept', { defaultValue: 'Accept' })}
            >
              <Phone className="h-5 w-5" aria-hidden />
            </Button>
          </div>

          <p className="mt-4 text-center text-xs text-site-text-muted">
            {micDenied
              ? t('mic-denied', {
                  defaultValue:
                    'Microphone access was blocked. Allow it in your browser to join calls.',
                })
              : t('answer-hint', { defaultValue: 'Answering asks for microphone access.' })}
          </p>
        </div>
      </div>
    );
  }

  /* ── Otherwise: a bar, so the site stays usable while talking ───────────── */
  const status =
    phase === 'joining'
      ? t('joining', { defaultValue: 'Joining…' })
      : phase === 'ended'
        ? endReasonLabel(endReason, t)
        : formatDuration(elapsed);

  /*
   * The one thing that announces.
   *
   * Coarse, call-level, and it changes at most three times in a call's life.
   * Everything the roster carries — who joined, who muted, who is talking, whose
   * leg is reconnecting — is deliberately outside it: in a room of eight that is
   * a continuous stream, and a live region reading it aloud makes the call
   * unusable rather than more accessible.
   */
  const announcement =
    phase === 'joining'
      ? t('joining', { defaultValue: 'Joining…' })
      : phase === 'ended'
        ? endReasonLabel(endReason, t)
        : t('in-call', { defaultValue: "You're in the call" });

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center px-2"
      style={{ paddingTop: 'max(0.5rem, var(--safe-top, 0px))' }}
    >
      <div className="pointer-events-auto w-full max-w-lg">
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        <div className="glass-chrome flex items-center gap-2 rounded-site px-2.5 py-2">
          <GroupCallRoster layout="strip" includeSelf max={4} className="shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-site-text">{originLabel(origin, t)}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-site-text-muted">
              <span
                className={cn(phase === 'active' && 'tabular-nums')}
                role={phase === 'active' ? 'timer' : undefined}
                aria-label={
                  phase === 'active'
                    ? t('call-duration', { defaultValue: 'Call duration' })
                    : undefined
                }
              >
                {status}
              </span>
              {phase === 'active' && ringingCount > 0 && (
                <span className="truncate">
                  ·{' '}
                  {t('ringing-count', {
                    count: ringingCount,
                    defaultValue_one: '{{count}} still ringing',
                    defaultValue_other: '{{count}} still ringing',
                    defaultValue: '{{count}} still ringing',
                  })}
                </span>
              )}
            </p>
          </div>

          {phase !== 'ended' && (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-9 rounded-full p-0"
                onClick={() => toggleGroupMute()}
                aria-pressed={muted}
                aria-label={
                  muted
                    ? t('unmute', { defaultValue: 'Unmute' })
                    : t('mute', { defaultValue: 'Mute' })
                }
              >
                {muted ? (
                  <MicOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
              </Button>

              {phase === 'active' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1 rounded-full px-2"
                  onClick={() => setRosterOpen((open) => !open)}
                  aria-expanded={rosterOpen}
                  aria-controls={rosterPanelId}
                >
                  <span className="text-xs tabular-nums">
                    {t('participants', {
                      count: joinedCount,
                      defaultValue_one: '{{count}} person',
                      defaultValue_other: '{{count}} people',
                      defaultValue: '{{count}} people',
                    })}
                  </span>
                  {rosterOpen ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              )}

              <Button
                type="button"
                variant="destructive"
                className="h-9 w-9 rounded-full p-0"
                onClick={() => leaveGroupCall()}
                aria-label={t('leave', { defaultValue: 'Leave' })}
              >
                <PhoneOff className="h-4 w-4" aria-hidden />
              </Button>
            </>
          )}
        </div>

        {phase === 'active' && rosterOpen && (
          <div id={rosterPanelId} className="glass-overlay mt-2 rounded-site p-2">
            <GroupCallRoster layout="list" includeSelf />
            {(onInvite || isHost) && (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                {onInvite && (
                  <Button type="button" variant="secondary" size="sm" onClick={onInvite}>
                    <UserPlus className="h-4 w-4" aria-hidden />
                    {t('invite', { defaultValue: 'Invite' })}
                  </Button>
                )}
                {isHost && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => endGroupCall()}
                  >
                    {t('end-for-everyone', { defaultValue: 'End for everyone' })}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {micDenied && (
          <p className="glass-overlay mt-2 rounded-site px-3 py-2 text-xs text-site-text-muted">
            {t('mic-denied', {
              defaultValue:
                'Microphone access was blocked. Allow it in your browser to join calls.',
            })}
          </p>
        )}
      </div>
    </div>
  );
}
