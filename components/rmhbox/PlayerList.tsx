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

export default function PlayerList({ players, hostUserId, isHost, myUserId, onKick, onTransferHost }: PlayerListProps) {
  return (
    <ul className="space-y-2">
      {players.map((player) => {
        const isSelf = player.userId === myUserId;
        const isPlayerHost = player.userId === hostUserId;

        return (
          <li
            key={player.userId}
            className="flex items-center gap-3 rounded-lg bg-(--rmhbox-bg) border border-(--rmhbox-border) px-4 py-3 transition-colors hover:bg-(--rmhbox-surface-hover)"
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--rmhbox-accent) text-sm font-bold text-white"
              style={player.avatarUrl ? { display: 'none' } : undefined}
            >
              {player.userName.charAt(0).toUpperCase()}
            </div>

            {/* Name + host crown */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate font-medium text-(--rmhbox-text)">
                {player.userName}
              </span>
              {isPlayerHost && (
                <Crown className="h-4 w-4 shrink-0 text-(--rmhbox-warning)" aria-label="Host" />
              )}
            </div>

            {/* Score */}
            {player.score > 0 && (
              <span className="shrink-0 rounded-full bg-(--rmhbox-accent)/15 px-2 py-0.5 text-xs font-bold tabular-nums text-(--rmhbox-accent)">
                {player.score.toLocaleString()}
              </span>
            )}

            {/* Host management actions — only for other players, before status icons */}
            {isHost && !isSelf && (
              <div className="flex gap-1">
                {!isPlayerHost && onTransferHost && (
                  <button
                    onClick={() => onTransferHost(player.userId)}
                    className="rounded p-1.5 text-(--rmhbox-warning) transition-colors hover:bg-(--rmhbox-warning-dim)"
                    title="Transfer host"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                {onKick && (
                  <button
                    onClick={() => onKick(player.userId)}
                    className="rounded p-1.5 text-(--rmhbox-danger) transition-colors hover:bg-(--rmhbox-danger-dim)"
                    title="Kick player"
                  >
                    <UserMinus className="h-3.5 w-3.5" style={{ transform: 'scaleX(-1)' }} />
                  </button>
                )}
              </div>
            )}

            {/* Connection indicator */}
            {player.isConnected ? (
              <Wifi className="h-4 w-4 text-(--rmhbox-success)" aria-label="Connected" />
            ) : (
              <WifiOff className="h-4 w-4 text-(--rmhbox-danger)" aria-label="Disconnected" />
            )}

            {/* Ready status */}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                player.isReady
                  ? 'bg-(--rmhbox-success)/20 text-(--rmhbox-success)'
                  : 'bg-(--rmhbox-text-muted)/20 text-(--rmhbox-text-muted)'
              }`}
            >
              {player.isReady ? 'Ready' : 'Not Ready'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
