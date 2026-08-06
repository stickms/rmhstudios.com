'use client';

/**
 * The versus lobby, and the public-lobby browser that feeds it.
 *
 * Host owns the rules (length, difficulty, visibility) and the start; everyone
 * else readies up. Changing a rule clears every ready flag server-side, because
 * a ready was consent to the rules as they stood.
 */

import { useTranslation } from 'react-i18next';
import { Check, Copy, Crown, Link2, LogOut, Play, RefreshCw, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useLobbyLink } from '@/hooks/useLobbyLink';
import {
  DIFFICULTIES,
  MATCH_DURATIONS,
  type Difficulty,
  type MatchDuration,
} from '@/lib/laundry-sort/constants';
import { useLaundryStore } from '@/lib/laundry-sort/store';
import { laundryNet } from '@/lib/laundry-sort/net/client';
import { WashLegend } from './WashLegend';

/** Minimum seats before the host may start — a race of one is not a race. */
const MIN_PLAYERS = 2;

export function LobbyPanel({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation('c-laundry-sort');
  const lobby = useLaundryStore((s) => s.lobby);
  const selfSocketId = useLaundryStore((s) => s.selfSocketId);
  const countdown = useLaundryStore((s) => s.countdown);
  const error = useLaundryStore((s) => s.error);
  const { copied: linkCopied, copyLink } = useLobbyLink({ code: lobby?.code });

  if (!lobby) return null;

  const isHost = lobby.hostSocketId === selfSocketId;
  const me = lobby.players.find((p) => p.socketId === selfSocketId);
  const everyoneReady = lobby.players.every((p) => p.isHost || p.ready);
  const canStart = isHost && lobby.players.length >= MIN_PLAYERS && everyoneReady;

  const difficultyLabel: Record<Difficulty, string> = {
    relaxed: t('difficulty-relaxed', { defaultValue: 'Relaxed' }),
    standard: t('difficulty-standard', { defaultValue: 'Standard' }),
    frantic: t('difficulty-frantic', { defaultValue: 'Frantic' }),
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      toast.success(t('code-copied', { defaultValue: 'Room code copied' }));
    } catch {
      // Clipboard is permission-gated and blocked outright in some embedded
      // webviews; the code is on screen either way.
      toast.message(lobby.code);
    }
  };

  const copyInviteLink = async () => {
    if (await copyLink()) {
      toast.success(t('link-copied', { defaultValue: 'Invite link copied' }));
    } else {
      toast.error(t('copy-link-failed', { defaultValue: 'Could not copy the link.' }));
    }
  };

  return (
    <div className="ls-overlay z-40 bg-black/60 backdrop-blur-[2px]">
      <div className="mx-auto grid min-h-full w-full content-center max-w-3xl gap-3 p-3 sm:p-6">
        <div className="ls-panel-strong space-y-4 p-4 sm:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ls-muted text-[11px] font-semibold uppercase tracking-widest">
                {t('room-code', { defaultValue: 'Room code' })}
              </p>
              <div className="flex items-center gap-2">
                <span className="ls-numeric text-2xl font-black tracking-[0.3em]">
                  {lobby.code}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={copyCode}
                  aria-label={t('copy-code', { defaultValue: 'Copy room code' })}
                >
                  <Copy className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={copyInviteLink}
                  aria-label={t('copy-invite-link', { defaultValue: 'Copy invite link' })}
                >
                  {linkCopied ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Link2 className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>

            <Button variant="ghost" onClick={onLeave}>
              <LogOut className="size-4" aria-hidden="true" />
              {t('leave-lobby', { defaultValue: 'Leave' })}
            </Button>
          </header>

          {countdown !== null ? (
            <p
              className="ls-accent text-center text-4xl font-black"
              role="status"
              aria-live="assertive"
            >
              {countdown}
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {lobby.players.map((player) => (
              <li
                key={player.socketId}
                className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2.5 py-2 text-sm"
              >
                <UserAvatar
                  src={player.avatarUrl}
                  alt=""
                  fallbackName={player.name}
                  size={24}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {player.name}
                  {player.socketId === selfSocketId ? (
                    <span className="ls-muted ml-1 text-xs">
                      {t('you-suffix', { defaultValue: '(you)' })}
                    </span>
                  ) : null}
                </span>
                {player.isHost ? (
                  <Crown
                    className="size-4 shrink-0 text-[var(--ls-warn)]"
                    aria-label={t('host', { defaultValue: 'Host' })}
                  />
                ) : player.ready ? (
                  <Check
                    className="size-4 shrink-0 text-[var(--ls-accent)]"
                    aria-label={t('ready', { defaultValue: 'Ready' })}
                  />
                ) : (
                  <span className="ls-muted shrink-0 text-[11px]">
                    {t('not-ready', { defaultValue: 'Not ready' })}
                  </span>
                )}
                {isHost && !player.isHost ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => laundryNet.kick(player.socketId)}
                    aria-label={t('kick-player', {
                      defaultValue: 'Remove {{name}}',
                      name: player.name,
                    })}
                  >
                    <UserX className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="ls-muted text-[11px] font-semibold uppercase tracking-widest">
                {t('round-length', { defaultValue: 'Round length' })}
              </p>
              <LiquidTabs
                tabs={MATCH_DURATIONS.map((d) => ({
                  id: String(d),
                  label: t('seconds-short', { defaultValue: '{{count}}s', count: d }),
                  disabled: !isHost,
                }))}
                value={String(lobby.durationSec)}
                onChange={(id) => laundryNet.settings({ durationSec: Number(id) as MatchDuration })}
                aria-label={t('round-length', { defaultValue: 'Round length' })}
              />
            </div>
            <div className="space-y-1.5">
              <p className="ls-muted text-[11px] font-semibold uppercase tracking-widest">
                {t('difficulty', { defaultValue: 'Difficulty' })}
              </p>
              <LiquidTabs
                tabs={DIFFICULTIES.map((d) => ({
                  id: d,
                  label: difficultyLabel[d],
                  disabled: !isHost,
                }))}
                value={lobby.difficulty}
                onChange={(id) => laundryNet.settings({ difficulty: id })}
                aria-label={t('difficulty', { defaultValue: 'Difficulty' })}
              />
            </div>
          </div>

          <WashLegend compact />

          {error ? (
            <p className="text-center text-xs text-[var(--ls-danger)]" role="alert">
              {lobbyErrorMessage(error, t)}
            </p>
          ) : null}

          {isHost ? (
            <div className="space-y-2">
              <Button
                onClick={() => laundryNet.start()}
                disabled={!canStart || countdown !== null}
                size="lg"
                className="w-full"
              >
                <Play className="size-4" aria-hidden="true" />
                {t('start-race', { defaultValue: 'Start race' })}
              </Button>
              {lobby.players.length < MIN_PLAYERS ? (
                <p className="ls-muted text-center text-xs">
                  {t('waiting-for-players', {
                    defaultValue: 'Share the code — a race needs at least two people.',
                  })}
                </p>
              ) : !everyoneReady ? (
                <p className="ls-muted text-center text-xs">
                  {t('waiting-for-ready', { defaultValue: 'Waiting for everyone to ready up.' })}
                </p>
              ) : null}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => laundryNet.settings({ isPublic: !lobby.isPublic })}
              >
                {lobby.isPublic
                  ? t('make-private', { defaultValue: 'Make private' })
                  : t('make-public', { defaultValue: 'Make public' })}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => laundryNet.ready(!me?.ready)}
              variant={me?.ready ? 'outline' : 'default'}
              size="lg"
              className="w-full"
              disabled={countdown !== null}
            >
              <Check className="size-4" aria-hidden="true" />
              {me?.ready
                ? t('cancel-ready', { defaultValue: 'Not ready' })
                : t('ready-up', { defaultValue: 'Ready up' })}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Public-lobby browser. Separate screen, same connection. */
export function BrowsePanel({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('c-laundry-sort');
  const lobbies = useLaundryStore((s) => s.publicLobbies);
  const browsing = useLaundryStore((s) => s.browsing);

  return (
    <div className="ls-overlay z-40 bg-black/60 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full w-full flex-col justify-center max-w-2xl p-3 sm:p-6">
        <div className="ls-panel-strong space-y-3 p-4 sm:p-6">
          <header className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black">
              {t('open-lobbies', { defaultValue: 'Open lobbies' })}
            </h2>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  useLaundryStore.getState().setBrowsing(true);
                  laundryNet.browse();
                }}
                aria-label={t('refresh', { defaultValue: 'Refresh' })}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" onClick={onBack}>
                {t('back', { defaultValue: 'Back' })}
              </Button>
            </div>
          </header>

          {lobbies.length === 0 ? (
            <p className="ls-muted py-6 text-center text-sm">
              {browsing
                ? t('loading', { defaultValue: 'Loading…' })
                : t('no-open-lobbies', {
                    defaultValue: 'Nobody is waiting right now. Create one and share the code.',
                  })}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lobbies.map((entry) => (
                <li key={entry.code}>
                  <button
                    type="button"
                    onClick={() => laundryNet.join(entry.code)}
                    className="flex w-full items-center gap-3 rounded-md bg-white/[0.04] px-3 py-2 text-left text-sm transition hover:bg-white/[0.09]"
                  >
                    <span className="ls-numeric font-black tracking-[0.2em]">{entry.code}</span>
                    <span className="min-w-0 flex-1 truncate">{entry.hostName}</span>
                    <span className="ls-muted text-xs">
                      {entry.playerCount}/{entry.maxPlayers}
                    </span>
                    <span className="ls-muted text-xs">{entry.durationSec}s</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Server errors arrive as stable slugs, never prose — the hub has no locale, so
 * translating on the client is the only way a Polish player reads them.
 */
export function lobbyErrorMessage(
  slug: string,
  t: (key: string, options: { defaultValue: string }) => string,
): string {
  switch (slug) {
    case 'lobby-full':
      return t('error-lobby-full', { defaultValue: 'That lobby is full.' });
    case 'lobby-not-found':
      return t('error-lobby-not-found', { defaultValue: 'No lobby with that code.' });
    case 'match-in-progress':
      return t('error-match-in-progress', { defaultValue: 'That race has already started.' });
    case 'need-more-players':
      return t('error-need-more-players', { defaultValue: 'A race needs at least two players.' });
    case 'not-everyone-ready':
      return t('error-not-ready', { defaultValue: 'Not everyone has readied up.' });
    case 'sign-in-required':
      return t('error-sign-in', { defaultValue: 'Sign in to race.' });
    case 'rate-limited':
      return t('error-rate-limited', { defaultValue: 'Slow down a moment.' });
    case 'kicked':
      return t('error-kicked', { defaultValue: 'The host removed you from the lobby.' });
    case 'invalid-ticket':
      return t('error-invalid-ticket', { defaultValue: 'That party invite has expired.' });
    case 'lobby-capacity':
      return t('error-lobby-capacity', { defaultValue: 'The server is full. Try again shortly.' });
    default:
      return t('error-generic', { defaultValue: 'Something went wrong.' });
  }
}
