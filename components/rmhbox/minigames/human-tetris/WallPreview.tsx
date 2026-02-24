/**
 * WallPreview — Shows the incoming wall shape before positioning begins.
 *
 * Displays a miniature preview of the wall pattern with:
 *   - Hole cells highlighted in green
 *   - Dead zone cells marked with skulls
 *   - Required player count for holes
 *   - Entrance animation (slide in from right)
 */
'use client';

import { motion } from 'framer-motion';
import { GRID_COLS, GRID_ROWS, type WallShape } from './WallCanvas';

interface WallPreviewProps {
  wall: WallShape;
  holeCount: number;
  waveNumber: number;
  totalWaves: number;
}

export default function WallPreview({ wall, holeCount, waveNumber, totalWaves }: WallPreviewProps) {
  const previewCellSize = 28;

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.5, type: 'spring', damping: 20 }}
      className="flex flex-col items-center gap-4 text-(--rmhbox-text)"
    >
      <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
        Wave {waveNumber} of {totalWaves}
      </p>

      <motion.h2
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="text-2xl font-bold text-(--rmhbox-accent)"
      >
        Wall Incoming!
      </motion.h2>

      {/* Mini wall preview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg)/80 p-2"
      >
        <div
          className="grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, ${previewCellSize}px)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, ${previewCellSize}px)`,
          }}
        >
          {Array.from({ length: GRID_ROWS }, (_, r) =>
            Array.from({ length: GRID_COLS }, (_, c) => {
              const cellVal = wall.cells[r]?.[c];
              let cellClass = 'bg-(--rmhbox-surface)/20 border border-(--rmhbox-border)/10';
              let content: React.ReactNode = null;

              if (cellVal === 'wall') {
                cellClass = 'bg-gray-600 border border-gray-500';
              } else if (cellVal === 'hole') {
                cellClass = 'bg-emerald-500/30 border border-emerald-400/60';
              } else if (cellVal === 'dead-zone') {
                cellClass = 'bg-red-950/60 border border-red-800/50';
                content = <span className="text-[8px]">💀</span>;
              }

              return (
                <div
                  key={`${r}-${c}`}
                  className={`flex items-center justify-center rounded-[2px] ${cellClass}`}
                  style={{ width: previewCellSize, height: previewCellSize }}
                >
                  {content}
                </div>
              );
            }),
          )}
        </div>
      </motion.div>

      {/* Hole count info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex items-center gap-2 text-sm"
      >
        <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-400/60" />
        <span className="text-(--rmhbox-text-muted)">
          <span className="font-semibold text-(--rmhbox-text)">{holeCount}</span>{' '}
          {holeCount === 1 ? 'player' : 'players'} needed in holes
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0 }}
        className="text-xs text-(--rmhbox-text-muted) animate-pulse"
      >
        Get ready to move!
      </motion.p>
    </motion.div>
  );
}
