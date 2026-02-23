/**
 * SpectatorBanner — Fixed banner at top for spectators.
 *
 * Shows "👁️ You are spectating" with a "Join as Player" button
 * visible during WAITING or ROUND_RESULTS states.
 *
 * Props:
 *   lobbyState: string — Current lobby state
 *   onRequestPromotion: () => void — Callback to request player promotion
 */
'use client';

import { Eye } from 'lucide-react';

interface SpectatorBannerProps {
  lobbyState: string;
  onRequestPromotion: () => void;
}

export default function SpectatorBanner({ lobbyState, onRequestPromotion }: SpectatorBannerProps) {
  const canJoin = lobbyState === 'WAITING' || lobbyState === 'ROUND_RESULTS';

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-center gap-4 bg-(--rmhbox-surface)/75 border-b border-(--rmhbox-border) px-4 backdrop-blur-sm pointer-events-none">
      <span className="flex items-center gap-1.5 text-sm font-medium text-(--rmhbox-text) pointer-events-auto">
        <Eye className="h-4 w-4" /> You are spectating
      </span>
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
