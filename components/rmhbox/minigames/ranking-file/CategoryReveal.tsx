/**
 * CategoryReveal — Animated display of the current round's category.
 *
 * Shows round counter, category emoji, name, and items list with
 * staggered entrance animations.
 *
 * Props:
 *   category    — { name, items, emoji } for the current round
 *   round       — Current round number
 *   totalRounds — Total number of rounds
 */
'use client';

import { motion } from 'framer-motion';

interface CategoryRevealProps {
  category: { name: string; items: string[]; emoji: string };
  round: number;
  totalRounds: number;
}

export default function CategoryReveal({ category, round, totalRounds }: CategoryRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center gap-5 text-center text-(--rmhbox-text)"
    >
      {/* Round counter */}
      <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
        Round {round} of {totalRounds}
      </p>

      {/* Category emoji + name */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, type: 'spring' }}
        className="flex flex-col items-center gap-2"
      >
        <span className="text-5xl">{category.emoji}</span>
        <h2 className="text-3xl font-extrabold text-(--rmhbox-accent)">
          {category.name}
        </h2>
      </motion.div>

      {/* Items list */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="text-sm text-(--rmhbox-text-muted)"
      >
        Rank these items from best to worst:
      </motion.p>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        {category.items.map((item, i) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 + i * 0.1, duration: 0.3 }}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2 text-base font-medium"
          >
            {item}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
