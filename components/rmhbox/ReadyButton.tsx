/**
 * ReadyButton — Toggle button for player ready/not-ready state.
 *
 * Shows the selected game as a subtitle when available.
 * Non-host players see "Ready Up / for [game]" or "✓ Ready / for [game]".
 * Host sees "Start Game / [game]" with force-start logic.
 * Disabled when no game has been picked yet.
 *
 * Props:
 *   isReady: boolean — Current ready state
 *   onToggle: () => void — Callback to toggle ready state
 *   isHost?: boolean — Whether the current user is the host
 *   allPlayersReady?: boolean — Whether all non-host players are ready
 *   onStartGame?: () => void — Callback to start the game (host only)
 *   selectedGameName?: string | null — Display name of the picked game
 *   hasGamePicked?: boolean — Whether a game (or vote) has been picked
 */
'use client';

import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

interface ReadyButtonProps {
  isReady: boolean;
  onToggle: () => void;
  isHost?: boolean;
  allPlayersReady?: boolean;
  onStartGame?: () => void;
  selectedGameName?: string | null;
  hasGamePicked?: boolean;
}

export default function ReadyButton({
  isReady,
  onToggle,
  isHost = false,
  allPlayersReady = false,
  onStartGame,
  selectedGameName,
  hasGamePicked = false,
}: ReadyButtonProps) {
  const [forceStartPrimed, setForceStartPrimed] = useState(false);

  // Reset force start prime when all players become ready or when game pick changes
  useEffect(() => {
    if (allPlayersReady) setForceStartPrimed(false);
  }, [allPlayersReady]);

  useEffect(() => {
    setForceStartPrimed(false);
  }, [selectedGameName]);

  // Host always sees the Start Game button (they are permanently ready)
  if (isHost) {
    const canStart = allPlayersReady && hasGamePicked;

    const handleStartClick = () => {
      if (!hasGamePicked) return;
      if (canStart) {
        onStartGame?.();
      } else if (forceStartPrimed) {
        onStartGame?.();
        setForceStartPrimed(false);
      } else {
        setForceStartPrimed(true);
      }
    };

    return (
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handleStartClick}
          disabled={!hasGamePicked}
          className={`relative flex flex-col items-center rounded-xl px-8 py-3 font-bold transition-all duration-200 ${
            !hasGamePicked
              ? 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) opacity-50 cursor-not-allowed'
              : canStart
                ? 'bg-(--rmhbox-success) text-black hover:brightness-110'
                : forceStartPrimed
                  ? 'bg-(--rmhbox-warning) text-black hover:brightness-110'
                  : 'bg-(--rmhbox-success) text-black opacity-40'
          }`}
        >
          {canStart && (
            <span className="pointer-events-none absolute inset-0 animate-ping rounded-xl bg-(--rmhbox-success) opacity-30" />
          )}
          <span className="relative z-10 flex items-center gap-2 text-lg">
            <Play className="h-5 w-5" />
            Start Game
          </span>
          {selectedGameName && (
            <span className="relative z-10 text-xs opacity-80 mt-0.5">{selectedGameName}</span>
          )}
        </button>
        {!hasGamePicked && (
          <span className="text-center text-xs text-(--rmhbox-text-muted)">
            Pick a game first
          </span>
        )}
        {hasGamePicked && !canStart && (
          <span className="text-center text-xs text-(--rmhbox-text-muted)">
            {forceStartPrimed
              ? 'Not all players are ready. Press again to force start.'
              : 'Waiting for all players to ready up…'}
          </span>
        )}
      </div>
    );
  }

  // Non-host player
  const disabled = !hasGamePicked;

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`relative flex flex-col items-center rounded-xl px-8 py-3 font-bold transition-all duration-200 ${
        disabled
          ? 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) opacity-50 cursor-not-allowed'
          : isReady
            ? 'bg-(--rmhbox-success) text-black hover:brightness-110'
            : 'bg-(--rmhbox-accent) text-white hover:bg-(--rmhbox-accent-hover)'
      }`}
    >
      {/* Pulse ring when not ready but game is picked */}
      {!isReady && !disabled && (
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-xl bg-(--rmhbox-accent) opacity-30" />
      )}
      <span className="relative z-10 text-lg">{isReady ? '✓ Ready!' : 'Ready Up'}</span>
      {selectedGameName ? (
        <span className="relative z-10 text-xs opacity-80 mt-0.5">for {selectedGameName}</span>
      ) : (
        <span className="relative z-10 text-xs opacity-60 mt-0.5">Waiting for host to pick…</span>
      )}
    </button>
  );
}
