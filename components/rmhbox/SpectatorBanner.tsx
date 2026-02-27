/**
 * SpectatorBanner — Fixed banner at top for spectators.
 *
 * Shows "👁️ You are spectating" with a "Join as Player" button
 * visible during WAITING or ROUND_RESULTS states.
 *
 * For competitive-individual games (rhyme-time, wiki-race, etc.),
 * also shows a player-switcher dropdown so the spectator can pick
 * which player's state they are viewing.
 *
 * Props:
 *   lobbyState: string — Current lobby state
 *   onRequestPromotion: () => void — Callback to request player promotion
 *   spectatorTarget: SpectatorTargetInfo | null — Current target info
 *   spectatorMode: SpectatorMode | null — Current game's spectator mode
 *   onSelectPlayer: (targetPlayerId: string) => void — Callback to switch player
 */
'use client';

import { Eye, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { SpectatorTargetInfo, SpectatorMode } from '../../lib/rmhbox/types';

interface SpectatorBannerProps {
  lobbyState: string;
  onRequestPromotion: () => void;
  spectatorTarget?: SpectatorTargetInfo | null;
  spectatorMode?: SpectatorMode | null;
  onSelectPlayer?: (targetPlayerId: string) => void;
}

export default function SpectatorBanner({
  lobbyState,
  onRequestPromotion,
  spectatorTarget,
  spectatorMode,
  onSelectPlayer,
}: SpectatorBannerProps) {
  const canJoin = lobbyState === 'WAITING' || lobbyState === 'ROUND_RESULTS';
  const showPlayerSwitcher = spectatorMode === 'competitive-individual'
    && spectatorTarget
    && spectatorTarget.availablePlayers.length > 0
    && lobbyState === 'PLAYING';

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-center gap-4 bg-(--rmhbox-surface)/50 border-b border-(--rmhbox-border) px-4 backdrop-blur-[1px] pointer-events-none">
      <span className="flex items-center gap-1.5 text-sm font-medium text-(--rmhbox-text) pointer-events-auto">
        <Eye className="h-4 w-4" /> You are spectating
      </span>

      {/* Player switcher for competitive-individual games */}
      {showPlayerSwitcher && (
        <div className="relative pointer-events-auto" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) px-3 py-1 text-xs font-semibold text-(--rmhbox-text) transition-colors hover:bg-(--rmhbox-surface-hover)"
          >
            Viewing: {spectatorTarget.targetPlayerName}
            <ChevronDown className="h-3 w-3" />
          </button>
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 min-w-[160px] rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) py-1 shadow-lg">
              {spectatorTarget.availablePlayers.map((p) => (
                <button
                  key={p.userId}
                  onClick={() => {
                    onSelectPlayer?.(p.userId);
                    setDropdownOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-(--rmhbox-surface-hover) ${
                    p.userId === spectatorTarget.targetPlayerId
                      ? 'font-bold text-(--rmhbox-accent)'
                      : 'text-(--rmhbox-text)'
                  }`}
                >
                  {p.userName}
                  {p.userId === spectatorTarget.targetPlayerId && ' ✓'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canJoin && (
        <button
          onClick={onRequestPromotion}
          className="rounded-lg bg-(--rmhbox-accent) px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-(--rmhbox-accent-hover) pointer-events-auto"
        >
          Join as Player
        </button>
      )}
    </div>
  );
}
