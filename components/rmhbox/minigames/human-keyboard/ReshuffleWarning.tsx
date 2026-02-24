/**
 * ReshuffleWarning — Countdown overlay for key reshuffling.
 *
 * Shows "Reshuffling in 3… 2… 1…" and auto-dismisses when
 * the countdown reaches zero.
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface ReshuffleWarningProps {
  /** Seconds until reshuffle; null or 0 hides the overlay */
  secondsRemaining: number | null;
}

export default function ReshuffleWarning({ secondsRemaining }: ReshuffleWarningProps) {
  const visible = secondsRemaining != null && secondsRemaining > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="reshuffle-warning"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm"
        >
          <div className="text-center">
            <p className="text-sm font-medium text-(--rmhbox-text-muted) mb-1">
              Reshuffling keys in…
            </p>
            <motion.span
              key={secondsRemaining}
              initial={{ opacity: 0, scale: 1.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-4xl font-extrabold text-(--rmhbox-accent)"
            >
              {secondsRemaining}
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
