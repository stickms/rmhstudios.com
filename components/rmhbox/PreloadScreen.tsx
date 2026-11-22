/**
 * PreloadScreen — Loading screen shown while game assets are being prepared.
 *
 * Displays a progress bar and player ready-status indicators.
 * Loads the game's code, then emits ready_to_render (again after a reconnect).
 *
 * Props:
 *   players: { userId: string; userName: string; ready: boolean }[] — Player readiness list
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { preloadMinigame } from '@/components/rmhbox/minigames/minigame-loaders';

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
  const { t } = useTranslation('c-rmhbox');

  const minigameId = useRMHboxStore((s) => s.lobby?.currentGame?.minigameId ?? null);
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load the game's code first: "ready" means the game can render the moment
  // PLAYING starts, not merely that this screen mounted.
  useEffect(() => {
    let cancelled = false;
    void preloadMinigame(minigameId).then(() => {
      if (!cancelled) setLoadedFor(minigameId ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [minigameId]);

  // Report ready once loaded, and again after every reconnect: a ready sent
  // while the socket was down was dropped, and nothing used to resend it, so
  // everyone waited out the server's 30 s preload timeout.
  const loaded = loadedFor === (minigameId ?? '');
  useEffect(() => {
    if (!loaded || connectionStatus !== 'connected') return;
    emit(
      C2S.GAME_READY_TO_RENDER,
      {
        lobbyId,
      },
      {
        queue: true,
      },
    );
  }, [loaded, connectionStatus, lobbyId]);

  const readyCount = useMemo(() => players.filter((p) => p.ready).length, [players]);
  const progress = players.length > 0 ? (readyCount / players.length) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 p-6 text-app-text">
      <Loader2 className="h-10 w-10 animate-spin text-app-accent" />
      <h2 className="text-xl font-bold">
        {t('loading-game', {
          defaultValue: 'Loading Game…',
        })}
      </h2>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-app-border">
        <div
          className="h-full bg-app-accent w-full origin-left transition-transform duration-500"
          style={{
            transform: `scaleX(${progress / 100})`,
          }}
        />
      </div>
      <span className="text-sm text-app-text-muted">
        {t('players-ready', {
          readyCount,
          total: players.length,
          count: Number(players.length),
          defaultValue_one: '{{readyCount}} / {{total}} player ready',
          defaultValue: '{{readyCount}} / {{total}} players ready',
        })}
      </span>

      {/* Player readiness list */}
      <ul className="w-full space-y-1">
        {players.map((p) => (
          <li key={p.userId} className="flex items-center gap-2 text-sm">
            {p.ready ? (
              <CheckCircle2 className="h-4 w-4 text-app-success" />
            ) : (
              <Circle className="h-4 w-4 text-app-text-muted" />
            )}
            <span className={p.ready ? 'text-app-text' : 'text-app-text-muted'}>{p.userName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
