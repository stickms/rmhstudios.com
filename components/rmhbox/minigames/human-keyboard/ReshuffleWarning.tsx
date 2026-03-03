/**
 * ReshuffleWarning — Countdown notice for key reshuffling.
 *
 * Shows "Reshuffling in 3… 2… 1…" as a non-blocking banner
 * above the typing area. Auto-dismisses when countdown reaches zero.
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface ReshuffleWarningProps {
  /** Seconds until reshuffle; null or 0 hides the banner */
  secondsRemaining: number | null;
}

export default function ReshuffleWarning({ secondsRemaining }: ReshuffleWarningProps) {
  const visible = secondsRemaining != null && secondsRemaining > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="reshuffle-warning"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="flex items-center justify-center gap-2 rounded-lg bg-(--rmhbox-accent)/15 px-4 py-2"
        >
          <p className="text-sm font-medium text-(--rmhbox-text-muted)">
            Reshuffling keys in
          </p>
          <motion.span
            key={secondsRemaining}
            initial={{ opacity: 0, scale: 1.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-lg font-extrabold text-(--rmhbox-accent)"
          >
            {secondsRemaining}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
