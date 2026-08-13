/**
 * The whole call UI: the incoming-call prompt, the active-call bar and the
 * ended-call card.
 *
 * Mounted once, globally (`Providers.tsx`), because a call has to survive
 * navigation — answering one and then walking to another page must not hang up
 * on the person you are talking to. That rules out rendering it inside any
 * particular route.
 *
 * Shape:
 *   - **incoming** → a centred dialog, because it demands an answer now.
 *   - **outgoing / connecting / connected** → a compact bar pinned to the top,
 *     because the user should be able to keep using the site while talking.
 *   - **ended** → the bar, briefly, with the reason. Auto-dismisses.
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff, PhoneIncoming } from 'lucide-react';
import {
  useCallStore,
  acceptCall,
  declineCall,
  hangUp,
  toggleMute,
  dismissCall,
} from '@/lib/call/store';
import { formatDuration } from '@/lib/call/state';
import type { CallEndReason } from '@/lib/call/events';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** How long the ended-call card lingers before it clears itself. */
const ENDED_LINGER_MS = 4000;

function useElapsed(connectedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!connectedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);
  return connectedAt ? Math.max(0, Math.round((now - connectedAt) / 1000)) : 0;
}

function endReasonLabel(
  reason: CallEndReason | null,
  t: (k: string, o: { defaultValue: string }) => string,
): string {
  switch (reason) {
    case 'declined':
      return t('call-ended-declined', { defaultValue: 'Call declined' });
    case 'missed':
      return t('call-ended-missed', { defaultValue: 'No answer' });
    case 'busy':
      return t('call-ended-busy', { defaultValue: 'They’re on another call' });
    case 'offline':
      return t('call-ended-offline', { defaultValue: 'They’re not available' });
    case 'blocked':
    case 'privacy':
      // Deliberately identical: a caller must not be able to tell a block from
      // a privacy setting, or the block becomes detectable.
      return t('call-ended-unavailable', { defaultValue: 'Can’t call this person' });
    case 'failed':
      return t('call-ended-failed', { defaultValue: 'Couldn’t connect' });
    case 'cancelled':
      return t('call-ended-cancelled', { defaultValue: 'Call cancelled' });
    default:
      return t('call-ended', { defaultValue: 'Call ended' });
  }
}

