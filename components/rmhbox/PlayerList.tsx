/**
 * PlayerList — Renders a list of players with avatar, name, ready status, and host crown.
 *
 * Props:
 *   players: ClientPlayerInfo[] — Array of player info objects
 *   hostUserId: string — The userId of the current host
 */
'use client';

import { Crown, Wifi, WifiOff } from 'lucide-react';
import type { ClientPlayerInfo } from '@/lib/rmhbox/types';

interface PlayerListProps {
  players: ClientPlayerInfo[];
  hostUserId: string;
}

export default function PlayerList({ players, hostUserId }: PlayerListProps) {
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li
          key={player.userId}
          className="flex items-center gap-3 rounded-lg bg-[var(--rmhbox-surface)] border border-[var(--rmhbox-border)] px-4 py-3 transition-colors hover:bg-[var(--rmhbox-surface-hover)]"
        >
          {/* Avatar placeholder */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--rmhbox-accent)] text-sm font-bold text-white">
            {player.userName.charAt(0).toUpperCase()}
          </div>

          {/* Name + host crown */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-medium text-[var(--rmhbox-text)]">
              {player.userName}
            </span>
            {player.userId === hostUserId && (
              <Crown className="h-4 w-4 shrink-0 text-[var(--rmhbox-warning)]" aria-label="Host" />
            )}
          </div>

          {/* Connection indicator */}
          {player.isConnected ? (
            <Wifi className="h-4 w-4 text-[var(--rmhbox-success)]" aria-label="Connected" />
          ) : (
            <WifiOff className="h-4 w-4 text-[var(--rmhbox-danger)]" aria-label="Disconnected" />
          )}

          {/* Ready status */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              player.isReady
                ? 'bg-[var(--rmhbox-success)]/20 text-[var(--rmhbox-success)]'
                : 'bg-[var(--rmhbox-text-muted)]/20 text-[var(--rmhbox-text-muted)]'
            }`}
          >
            {player.isReady ? 'Ready' : 'Not Ready'}
          </span>
        </li>
      ))}
    </ul>
  );
}
