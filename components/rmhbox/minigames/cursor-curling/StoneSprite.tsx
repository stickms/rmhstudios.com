/**
 * StoneSprite — Stone rendering helper for the Cursor Curling minigame.
 *
 * Displays a colored circle with a player initial and an optional
 * motion trail while the stone is moving. Used as a DOM overlay
 * companion to the canvas when needed for tooltips or labels.
 */
'use client';

import { motion } from 'framer-motion';

interface StoneSpriteProps {
  color: string;
  initial: string;
  moving?: boolean;
  size?: number;
}

export default function StoneSprite({ color, initial, moving = false, size = 24 }: StoneSpriteProps) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Motion trail */}
      {moving && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: size + 8,
            height: size + 8,
            backgroundColor: color,
          }}
          animate={{ opacity: [0.3, 0.05], scale: [1, 1.4] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      )}
      {/* Stone body */}
      <div
        className="relative flex items-center justify-center rounded-full border-2 border-white/30"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
        }}
      >
        <span
          className="font-bold text-white select-none"
          style={{ fontSize: size * 0.45 }}
        >
          {initial}
        </span>
      </div>
    </div>
  );
}
