/**
 * WallCanvas — Grid renderer for the Human Tetris minigame.
 *
 * Renders an 8×6 grid with color-coded cells:
 *   - Holes (green): spaces players must fill
 *   - Dead zones (skull/dark): spaces players must avoid
 *   - Wall (gray): solid wall blocks
 *   - Regular: empty background cells
 *
 * Overlays PlayerAvatar components at their current positions
 * with real-time updates as players move.
 */
'use client';

import { useMemo } from 'react';
import { HT_GRID_COLS, HT_GRID_ROWS } from '@/lib/rmhbox/constants';
import GridCell, { type CellType } from './GridCell';
import PlayerAvatar from './PlayerAvatar';

export const GRID_COLS = HT_GRID_COLS;
export const GRID_ROWS = HT_GRID_ROWS;

export interface PlayerPosition {
  playerId: string;
  playerName: string;
  col: number;
  row: number;
  colorIndex: number;
}

export interface WallShape {
  /** Grid of cell types: 'wall' | 'hole' | 'dead-zone' | null */
  cells: (string | null)[][];
}

interface WallCanvasProps {
  wall: WallShape | null;
  players: PlayerPosition[];
  localPlayerId: string;
  /** Set of player IDs currently in correct (hole) positions */
  correctPlayerIds?: Set<string>;
  /** Whether to show the wall overlay on the grid */
  showWall?: boolean;
}

export default function WallCanvas({
  wall,
  players,
  localPlayerId,
  correctPlayerIds = new Set(),
  showWall = true,
}: WallCanvasProps) {
  const cellSize = useMemo(() => {
    // Responsive cell size: fit in available viewport
    if (typeof window === 'undefined') return 48;
    const maxWidth = Math.min(window.innerWidth - 32, 480);
    const maxHeight = Math.min(window.innerHeight * 0.5, 360);
    return Math.floor(Math.min(maxWidth / GRID_COLS, maxHeight / GRID_ROWS));
  }, []);

  const gridWidth = cellSize * GRID_COLS;
  const gridHeight = cellSize * GRID_ROWS;

  // Build cell type matrix
  const cellTypes = useMemo(() => {
    const grid: CellType[][] = Array.from({ length: GRID_ROWS }, () =>
      Array.from({ length: GRID_COLS }, () => 'regular' as CellType),
    );

    if (wall && showWall) {
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const cellVal = wall.cells[r]?.[c];
          if (cellVal === 'wall') grid[r][c] = 'wall';
          else if (cellVal === 'hole') {
            // Check if any player is in this hole
            const filled = players.some((p) => p.col === c && p.row === r);
            grid[r][c] = filled ? 'hole-filled' : 'hole-empty';
          } else if (cellVal === 'dead-zone') {
            grid[r][c] = 'dead-zone';
          }
        }
      }
    }

    return grid;
  }, [wall, showWall, players]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg)/80 p-1"
        style={{ width: gridWidth + 8, height: gridHeight + 8 }}
      >
        {/* Grid cells */}
        <div
          className="grid gap-0"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, ${cellSize}px)`,
          }}
        >
          {cellTypes.flat().map((type, i) => (
            <GridCell key={i} type={type} size={cellSize} />
          ))}
        </div>

        {/* Player avatars */}
        {players.map((p) => (
          <PlayerAvatar
            key={p.playerId}
            name={p.playerName}
            color={p.colorIndex}
            col={p.col}
            row={p.row}
            cellSize={cellSize}
            isLocal={p.playerId === localPlayerId}
            isCorrect={correctPlayerIds.has(p.playerId)}
          />
        ))}
      </div>

      {/* Grid legend */}
      <div className="flex gap-3 text-[10px] text-(--rmhbox-text-muted)">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-400/60" />
          Hole
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-600 border border-gray-500" />
          Wall
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-950/60 border border-red-800/50" />
          Dead Zone
        </span>
      </div>
    </div>
  );
}
