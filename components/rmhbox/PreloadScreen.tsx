/**
 * PreloadScreen — Loading screen shown while game assets are being prepared.
 *
 * Displays a progress bar and player ready-status indicators.
 * Auto-emits the ready_to_render event on mount.
 *
 * Props:
 *   players: { userId: string; userName: string; ready: boolean }[] — Player readiness list
 */
'use client';

import { useEffect, useMemo } from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';

interface PreloadPlayer {
  userId: string;
  userName: string;
  ready: boolean;
}

interface PreloadScreenProps {
  players: PreloadPlayer[];
  lobbyId: string;
}

export default function PreloadScreen({ players, lobbyId }: PreloadScreenProps) {
  // Auto-emit ready on mount
  useEffect(() => {
    emit(C2S.GAME_READY_TO_RENDER, { lobbyId });
  }, [lobbyId]);

  const readyCount = useMemo(() => players.filter((p) => p.ready).length, [players]);
  const progress = players.length > 0 ? (readyCount / players.length) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 p-6 text-[var(--rmhbox-text)]">
      <Loader2 className="h-10 w-10 animate-spin text-[var(--rmhbox-accent)]" />
      <h2 className="text-xl font-bold">Loading Game…</h2>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--rmhbox-border)]">
        <div
          className="h-full rounded-full bg-[var(--rmhbox-accent)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-sm text-[var(--rmhbox-text-muted)]">
        {readyCount} / {players.length} players ready
      </span>

      {/* Player readiness list */}
      <ul className="w-full space-y-1">
        {players.map((p) => (
          <li key={p.userId} className="flex items-center gap-2 text-sm">
            {p.ready ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--rmhbox-success)]" />
            ) : (
              <Circle className="h-4 w-4 text-[var(--rmhbox-text-muted)]" />
            )}
            <span className={p.ready ? 'text-[var(--rmhbox-text)]' : 'text-[var(--rmhbox-text-muted)]'}>
              {p.userName}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
