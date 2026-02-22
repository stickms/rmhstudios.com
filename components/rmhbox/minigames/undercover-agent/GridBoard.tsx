/**
 * GridBoard — 5×5 clickable tile grid for Undercover Agent.
 *
 * Renders 25 tiles in a responsive 5-column grid. Tiles show:
 *   - Their word text prominently
 *   - Color-coded background when revealed (red/blue/beige/black)
 *   - Neutral background when hidden, with hover effects if clickable
 *   - Subtle color borders/tints for spymasters on hidden tiles
 *
 * Click handler emits GUESS_TILE action only for hidden tiles when
 * the player is an operative on the active team during GUESS phase.
 *
 * Props:
 *   grid: GridTileClient[] — 25 grid tiles
 *   canGuess: boolean — Whether the current user can click tiles
 *   isSpymaster: boolean — Whether to show key-card coloring on hidden tiles
 *   onTileClick: (position: number) => void — Click handler
 */
'use client';

import { motion } from 'framer-motion';
import type { GridTileClient } from './UndercoverAgentGame';

// ─── Color Mapping ───────────────────────────────────────────────

/** Revealed tile background colors by tile type */
const REVEALED_COLORS: Record<string, { bg: string; text: string }> = {
  RED_AGENT: { bg: 'bg-red-600/80', text: 'text-white' },
  BLUE_AGENT: { bg: 'bg-blue-600/80', text: 'text-white' },
  BYSTANDER: { bg: 'bg-amber-200/40', text: 'text-amber-100' },
  ASSASSIN: { bg: 'bg-gray-900', text: 'text-red-400' },
};

/** Spymaster key-card border colors for hidden tiles */
const SPYMASTER_HINTS: Record<string, string> = {
  RED_AGENT: 'ring-2 ring-red-500/50',
  BLUE_AGENT: 'ring-2 ring-blue-500/50',
  BYSTANDER: 'ring-1 ring-amber-500/30',
  ASSASSIN: 'ring-2 ring-gray-400/60 bg-gray-800/30',
};

interface GridBoardProps {
  grid: GridTileClient[];
  canGuess: boolean;
  isSpymaster: boolean;
  onTileClick: (position: number) => void;
}

export default function GridBoard({ grid, canGuess, isSpymaster, onTileClick }: GridBoardProps) {
  return (
    <div className="grid w-full max-w-lg grid-cols-5 gap-1.5 sm:gap-2">
      {grid.map((tile) => {
        const isRevealed = tile.state === 'REVEALED';
        const revealedStyle = isRevealed && tile.type ? REVEALED_COLORS[tile.type] : null;
        const spymasterHint = !isRevealed && isSpymaster && tile.type ? SPYMASTER_HINTS[tile.type] : '';
        const clickable = canGuess && !isRevealed;

        return (
          <motion.button
            key={tile.position}
            onClick={() => clickable && onTileClick(tile.position)}
            disabled={!clickable}
            whileHover={clickable ? { scale: 1.05 } : undefined}
            whileTap={clickable ? { scale: 0.95 } : undefined}
            className={`
              flex items-center justify-center rounded-lg border px-1 py-3 text-xs font-semibold
              transition-all duration-200 sm:py-4 sm:text-sm
              ${
                isRevealed
                  ? `${revealedStyle?.bg ?? ''} ${revealedStyle?.text ?? ''} border-transparent opacity-80`
                  : `border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] text-[var(--rmhbox-text)] ${spymasterHint}`
              }
              ${clickable ? 'cursor-pointer hover:border-[var(--rmhbox-accent)] hover:bg-[var(--rmhbox-accent)]/10' : ''}
              ${!clickable && !isRevealed ? 'cursor-default' : ''}
            `}
          >
            <span className="truncate">{tile.word}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
