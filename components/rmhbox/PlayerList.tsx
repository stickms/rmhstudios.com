/**
 * PlayerList — Renders a list of players with avatar, name, ready status, and host crown.
 *
 * When the current user is the host, shows kick and transfer-host buttons.
 *
 * Props:
 *   players: ClientPlayerInfo[] — Array of player info objects
 *   hostUserId: string — The userId of the current host
 *   isHost?: boolean — Whether the viewer is the host
 *   myUserId?: string — Current user's ID (to skip self-actions)
 *   onKick?: (userId: string) => void — Kick callback
 *   onTransferHost?: (userId: string) => void — Transfer host callback
 */
'use client';

import { useTranslation } from 'react-i18next';
import { Crown, Wifi, WifiOff, UserMinus, ArrowRightLeft } from 'lucide-react';
import type { ClientPlayerInfo } from '@/lib/rmhbox/types';

interface PlayerListProps {
  players: ClientPlayerInfo[];
  hostUserId: string;
  isHost?: boolean;
  myUserId?: string;
  onKick?: (userId: string) => void;
  onTransferHost?: (userId: string) => void;
}

export default function PlayerList({
  players,
  hostUserId,
  isHost,
  myUserId,
  onKick,
  onTransferHost,
}: PlayerListProps) {
  const { t } = useTranslation('c-rmhbox');
  return (
    <ul className="space-y-2" data-jelly-group>
      {players.map((player) => {
        const isSelf = player.userId === myUserId;
        const isPlayerHost = player.userId === hostUserId;

        return (
          <li
            key={player.userId}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-(--app-radius-sm) bg-(--app-bg) border border-(--app-border) px-4 py-3 transition-colors hover:bg-(--app-surface-hover)"
          >
            {/* Avatar */}
            {player.avatarUrl ? (
              <img
                src={player.avatarUrl}
                alt={player.userName}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.currentTarget;
                  const fallback = target.nextElementSibling as HTMLElement | null;
                  target.style.display = 'none';
                  if (fallback) fallback.style.display = '';
                }}
              />
            ) : null}
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--app-accent) text-sm font-bold text-(--app-accent-fg)"
              style={player.avatarUrl ? { display: 'none' } : undefined}
            >
              {player.userName.charAt(0).toUpperCase()}
            </div>

            {/* Name + host crown */}
            <div className="flex min-w-[6rem] flex-1 items-center gap-2">
              <span className="truncate font-medium text-(--app-text)">{player.userName}</span>
              {isPlayerHost && (
                <Crown
                  className="h-4 w-4 shrink-0 text-(--app-warning)"
                  aria-label={t('host', { defaultValue: 'Host' })}
                />
              )}
            </div>

            {/* Score */}
            {player.score > 0 && (
              <span className="shrink-0 rounded-full bg-(--app-accent)/15 px-2 py-0.5 text-xs font-bold tabular-nums text-(--app-accent)">
                {player.score.toLocaleString()}
              </span>
            )}

            {/* Status cluster. On a phone the name was squeezed to a single
                letter by four trailing controls, so the cluster drops to its
                own right-aligned line under the name below `sm`. */}
            <div className="flex shrink-0 items-center gap-2 max-sm:basis-full max-sm:justify-end">
              {/* Host management actions — only for other players, before status icons */}
              {isHost && !isSelf && (
                <div className="flex gap-1">
                  {!isPlayerHost && onTransferHost && (
                    <button
                      onClick={() => onTransferHost(player.userId)}
                      className="rounded p-1.5 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center text-(--app-warning) transition-colors hover:bg-(--app-warning-dim)"
                      aria-label={t('transfer-host', { defaultValue: 'Transfer host' })}
                      title={t('transfer-host', { defaultValue: 'Transfer host' })}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onKick && (
                    <button
                      onClick={() => onKick(player.userId)}
                      className="rounded p-1.5 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center text-(--app-danger) transition-colors hover:bg-(--app-danger-dim)"
                      aria-label={t('kick-player', { defaultValue: 'Kick player' })}
                      title={t('kick-player', { defaultValue: 'Kick player' })}
                    >
                      <UserMinus className="h-3.5 w-3.5" style={{ transform: 'scaleX(-1)' }} />
                    </button>
                  )}
                </div>
              )}

              {/* Connection indicator */}
              {player.isConnected ? (
                <Wifi
                  className="h-4 w-4 text-(--app-success)"
                  aria-label={t('connected', { defaultValue: 'Connected' })}
                />
              ) : (
                <WifiOff
                  className="h-4 w-4 text-(--app-danger)"
                  aria-label={t('disconnected', { defaultValue: 'Disconnected' })}
                />
              )}

              {/* Ready status */}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  player.isReady
                    ? 'bg-(--app-success)/20 text-(--app-success)'
                    : 'bg-(--app-text-muted)/20 text-(--app-text-muted)'
                }`}
              >
                {player.isReady
                  ? t('ready-player-list', { defaultValue: 'Ready' })
                  : t('not-ready', { defaultValue: 'Not Ready' })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
