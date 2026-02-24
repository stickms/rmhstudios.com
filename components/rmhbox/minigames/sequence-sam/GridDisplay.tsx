/**
 * GridDisplay — 3×3 CSS Grid layout for Sequence Sam.
 *
 * During PATTERN_DISPLAY: tiles flash in sequence (non-interactive).
 * During INPUT: tiles are tappable.
 * Chaos Round: CSS transform rotate(90deg) with transition.
 */
'use client';

import GridTile from './GridTile';
import type { TileState } from './GridTile';

export interface GridDisplayProps {
  tiles: TileState[];
  interactive: boolean;
  onTileTap: (index: number) => void;
  rotated: boolean;
}

export default function GridDisplay({ tiles, interactive, onTileTap, rotated }: GridDisplayProps) {
  return (
    <div
      className="grid grid-cols-3 gap-3 p-2 transition-transform duration-500 ease-in-out"
      style={{ transform: rotated ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      {tiles.map((state, i) => (
        <GridTile
          key={i}
          index={i}
          state={state}
          interactive={interactive}
          onTap={onTileTap}
        />
      ))}
    </div>
  );
}
