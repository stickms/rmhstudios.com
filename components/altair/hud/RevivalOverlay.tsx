/**
 * RevivalOverlay — Shown when the local player is downed or nearby a downed teammate.
 *
 * Downed player: ghostly tether to nearest teammate, countdown timer, "DOWNED" overlay.
 * Living players: direction arrows + distance to downed teammates, proximity progress bar.
 * Spectator mode: free camera indicator.
 */

'use client';

import { useMemo } from 'react';
import { Eye, Heart } from 'lucide-react';
import { CLASSES } from '@/lib/altair/data/classes';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';
import type { PlayerStateSnapshot } from '@/lib/altair/multiplayer/types';

interface RevivalOverlayProps {
  localPlayer: PlayerStateSnapshot;
  allPlayers: PlayerStateSnapshot[];
}

export default function RevivalOverlay({ localPlayer, allPlayers }: RevivalOverlayProps) {
  // Downed teammates (for living player indicators)
  const downedTeammates = useMemo(
    () => allPlayers.filter((p) => p.isDowned && p.playerId !== localPlayer.playerId),
    [allPlayers, localPlayer.playerId],
  );

  // If local player is spectating
  if (localPlayer.isSpectating || localPlayer.isDead) {
    return (
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg bg-black/70">
          <Eye size={16} className="text-white/60" />
          <span className="text-sm text-white/80 font-semibold">Spectating</span>
          <span className="text-xs text-white/40">(Tab to switch)</span>
        </div>
      </div>
    );
  }

  // If local player is downed
  if (localPlayer.isDowned) {
    return (
      <div className="pointer-events-none absolute inset-0 z-30">
        {/* Red tint */}
        <div className="absolute inset-0 bg-red-900/20" />

        {/* DOWNED text */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center">
          <div
            className="text-5xl font-black text-red-500 tracking-wider animate-pulse"
            style={{ fontFamily: 'var(--altair-font-display)', textShadow: '0 0 30px rgba(239, 68, 68, 0.5)' }}
          >
            DOWNED
          </div>
          <div className="mt-3 text-lg text-red-300 font-mono">
            {localPlayer.downTimer.toFixed(1)}s
          </div>
        </div>

        {/* Revival progress bar */}
        {localPlayer.revivalProgress > 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-48 mt-4">
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-200"
                style={{ width: `${localPlayer.revivalProgress * 100}%` }}
              />
            </div>
            <div className="text-center mt-1 text-xs text-green-300 font-semibold flex items-center justify-center gap-1">
              <Heart size={12} />
              Being revived...
            </div>
          </div>
        )}

        {/* "Wait for teammate" if no revival in progress */}
        {localPlayer.revivalProgress === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-4 text-center">
            <span className="text-sm text-red-300/80">Waiting for teammate...</span>
          </div>
        )}
      </div>
    );
  }

  // Living player — show downed teammate indicators
  if (downedTeammates.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-25">
      {downedTeammates.map((teammate) => {
        const dx = teammate.x - localPlayer.x;
        const dy = teammate.y - localPlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const classDef = CLASSES.find((c) => c.id === teammate.classId);
        const color = classDef?.color || PLAYER_SLOT_COLORS[teammate.slot] || '#EF4444';

        // Position indicator at edge of screen pointing to teammate
        const indicatorR = 120; // px from center
        const ix = Math.cos(angle) * indicatorR + window.innerWidth / 2;
        const iy = Math.sin(angle) * indicatorR + window.innerHeight / 2;

        return (
          <div
            key={teammate.playerId}
            className="absolute flex flex-col items-center gap-1"
            style={{
              left: `${Math.max(40, Math.min(window.innerWidth - 40, ix))}px`,
              top: `${Math.max(40, Math.min(window.innerHeight - 100, iy))}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Direction arrow */}
            <div
              className="text-red-400 animate-pulse"
              style={{ transform: `rotate(${angle}rad)` }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20">
                <polygon points="20,10 4,2 8,10 4,18" fill="currentColor" />
              </svg>
            </div>

            {/* Distance */}
            <span className="text-[10px] font-mono font-bold text-red-300 bg-black/50 px-1 rounded">
              {Math.round(dist)}px
            </span>

            {/* Revival timer */}
            <span className="text-[10px] font-bold text-red-400">
              {teammate.downTimer.toFixed(0)}s
            </span>
          </div>
        );
      })}
    </div>
  );
}
