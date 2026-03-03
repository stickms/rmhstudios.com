/**
 * ChaosOverlay — "CHAOS ROUND!" announcement for Sequence Sam.
 *
 * Shows a large overlay with the rotation direction (e.g. "Rotated 90°").
 * Auto-dismisses after 2 seconds.
 */
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ChaosOverlayProps {
  isChaos: boolean;
  /** Degrees the grid will rotate (e.g. 90). */
  rotationDegrees?: number;
}

export default function ChaosOverlay({ isChaos, rotationDegrees = 90 }: ChaosOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isChaos) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2000);
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
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-(--rmhbox-danger)/90 px-12 py-8 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-10 w-10 text-white" />
              <RotateCw className="h-8 w-8 text-white animate-spin" />
            </div>
            <span className="text-4xl font-extrabold tracking-wider text-white">
              CHAOS ROUND!
            </span>
            <span className="text-lg font-bold text-white/80">
              Grid rotates {rotationDegrees}° clockwise
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
