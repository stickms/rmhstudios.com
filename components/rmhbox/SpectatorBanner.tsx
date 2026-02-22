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

interface SpectatorBannerProps {
  lobbyState: string;
  onRequestPromotion: () => void;
}

export default function SpectatorBanner({ lobbyState, onRequestPromotion }: SpectatorBannerProps) {
  const canJoin = lobbyState === 'WAITING' || lobbyState === 'ROUND_RESULTS';

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-4 bg-[var(--rmhbox-surface)]/90 border-b border-[var(--rmhbox-border)] px-4 py-2 backdrop-blur-sm">
      <span className="text-sm font-medium text-[var(--rmhbox-text)]">
        👁️ You are spectating
      </span>
      {canJoin && (
        <button
          onClick={onRequestPromotion}
          className="rounded-lg bg-[var(--rmhbox-accent)] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--rmhbox-accent-hover)]"
        >
          Join as Player
        </button>
      )}
    </div>
  );
}
