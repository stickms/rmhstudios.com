/**
 * The whole call UI: the incoming-call prompt, the active-call bar and the
 * ended-call card.
 *
 * Mounted once, globally (`Providers.tsx`), because a call has to survive
 * navigation — answering one and then walking to another page must not hang up
 * on the person you are talking to. That rules out rendering it inside any
 * particular route.
 *
 * Shape — one banner pinned to the top for every phase, because the user should
 * be able to keep using the site whether a call is ringing or connected:
 *   - **incoming** → the caller, Accept / Decline, and a menu to mute that
 *     caller for a while or block them. A ringing call is announced
 *     (`role="alert"`) but never steals focus: a stray Enter on a focused
 *     Accept would open the microphone for a call the user was not reading.
 *   - **outgoing / connecting / connected** → the compact call bar.
 *   - **ended** → the bar, briefly, with the reason. Auto-dismisses.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, MoreHorizontal, Phone, PhoneOff, Mic, MicOff, PhoneIncoming } from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  useCallStore,
  acceptCall,
  declineCall,
  declineAndRestrict,
  hangUp,
  toggleMute,
  dismissCall,
  type CallRestriction,
} from '@/lib/call/store';
import { formatDuration } from '@/lib/call/state';
import { CALL_MUTE_DURATION_KEYS, type CallMuteDuration } from '@/lib/call/mute';
import type { CallEndReason } from '@/lib/call/events';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
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
  const confirm = useConfirm();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // The menu belongs to one ring. If the call ends under it (the caller hung up,
  // the ring timed out) it must not stay open over nothing.
  useEffect(() => {
    if (phase !== 'incoming') setMenuOpen(false);
  }, [phase]);

  if (phase === 'idle' || !peer) return null;

  const name = peer.name || peer.handle || t('someone', { defaultValue: 'Someone' });
  // Read once, here: the restriction applies to whoever was ringing when the
  // user opened the menu, even if the store has moved on by the time they pick.
  const peerId = peer.id;

  const durationLabel = (d: CallMuteDuration): string => {
    switch (d) {
      case '1h':
        return t('call-duration-1h', { defaultValue: '1 hour' });
      case '8h':
        return t('call-duration-8h', { defaultValue: '8 hours' });
      case '24h':
        return t('call-duration-24h', { defaultValue: '24 hours' });
      case '1w':
        return t('call-duration-1w', { defaultValue: '1 week' });
    }
  };

  async function restrict(restriction: CallRestriction) {
    const saved = await declineAndRestrict(peerId, restriction);
    if (!saved) {
      toast.error(
        t('call-restrict-failed', {
          defaultValue: 'Declined, but that could not be saved. They may be able to call again.',
        }),
      );
      return;
    }
    toast.success(
      restriction.kind === 'mute'
        ? t('call-muted-toast', {
            defaultValue: 'Muted {{name}} for {{duration}}',
            name,
            duration: durationLabel(restriction.duration),
          })
        : t('call-blocked-toast', { defaultValue: 'Blocked {{name}}', name }),
    );
  }

  async function onBlock() {
    // Block also drops follows both ways, which a mis-tap on a ringing call
    // should not do silently. The ring keeps going while the question is up.
    const ok = await confirm({
      title: t('call-block-title', { defaultValue: 'Block {{name}}?', name }),
      description: t('call-block-desc', {
        defaultValue:
          'They will not be able to call you, and you will both stop following each other.',
      }),
      confirmLabel: t('call-block-confirm', { defaultValue: 'Block' }),
      danger: true,
    });
    if (ok) await restrict({ kind: 'block' });
  }

  /* ── Incoming: a banner at the top, with room to say "not now" ──────── */
  if (phase === 'incoming') {
    return (
      <div
        className="call-banner pointer-events-none fixed inset-x-0 top-3 z-call flex justify-center p-2"
        style={{ paddingTop: 'max(0.5rem, var(--safe-top, 0px))' }}
      >
        <div
          className="surface-overlay pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-site px-3 py-2"
          role="alert"
        >
          <UserAvatar
            src={peer.image}
            alt=""
            size={40}
            className="shrink-0"
            fallbackName={name}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-site-text">{name}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-site-text-muted">
              <PhoneIncoming className="h-3 w-3 shrink-0" aria-hidden />
              {t('call-incoming', { defaultValue: 'Incoming voice call' })}
            </p>
          </div>

          <Button
            ref={moreRef}
            type="button"
            variant="ghost"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('call-more-options', { defaultValue: 'Mute or block this caller' })}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="danger"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            onClick={() => declineCall()}
            aria-label={t('call-decline', { defaultValue: 'Decline' })}
          >
            <PhoneOff className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="default"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            onClick={() => void acceptCall()}
            aria-label={t('call-accept', { defaultValue: 'Accept' })}
          >
            <Phone className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <AnchoredMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={moreRef}
          side="bottom"
          align="end"
          label={t('call-more-options', { defaultValue: 'Mute or block this caller' })}
        >
          <MenuLabel>
            {t('call-mute-heading', { defaultValue: 'Mute calls from {{name}}', name })}
          </MenuLabel>
          {CALL_MUTE_DURATION_KEYS.map((d) => (
            <MenuItem
              key={d}
              onSelect={() => {
                setMenuOpen(false);
                void restrict({ kind: 'mute', duration: d });
              }}
            >
              {t('call-mute-for', { defaultValue: 'For {{duration}}', duration: durationLabel(d) })}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={Ban}
            tone="danger"
            onSelect={() => {
              setMenuOpen(false);
              void onBlock();
            }}
          >
            {t('call-block', { defaultValue: 'Block {{name}}', name })}
          </MenuItem>
        </AnchoredMenu>
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
      className="call-banner fixed inset-x-0 top-3 z-call flex justify-center p-2"
      style={{ paddingTop: 'max(0.5rem, var(--safe-top, 0px))' }}
    >
      <div
        className="surface-overlay flex w-full max-w-md items-center gap-3 rounded-site px-3 py-2"
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
              variant="danger"
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
        <p className="surface-overlay absolute top-full mt-2 rounded-site px-3 py-2 text-xs text-site-text-muted">
          {t('call-mic-denied', {
            defaultValue: 'Microphone access was blocked. Allow it in your browser to take calls.',
          })}
        </p>
      )}
    </div>
  );
}
