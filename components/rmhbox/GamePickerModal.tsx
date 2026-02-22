/**
 * GamePickerModal — Full-screen modal for the host to pick a minigame.
 *
 * Displays all registered minigames in a scrollable grid.
 * The first option is "Let Players Vote", which selects vote mode.
 * Games incompatible with the current player count are still shown
 * but with a warning badge and confirmation prompt.
 *
 * Uses createPortal to render outside the header containing block.
 */
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, Vote, Gamepad2 } from 'lucide-react';
import { getAllMinigames } from '@/lib/rmhbox/minigame-registry';

interface GamePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (minigameId: string) => void;
  playerCount: number;
  currentPickId?: string | null;
}

export default function GamePickerModal({
  isOpen,
  onClose,
  onPick,
  playerCount,
  currentPickId,
}: GamePickerModalProps) {
  const [confirmGame, setConfirmGame] = useState<string | null>(null);

  if (!isOpen) return null;

  const allGames = getAllMinigames();

  const handlePick = (minigameId: string) => {
    // Check if playable
    if (minigameId !== '__vote__') {
      const game = allGames.find((g) => g.id === minigameId);
      if (game && (playerCount < game.minPlayers || playerCount > game.maxPlayers)) {
        if (confirmGame === minigameId) {
          // Second click — force pick anyway (server will validate at start time)
          onPick(minigameId);
          setConfirmGame(null);
          onClose();
          return;
        }
        setConfirmGame(minigameId);
        return;
      }
    }
    onPick(minigameId);
    setConfirmGame(null);
    onClose();
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="rmhbox-overlay fixed inset-0 z-60 bg-black/50"
        onClick={() => { setConfirmGame(null); onClose(); }}
      />

      {/* Panel */}
      <div
        className="rmhbox-modal fixed inset-x-4 top-1/2 z-70 mx-auto max-w-md -translate-y-1/2 rounded-xl border p-5 shadow-2xl"
        style={{
          backgroundColor: 'var(--rmhbox-surface)',
          borderColor: 'var(--rmhbox-border)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-(--rmhbox-text)">
            <Gamepad2 className="h-5 w-5 text-(--rmhbox-accent)" />
            Pick a Game
          </h2>
          <button
            onClick={() => { setConfirmGame(null); onClose(); }}
            className="rounded p-1 text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Game list */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {/* Vote option */}
          <div className="mb-3">
            <button
              onClick={() => handlePick('__vote__')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors"
              style={{
                backgroundColor: currentPickId === '__vote__' ? 'var(--rmhbox-accent)' : 'var(--rmhbox-bg)',
                border: '1px solid var(--rmhbox-border)',
                color: currentPickId === '__vote__' ? 'white' : undefined,
              }}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: currentPickId === '__vote__' ? 'rgba(255,255,255,0.2)' : 'var(--rmhbox-accent)' }}
              >
                <Vote className="h-3.5 w-3.5" />
              </div>
              <span className={`flex-1 truncate text-sm font-medium ${currentPickId === '__vote__' ? 'text-white' : 'text-(--rmhbox-text)'}`}>
                Let Players Vote
              </span>
              {currentPickId === '__vote__' && (
                <span className="shrink-0 text-xs font-semibold">✓</span>
              )}
            </button>
          </div>

          {/* Section header */}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            Games ({allGames.length})
          </h3>

          {/* All games */}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {allGames.map((game) => {
              const isPlayable = playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
              const isSelected = currentPickId === game.id;
              const isConfirming = confirmGame === game.id;

              return (
                <button
                  key={game.id}
                  onClick={() => handlePick(game.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--rmhbox-accent)'
                      : isConfirming
                        ? 'var(--rmhbox-bg)'
                        : 'var(--rmhbox-bg)',
                    border: isConfirming
                      ? '1px solid var(--rmhbox-warning)'
                      : '1px solid var(--rmhbox-border)',
                    color: isSelected ? 'white' : undefined,
                  }}
                >
                  <span className="text-base shrink-0 w-7 text-center">{game.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-(--rmhbox-text)'}`}>
                        {game.displayName}
                      </span>
                      {!isPlayable && !isSelected && (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-(--rmhbox-warning)" />
                      )}
                    </div>
                    <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-(--rmhbox-text-muted)'}`}>
                      {game.category} · {game.minPlayers}–{game.maxPlayers} players
                    </div>
                    {isConfirming && (
                      <div className="text-xs font-semibold text-(--rmhbox-warning) mt-0.5">
                        Requires {game.minPlayers}–{game.maxPlayers} players (you have {playerCount}). Tap again to pick anyway.
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <span className="shrink-0 text-xs font-semibold">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>,
    document.querySelector('.rmhbox-theme') ?? document.body,
  );
}
