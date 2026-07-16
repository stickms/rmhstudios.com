'use client';

import { useState, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';

interface GeneratingStateProps {
  /** Big heading (e.g. "Composing your world…"). */
  title: string;
  /** Status lines that cycle to show work is happening. */
  steps: string[];
  /** Optional reassurance line under the steps. */
  note?: string;
  /** Render full-screen (default) or inline as an overlay fill. */
  fill?: boolean;
}

/**
 * Animated "the AI is working" feedback. Generation is a single awaited request,
 * so we can't show true per-step progress — instead we cycle descriptive status
 * lines and run an indeterminate bar so the wait never feels frozen. Used by
 * every generative loading surface (world setup, chapter transitions, continue).
 */
export function GeneratingState({ title, steps, note, fill = true }: GeneratingStateProps) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;
    // Advance through the steps once and hold on the last — a forward sense of
    // progress instead of an endless loop that reads as "stuck".
    const t = setInterval(() => setI(v => (v < steps.length - 1 ? v + 1 : v)), 1600);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className={`flex flex-col items-center justify-center gap-5 px-8 text-center ${fill ? 'min-h-[100dvh]' : 'h-full w-full'}`}>
      {/* Pulsing quill mark */}
      <motion.div
        className="text-3xl"
        style={{ color: '#c4a35a' }}
        animate={{ scale: [1, 1.15, 1], rotate: [0, 6, -6, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        ✦
      </motion.div>

      <h2 className="text-2xl tracking-wide" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}>
        {title}
      </h2>

      {/* Cycling status line */}
      <div className="h-6 relative w-full max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={i}
            className="absolute inset-x-0 text-sm italic"
            style={{ color: '#a89888' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
          >
            {steps[i] ?? steps[0]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Indeterminate progress bar */}
      <div className="w-full max-w-xs h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(196,163,90,0.12)' }}>
        <motion.div
          className="h-full w-1/3 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, #c4a35a, transparent)' }}
          animate={{ x: ['-120%', '320%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {note && <p className="text-xs max-w-xs" style={{ color: '#6f6657' }}>{note}</p>}
    </div>
  );
}
