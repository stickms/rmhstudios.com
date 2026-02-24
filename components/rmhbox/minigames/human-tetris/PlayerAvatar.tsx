/**
 * PlayerAvatar — Colored circle representing a player on the grid.
 *
 * Displays the player's initial inside a colored circle, with:
 *   - Smooth CSS transition for grid movement
 *   - Highlighted border + label when it's the local player
 *   - Green glow effect when placed in a correct hole position
 *
 * Positioned absolutely within the grid based on col/row coordinates.
 */
'use client';

import { memo } from 'react';

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

interface PlayerAvatarProps {
  name: string;
  color: number;
  col: number;
  row: number;
  cellSize: number;
  isLocal: boolean;
  isCorrect: boolean;
}

function PlayerAvatar({ name, color, col, row, cellSize, isLocal, isCorrect }: PlayerAvatarProps) {
  const bgColor = PLAYER_COLORS[color % PLAYER_COLORS.length];
  const initial = name.charAt(0).toUpperCase();
  const avatarSize = cellSize * 0.7;

  return (
    <div
      className="absolute z-10 pointer-events-none"
      style={{
        left: col * cellSize + (cellSize - avatarSize) / 2,
        top: row * cellSize + (cellSize - avatarSize) / 2,
        width: avatarSize,
        height: avatarSize,
        transition: 'left 0.15s ease-out, top 0.15s ease-out',
      }}
    >
      {/* Glow effect for correct placement */}
      {isCorrect && (
        <div
          className="absolute inset-[-4px] rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle, rgba(16,185,129,0.5) 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Avatar circle */}
      <div
        className={`
          relative flex items-center justify-center rounded-full
          text-white font-bold text-xs select-none
          ${isLocal ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        `}
        style={{
          width: avatarSize,
          height: avatarSize,
          backgroundColor: bgColor,
          fontSize: avatarSize * 0.4,
          boxShadow: isCorrect
            ? `0 0 12px rgba(16,185,129,0.6)`
            : `0 2px 4px rgba(0,0,0,0.3)`,
        }}
      >
        {initial}
      </div>

      {/* Name label for local player */}
      {isLocal && (
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]
                     font-semibold text-(--rmhbox-accent) mt-0.5"
          style={{ top: avatarSize }}
        >
          YOU
        </div>
      )}
    </div>
  );
}

export default memo(PlayerAvatar);