export function CallOverlay() {
  const { t } = useTranslation('feed');
  const phase = useCallStore((s) => s.phase);
  const callId = useCallStore((s) => s.callId);
  const peer = useCallStore((s) => s.peer);
  const muted = useCallStore((s) => s.muted);
  const peerMuted = useCallStore((s) => s.peerMuted);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const endReason = useCallStore((s) => s.endReason);
  const micDenied = useCallStore((s) => s.micDenied);
  const elapsed = useElapsed(connectedAt);

  // Clear the ended card on its own so a stale "call ended" never sits there.
  useEffect(() => {
    if (phase !== 'ended') return;
    const id = setTimeout(() => dismissCall(), ENDED_LINGER_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Escape declines a ringing call — the same affordance as the button.
  useEffect(() => {
    if (phase !== 'incoming') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') declineCall();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'idle' || !peer) return null;

  const name = peer.name || peer.handle || t('someone', { defaultValue: 'Someone' });

  /* ── Incoming: a dialog, because it needs an answer now ─────────────── */
  if (phase === 'incoming') {
    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
      >
        <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => declineCall()} />
        {/* Floating UI is L4 per the design language — a menu on a blur-less
            tier ghosts against whatever is behind it. */}
        <div className="glass-overlay relative w-full max-w-sm rounded-site p-6 text-center">
          <p className="flex items-center justify-center gap-2 text-sm text-site-text-muted">
            <PhoneIncoming className="h-4 w-4" aria-hidden />
            {t('call-incoming', { defaultValue: 'Incoming voice call' })}
          </p>

          <div className="mt-5 flex flex-col items-center gap-3">
            <UserAvatar src={peer.image} alt={name} size={80} fallbackName={name} />
            <h2 id="incoming-call-title" className="text-lg font-semibold text-site-text">
              {name}
            </h2>
          </div>

          <div className="mt-7 flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="destructive"
              className="h-14 w-14 rounded-full p-0"
              onClick={() => declineCall()}
              aria-label={t('call-decline', { defaultValue: 'Decline' })}
            >
              <PhoneOff className="h-5 w-5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="accent"
              className="h-14 w-14 rounded-full p-0"
              onClick={() => void acceptCall()}
              aria-label={t('call-accept', { defaultValue: 'Accept' })}
            >
              <Phone className="h-5 w-5" aria-hidden />
            </Button>
          </div>

          <p className="mt-4 text-xs text-site-text-muted">
            {t('call-answer-hint', {
              defaultValue: 'Answering asks for microphone access.',
            })}
          </p>
        </div>
      </div>
    );
  }

  /* ── Otherwise: a bar, so the site stays usable while talking ────────── */
  // No call id yet means the server has not confirmed the invite, so it is not
  // ringing anywhere — claiming otherwise would put a phantom ring on screen for
  // a call that may be refused outright.
  const status =
    phase === 'outgoing'
      ? callId
        ? t('call-ringing', { defaultValue: 'Ringing…' })
        : t('call-dialing', { defaultValue: 'Calling…' })
      : phase === 'connecting'
        ? t('call-connecting', { defaultValue: 'Connecting…' })
        : phase === 'ended'
          ? endReasonLabel(endReason, t)
          : formatDuration(elapsed);

  return (
    // BELOW the shell's top bar, not on top of it.
    //
    // This is mounted from `Providers`, outside `.radial-shell`, so its z-120 is
    // a real body-level number and it genuinely outranks the bar's z-60. That
    // was the bug: at 390px the banner's card is 374px wide spanning y 8..60
    // while the top bar spans 0..56 with its 44px controls at y 6..50 — full
    // occlusion of brand, search, messages, notifications and avatar, for the
    // whole call, starting at DIAL time rather than on connect.
    //
    // Offset rather than restacked: reserving space would mean changing shell
    // geometry from a global provider, and this bar is transient chrome. The
    // shift is conditional on a shell actually being present, because the same
    // banner rides full-screen routes (games, login) that have no top bar —
    // `:has()` on the body, since the token lives at :root but the BAR does not.
    <div
      className="call-banner fixed inset-x-0 top-0 z-[120] flex justify-center p-2"
      style={{ paddingTop: 'max(0.5rem, var(--safe-top, 0px))' }}
    >
      <div
        className="glass-overlay flex w-full max-w-md items-center gap-3 rounded-site px-3 py-2"
        role="status"
        aria-live="polite"
      >
        <UserAvatar
          src={peer.image}
          alt={name}
          size={36}
          className="shrink-0"
          fallbackName={name}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-site-text">{name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-site-text-muted">
            <span className={cn(phase === 'connected' && 'tabular-nums')}>{status}</span>
            {peerMuted && phase === 'connected' && (
              <span className="inline-flex items-center gap-1">
                <MicOff className="h-3 w-3" aria-hidden />
                {t('call-peer-muted', { defaultValue: 'muted' })}
              </span>
            )}
          </p>
        </div>

        {phase !== 'ended' && (
          <>
            {(phase === 'connected' || phase === 'connecting') && (
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-9 rounded-full p-0"
                onClick={() => toggleMute()}
                aria-pressed={muted}
                aria-label={
                  muted
                    ? t('call-unmute', { defaultValue: 'Unmute' })
                    : t('call-mute', { defaultValue: 'Mute' })
                }
              >
                {muted ? (
                  <MicOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              className="h-9 w-9 rounded-full p-0"
              onClick={() => hangUp()}
              aria-label={t('call-hang-up', { defaultValue: 'Hang up' })}
            >
              <PhoneOff className="h-4 w-4" aria-hidden />
            </Button>
          </>
        )}
      </div>

      {micDenied && (
        <p className="glass-overlay absolute top-full mt-2 rounded-site px-3 py-2 text-xs text-site-text-muted">
          {t('call-mic-denied', {
            defaultValue: 'Microphone access was blocked. Allow it in your browser to take calls.',
          })}
        </p>
      )}
    </div>
  );
}
