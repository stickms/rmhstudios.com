/**
 * GridBoard — 5×5 clickable tile grid for Undercover Agent.
 *
 * Renders 25 tiles in a responsive 5-column grid. Tiles show:
 *   - Their word text prominently
 *   - Color-coded background when revealed (red/blue/beige/black)
 *   - Neutral background when hidden, with hover effects if clickable
 *   - Subtle color borders/tints for spymasters on hidden tiles
 *
 * Operatives can highlight multiple tiles. Clicking a tile toggles its
 * highlight state. Only clicking the confirm circle (bottom-right) submits.
 * A badge in the upper-left shows how many operatives have highlighted
 * each tile (broadcast from the server).
 *
 * Props:
 *   grid: GridTileClient[] — 25 grid tiles
 *   canGuess: boolean — Whether the current user can click tiles
 *   isSpymaster: boolean — Whether to show key-card coloring on hidden tiles
 *   highlightCounts: Record<number, number> — Per-tile operative highlight counts from server
 *   onTileClick: (position: number) => void — Click handler (submits guess)
 *   onHighlightChange: (position: number, highlighted: boolean) => void — Toggle highlight
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { MousePointerClick } from 'lucide-react';
import type { GridTileClient } from './UndercoverAgentGame';

// ─── Color Mapping ───────────────────────────────────────────────

/** Revealed tile background colors by tile type */
const REVEALED_COLORS: Record<string, { bg: string; text: string }> = {
  RED_AGENT: { bg: 'bg-red-600/80', text: 'text-white' },
  BLUE_AGENT: { bg: 'bg-blue-600/80', text: 'text-white' },
  BYSTANDER: { bg: 'bg-amber-200/50 dark:bg-amber-200/40', text: 'text-black' },
  ASSASSIN: { bg: 'bg-neutral-900 border-2 dark:border-white/60 border-neutral-400/60', text: 'text-white' },
};

/** Spymaster key-card border colors for hidden tiles */
const SPYMASTER_HINTS: Record<string, string> = {
  RED_AGENT: 'ring-2 ring-red-500/50',
  BLUE_AGENT: 'ring-2 ring-blue-500/50',
  BYSTANDER: 'ring-2 ring-amber-500/50',
  ASSASSIN: 'ring-2 ring-black-800/60 dark:ring-white-800/60 bg-black/40',
};

/** Get font size class based on word length so long words fit without truncating */
function getWordSizeClass(word: string): string {
  const len = word.length;
  if (len <= 5) return 'text-xs sm:text-sm';
  if (len <= 7) return 'text-xs sm:text-sm';
  if (len <= 9) return 'text-[10px] sm:text-xs';
  if (len <= 12) return 'text-[9px] sm:text-[11px]';
  if (len <= 15) return 'text-[7px] sm:text-[9px]';
  return 'text-[6px] sm:text-[8px]';
}

interface GridBoardProps {
  grid: GridTileClient[];
  canGuess: boolean;
  isSpymaster: boolean;
  highlightCounts: Record<number, number>;
  onTileClick: (position: number) => void;
  onHighlightChange: (position: number, highlighted: boolean) => void;
}

export default function GridBoard({ grid, canGuess, isSpymaster, highlightCounts, onTileClick, onHighlightChange }: GridBoardProps) {
  const { t } = useTranslation("c-rmhbox");
  // Track which tiles the operative has locally highlighted (multi-select)
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());

  // Clear local highlights when canGuess changes (e.g. turn ends)
  useEffect(() => {
    if (!canGuess) setHighlighted(new Set());
  }, [canGuess]);

  // Clear local highlights for tiles that get revealed
  useEffect(() => {
    setHighlighted((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const pos of prev) {
        const tile = grid.find((t) => t.position === pos);
        if (tile?.state === 'REVEALED') {
          next.delete(pos);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [grid]);

  const handleTileClick = useCallback((position: number) => {
    if (!canGuess) return;
    // Toggle highlight
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(position)) {
        next.delete(position);
        onHighlightChange(position, false);
      } else {
        next.add(position);
        onHighlightChange(position, true);
      }
      return next;
    });
  }, [canGuess, onHighlightChange]);

  const handleConfirmClick = useCallback((e: React.MouseEvent, position: number) => {
    e.stopPropagation();
    onTileClick(position);
    setHighlighted((prev) => {
      const next = new Set(prev);
      next.delete(position);
      return next;
    });
  }, [onTileClick]);

  return (
    <div className="grid w-full max-w-lg grid-cols-5 gap-1.5 sm:gap-2">
      {grid.map((tile) => {
        const isRevealed = tile.state === 'REVEALED';
        const revealedStyle = isRevealed && tile.type ? REVEALED_COLORS[tile.type] : null;
        const spymasterHint = isSpymaster && tile.type ? SPYMASTER_HINTS[tile.type] : '';
        const clickable = canGuess && !isRevealed;
        const isHighlighted = highlighted.has(tile.position) && !isRevealed;
        const hlCount = highlightCounts[tile.position] ?? 0;

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
                  ? `${revealedStyle?.bg ?? ''} ${revealedStyle?.text ?? ''} border-transparent opacity-80 ${spymasterHint}`
                  : isHighlighted
                    ? `border-amber-400 bg-amber-400/15 text-(--rmhbox-text) ring-2 ring-amber-400/50 ${spymasterHint}`
                    : `border-(--rmhbox-border) bg-(--rmhbox-surface) text-(--rmhbox-text) ${spymasterHint}`
              }
              ${clickable && !isHighlighted ? 'cursor-pointer hover:border-amber-400/60 hover:bg-transparent' : ''}
              ${clickable && isHighlighted ? 'cursor-pointer' : ''}
              ${!clickable && !isRevealed ? 'cursor-default' : ''}
            `}
          >
            <span className="text-center leading-tight truncate w-full px-0.5">{tile.word}</span>

            {/* Highlight count badge — upper left, visible to everyone when > 0 */}
            <AnimatePresence>
              {hlCount > 0 && !isRevealed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg sm:h-6 sm:w-6"
                  title={t("operatives-highlighting", { count: hlCount, defaultValue: "{{count}} operative highlighting", defaultValue_other: "{{count}} operatives highlighting" })}
                >
                  <span className="text-[9px] font-bold sm:text-[10px]">{hlCount}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Confirm guess icon — bottom right on highlighted tiles */}
            <AnimatePresence>
              {isHighlighted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  onClick={(e) => handleConfirmClick(e, tile.position)}
                  className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg cursor-pointer hover:bg-amber-300 transition-colors sm:h-6 sm:w-6"
                  title={t("confirm-guess", { defaultValue: "Confirm guess" })}
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
