'use client';

/**
 * The room: open one, join one, see who is in it.
 *
 * This is the only screen in the game with a text field, which makes it the
 * only one that has to care about the software keyboard (§12.1 rule 5). It is a
 * **document** (`.app-page` via the root), so the browser can scroll it — the
 * keyboard is not covering something unreachable. `useKeyboardInset` is mounted
 * anyway and spent as bottom padding, so the field is never the last row under
 * the keyboard's edge, and two smaller rules travel with it: no `autoFocus` on
 * a coarse pointer (raising the keyboard for something nobody asked for), and
 * `inputMode`/`autoCapitalize` set so a six-character code gets the right
 * keyboard rather than a predictive one that fights it.
 *
 * A room CODE is safe in a URL — it grants nothing a stranger could not ask for
 * — which is why the invite link carries one. A party TICKET is a bearer secret
 * and travels through router state; this screen never puts one in a link.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, DoorOpen, Link2, Play, Users } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { ConnectionBanner } from '@/components/shared/ConnectionStatus';
import { ROOM_CODE_RE, type LobbyState } from '@/lib/bums-rush/net';
import { NET_LIMITS } from '@/lib/bums-rush/constants';
import type { SeatIndex } from '@/lib/bums-rush/types';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { PaperCard, StickyNote } from '../paper/PaperSurface';
import { InkButton, SeatMark } from '../paper/InkControls';
import { useCoarsePointerOnly } from '../hooks';
import { ScreenFrame } from './ScreenFrame';

interface LobbyProps {
  state: LobbyState;
  status: RealtimeStatus;
  initialCode: string | null;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onReady: (seat: SeatIndex, ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onRetryConnection: () => void;
  onBack: () => void;
}

export function Lobby({
  state,
  status,
  initialCode,
  onCreate,
  onJoin,
  onReady,
  onStart,
  onLeave,
  onRetryConnection,
  onBack,
}: LobbyProps) {
  const { t } = useTranslation('c-bums-rush');
  const coarse = useCoarsePointerOnly();
  const { copied, copy } = useClipboard();
  const [code, setCode] = useState(initialCode ?? '');
  useKeyboardInset();

  const room = state.room;
  const valid = ROOM_CODE_RE.test(code.trim().toUpperCase());
  const inviteUrl =
    room && typeof window !== 'undefined'
      ? `${window.location.origin}/bums-rush?room=${room.code}`
      : '';

  return (
    <ScreenFrame
      title={
        room
          ? t('lobby.room-title', { defaultValue: 'Room {{code}}', code: room.code })
          : t('lobby.title', { defaultValue: 'Play with friends' })
      }
      width="medium"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
    >
      {/*
        The shared banner, not a hand-rolled one. Writing another connection
        strip is exactly the drift `components/shared/` exists to prevent.
      */}
      <ConnectionBanner status={status} onRetry={onRetryConnection} className="mb-4" />

      <div
        className="space-y-[clamp(0.75rem,2vmin,1.25rem)]"
        style={{ paddingBottom: 'var(--kb-inset, 0px)' }}
      >
        {!room ? (
          <>
            <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
              <h2 className="text-lg font-semibold text-bum-ink">
                {t('lobby.open', { defaultValue: 'Open a room' })}
              </h2>
              <p className="mt-1 text-sm text-bum-graphite">
                {t('lobby.open-blurb', {
                  defaultValue: 'You get a six-character code and a link. Up to four of you.',
                })}
              </p>
              <InkButton variant="primary" size="lg" className="mt-4" onClick={onCreate}>
                <DoorOpen className="size-4" aria-hidden="true" />
                {t('lobby.create', { defaultValue: 'Open a room' })}
              </InkButton>
            </PaperCard>

            <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
              <h2 className="text-lg font-semibold text-bum-ink">
                {t('lobby.join', { defaultValue: 'Join a room' })}
              </h2>
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (valid) onJoin(code.trim().toUpperCase());
                }}
              >
                <div className="min-w-0 flex-1">
                  <label htmlFor="bums-room-code" className="block text-sm font-medium text-bum-ink">
                    {t('lobby.code-label', { defaultValue: 'Room code' })}
                  </label>
                  <input
                    id="bums-room-code"
                    value={code}
                    onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
                    maxLength={NET_LIMITS.MAX_CODE_LEN}
                    // A code is letters and digits, so `text` with autocapitalise
                    // and autocorrect off — `numeric` would be a lie and would
                    // hide half the characters behind a keyboard switch.
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    // Never on a touch device: raising the keyboard for a field
                    // the player has not tapped is how a screen loses 40% of
                    // itself to something nobody asked for.
                    autoFocus={!coarse && !initialCode}
                    placeholder="ABC123"
                    className="mt-1 w-full rounded-bum border-2 border-bum-ink bg-bum-surface px-3 py-2 text-lg tracking-[0.3em] uppercase text-bum-ink"
                  />
                </div>
                <InkButton type="submit" variant="primary" disabled={!valid}>
                  <Users className="size-4" aria-hidden="true" />
                  {t('lobby.join-cta', { defaultValue: 'Join' })}
                </InkButton>
              </form>
              {state.lastError ? (
                <p className="mt-3 text-sm text-bum-danger" role="alert">
                  {t('lobby.error', {
                    defaultValue: 'That did not work: {{code}}',
                    code: state.lastError.code,
                  })}
                </p>
              ) : null}
            </PaperCard>
          </>
        ) : (
          <>
            <PaperCard tilt={-0.7} taped className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
              <p className="text-xs tracking-wide text-bum-graphite uppercase">
                {t('lobby.code-label', { defaultValue: 'Room code' })}
              </p>
              <p
                className="font-bold tracking-[0.25em] text-bum-ink"
                style={{ fontSize: 'clamp(1.75rem, 7vmin, 3rem)' }}
              >
                {room.code}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <InkButton size="sm" onClick={() => void copy(room.code)}>
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  {t('lobby.copy-code', { defaultValue: 'Copy code' })}
                </InkButton>
                {inviteUrl ? (
                  <InkButton size="sm" onClick={() => void copy(inviteUrl)}>
                    <Link2 className="size-4" aria-hidden="true" />
                    {t('lobby.copy-link', { defaultValue: 'Copy invite link' })}
                  </InkButton>
                ) : null}
              </div>
            </PaperCard>

            <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
              <h2 className="text-lg font-semibold text-bum-ink">
                {t('lobby.seats', { defaultValue: 'Who is here' })}
              </h2>
              <ul className="mt-3 space-y-2">
                {room.seats.map((seat) => {
                  const mine = state.mySeats.includes(seat.seat);
                  return (
                    <li
                      key={seat.seat}
                      className="flex flex-wrap items-center gap-2 rounded-bum border border-bum-paper-edge bg-bum-surface-2 px-3 py-2"
                    >
                      <SeatMark seat={seat.seat} className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-bum-ink">
                        {seat.name}
                      </span>
                      {seat.ready ? (
                        <span className="bg-bum-highlight px-1 text-xs text-bum-ink">
                          {t('lobby.ready', { defaultValue: 'Ready' })}
                        </span>
                      ) : null}
                      {mine ? (
                        <InkButton size="sm" onClick={() => onReady(seat.seat, !seat.ready)}>
                          {seat.ready
                            ? t('lobby.unready', { defaultValue: 'Wait' })
                            : t('lobby.set-ready', { defaultValue: "I'm ready" })}
                        </InkButton>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {room.seats.length < 2 ? (
                <StickyNote className="mt-4 rotate-[-0.9deg]">
                  {t('lobby.waiting', {
                    defaultValue: 'Send the link. Anyone who arrives is drawn straight in, even mid-level.',
                  })}
                </StickyNote>
              ) : null}
            </PaperCard>

            <div className="flex flex-wrap gap-3">
              {state.amHost ? (
                <InkButton variant="primary" size="lg" onClick={onStart}>
                  <Play className="size-4" aria-hidden="true" />
                  {t('lobby.start', { defaultValue: 'Start' })}
                </InkButton>
              ) : (
                <p className="text-sm text-bum-graphite">
                  {t('lobby.host-starts', { defaultValue: 'Waiting for the host to start.' })}
                </p>
              )}
              <InkButton variant="danger" onClick={onLeave}>
                {t('lobby.leave', { defaultValue: 'Leave the room' })}
              </InkButton>
            </div>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}
