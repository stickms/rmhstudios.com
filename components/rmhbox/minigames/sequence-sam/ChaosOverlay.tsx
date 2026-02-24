/**
 * ChaosOverlay — "CHAOS ROUND!" announcement for Sequence Sam.
 *
 * Auto-dismisses after 1.5 seconds.
 */
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ChaosOverlayProps {
  isChaos: boolean;
}

export default function ChaosOverlay({ isChaos }: ChaosOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isChaos) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [isChaos]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-(--rmhbox-danger)/90 px-10 py-6 shadow-2xl">
            <AlertTriangle className="h-10 w-10 text-white" />
            <span className="text-3xl font-extrabold tracking-wider text-white">
              CHAOS ROUND!
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
