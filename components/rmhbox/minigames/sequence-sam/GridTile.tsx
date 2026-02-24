/**
 * GridTile — Individual tile in the Sequence Sam 3×3 grid.
 *
 * States: default, flashing, tapped-correct, tapped-incorrect, disabled.
 * Provides visual + accessible feedback on user interaction.
 */
'use client';

import { useCallback } from 'react';
import { motion } from 'framer-motion';

export type TileState = 'default' | 'flashing' | 'tapped-correct' | 'tapped-incorrect' | 'disabled';

export interface GridTileProps {
  index: number;
  state: TileState;
  interactive: boolean;
  onTap: (index: number) => void;
}

const STATE_STYLES: Record<TileState, string> = {
  default:            'bg-(--rmhbox-surface) border-(--rmhbox-border) hover:bg-(--rmhbox-surface-hover)',
  flashing:           'bg-(--rmhbox-accent) border-(--rmhbox-accent) scale-105',
  'tapped-correct':   'bg-(--rmhbox-success)/30 border-(--rmhbox-success)',
  'tapped-incorrect': 'bg-(--rmhbox-danger)/30 border-(--rmhbox-danger)',
  disabled:           'bg-(--rmhbox-surface) border-(--rmhbox-border) opacity-40',
};

export default function GridTile({ index, state, interactive, onTap }: GridTileProps) {
  const row = Math.floor(index / 3) + 1;
  const col = (index % 3) + 1;

  const handleTap = useCallback(() => {
    if (!interactive || state === 'disabled') return;
    onTap(index);
  }, [interactive, state, index, onTap]);

  return (
    <motion.button
      type="button"
      onClick={handleTap}
      disabled={!interactive || state === 'disabled'}
      aria-label={`Tile row ${row} column ${col}`}
      className={`aspect-square min-w-[80px] rounded-xl border-2 transition-colors duration-200 ${STATE_STYLES[state]} ${
        interactive && state === 'default' ? 'cursor-pointer active:scale-95' : 'cursor-default'
      }`}
      animate={{
        scale: state === 'flashing' ? 1.05 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    />
  );
}
