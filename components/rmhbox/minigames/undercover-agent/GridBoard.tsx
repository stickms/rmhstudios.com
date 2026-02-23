/**
 * GridBoard — 5×5 clickable tile grid for Undercover Agent.
 *
 * Renders 25 tiles in a responsive 5-column grid. Tiles show:
 *   - Their word text prominently
 *   - Color-coded background when revealed (red/blue/beige/black)
 *   - Neutral background when hidden, with hover effects if clickable
 *   - Subtle color borders/tints for spymasters on hidden tiles
 *
 * Operatives use a two-step highlight-then-submit flow:
 *   1. First click highlights the tile (amber border + pointer icon)
 *   2. Clicking the pointer icon (or the tile again) submits the guess
 *   - Clicking a different tile moves the highlight
 *
 * Props:
 *   grid: GridTileClient[] — 25 grid tiles
 *   canGuess: boolean — Whether the current user can click tiles
 *   isSpymaster: boolean — Whether to show key-card coloring on hidden tiles
 *   onTileClick: (position: number) => void — Click handler (submits guess)
 */
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointerClick } from 'lucide-react';
import type { GridTileClient } from './UndercoverAgentGame';

// ─── Color Mapping ───────────────────────────────────────────────

/** Revealed tile background colors by tile type */
const REVEALED_COLORS: Record<string, { bg: string; text: string }> = {
  RED_AGENT: { bg: 'bg-red-600/80', text: 'text-white' },
  BLUE_AGENT: { bg: 'bg-blue-600/80', text: 'text-white' },
  BYSTANDER: { bg: 'bg-amber-200/40', text: 'text-amber-100' },
  ASSASSIN: { bg: 'bg-black border-2 dark:border-white/60 border-black/60', text: 'text-red-500' },
};

/** Spymaster key-card border colors for hidden tiles */
const SPYMASTER_HINTS: Record<string, string> = {
  RED_AGENT: 'ring-2 ring-red-500/50',
  BLUE_AGENT: 'ring-2 ring-blue-500/50',
  BYSTANDER: 'ring-1 ring-amber-500/30',
  ASSASSIN: 'ring-2 ring-black-800/60 dark:ring-white-800/60 bg-black/40',
};

/** Get font size class based on word length so long words fit without truncating */
function getWordSizeClass(word: string): string {
  const len = word.length;
  if (len <= 5) return 'text-xs sm:text-sm';
  if (len <= 7) return 'text-xs sm:text-sm';
  if (len <= 9) return 'text-[10px] sm:text-xs';
  if (len <= 12) return 'text-[9px] sm:text-[11px]';
  return 'text-[8px] sm:text-[10px]';
}

interface GridBoardProps {
  grid: GridTileClient[];
  canGuess: boolean;
  isSpymaster: boolean;
  onTileClick: (position: number) => void;
}

export default function GridBoard({ grid, canGuess, isSpymaster, onTileClick }: GridBoardProps) {
  // Track which tile the operative has highlighted (first click)
  const [highlightedPos, setHighlightedPos] = useState<number | null>(null);

  // Clear highlight when canGuess changes (e.g. turn ends) or when grid tiles get revealed
  useEffect(() => {
    if (!canGuess) setHighlightedPos(null);
  }, [canGuess]);

  // Clear highlight if the highlighted tile gets revealed
  useEffect(() => {
    if (highlightedPos !== null) {
      const tile = grid.find((t) => t.position === highlightedPos);
      if (tile?.state === 'REVEALED') setHighlightedPos(null);
    }
  }, [grid, highlightedPos]);

  const handleTileClick = (position: number) => {
    if (!canGuess) return;
    if (highlightedPos === position) {
      // Second click on same tile → submit guess
      onTileClick(position);
      setHighlightedPos(null);
    } else {
      // First click → highlight this tile
      setHighlightedPos(position);
    }
  };

  const handleConfirmClick = (e: React.MouseEvent, position: number) => {
    e.stopPropagation();
    onTileClick(position);
    setHighlightedPos(null);
  };

  return (
    <div className="grid w-full max-w-lg grid-cols-5 gap-1.5 sm:gap-2">
      {grid.map((tile) => {
        const isRevealed = tile.state === 'REVEALED';
        const revealedStyle = isRevealed && tile.type ? REVEALED_COLORS[tile.type] : null;
        const spymasterHint = !isRevealed && isSpymaster && tile.type ? SPYMASTER_HINTS[tile.type] : '';
        const clickable = canGuess && !isRevealed;
        const isHighlighted = highlightedPos === tile.position && !isRevealed;

        return (
          <motion.button
            key={tile.position}
            onClick={() => clickable && handleTileClick(tile.position)}
            disabled={!clickable}
            whileHover={clickable ? { scale: 1.05 } : undefined}
            whileTap={clickable ? { scale: 0.95 } : undefined}
            className={`
              relative flex items-center justify-center rounded-lg border-2 box-border px-1 py-3 font-semibold
              transition-all duration-200 sm:py-4
              ${getWordSizeClass(tile.word)}
              ${
                isRevealed
                  ? `${revealedStyle?.bg ?? ''} ${revealedStyle?.text ?? ''} border-transparent opacity-80`
                  : isHighlighted
                    ? 'border-amber-400 bg-amber-400/15 text-(--rmhbox-text) ring-2 ring-amber-400/50'
                    : `border-(--rmhbox-border) bg-(--rmhbox-surface) text-(--rmhbox-text) ${spymasterHint}`
              }
              ${clickable && !isHighlighted ? 'cursor-pointer hover:border-(--rmhbox-accent) hover:bg-(--rmhbox-accent)/10' : ''}
              ${clickable && isHighlighted ? 'cursor-pointer' : ''}
              ${!clickable && !isRevealed ? 'cursor-default' : ''}
            `}
          >
            <span className="text-center leading-tight break-all">{tile.word}</span>

            {/* Confirm guess icon — appears on highlighted tiles */}
            <AnimatePresence>
              {isHighlighted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  onClick={(e) => handleConfirmClick(e, tile.position)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg cursor-pointer hover:bg-amber-300 transition-colors sm:h-6 sm:w-6"
                  title="Confirm guess"
                >
                  <MousePointerClick className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
