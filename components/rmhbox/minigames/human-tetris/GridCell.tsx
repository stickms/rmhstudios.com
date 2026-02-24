/**
 * GridCell — Individual cell in the Human Tetris wall grid.
 *
 * Renders different visual states based on cell type:
 *   - wall:        solid gray block (part of the approaching wall)
 *   - hole-empty:  green opening players should fill
 *   - hole-filled: green with player present (correct placement)
 *   - dead-zone:   skull/dark cell players must avoid
 *   - regular:     empty grid cell (no wall at this position)
 *
 * Uses smooth CSS transitions between states for animation.
 */
'use client';

import { memo } from 'react';

export type CellType = 'wall' | 'hole-empty' | 'hole-filled' | 'dead-zone' | 'regular';

interface GridCellProps {
  type: CellType;
  size: number;
}

const CELL_STYLES: Record<CellType, string> = {
  wall: 'bg-gray-600 border-gray-500 shadow-inner',
  'hole-empty': 'bg-emerald-500/30 border-emerald-400/60 shadow-[inset_0_0_8px_rgba(16,185,129,0.3)]',
  'hole-filled': 'bg-emerald-500/50 border-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.5)]',
  'dead-zone': 'bg-red-950/60 border-red-800/50',
  regular: 'bg-(--rmhbox-surface)/30 border-(--rmhbox-border)/20',
};

function GridCell({ type, size }: GridCellProps) {
  return (
    <div
      className={`
        relative flex items-center justify-center rounded-sm border
        transition-all duration-300 ease-in-out
        ${CELL_STYLES[type]}
      `}
      style={{ width: size, height: size }}
    >
      {type === 'dead-zone' && (
        <span className="text-xs select-none opacity-60" aria-label="Dead zone">
          💀
        </span>
      )}
      {type === 'hole-empty' && (
        <div className="absolute inset-1 rounded-sm border border-dashed border-emerald-400/40" />
      )}
    </div>
  );
}

export default memo(GridCell);
