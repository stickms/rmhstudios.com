'use client';

/**
 * Achievement pop-ups in the style of an XP/Vista notification-area balloon.
 * Each one dismisses itself after a few seconds; the close button is there for
 * anyone who wants it gone sooner.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { Trophy, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SPRING } from '@/lib/motion';

export interface Balloon {
  id: string;
  title: string;
  body: string;
}

const LIFETIME_MS = 6000;

function BalloonTip({ balloon, onClose }: { balloon: Balloon; onClose: () => void }) {
  const { t } = useTranslation('c-dunesday');
  // Held in a ref so a parent re-render (a new closure) doesn't restart the timer.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const id = window.setTimeout(() => close.current(), LIFETIME_MS);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <motion.div
      layout
      className="ds-balloon"
      role="status"
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={SPRING.soft}
    >
      <Trophy size={22} aria-hidden="true" style={{ flex: 'none', color: '#c98b37' }} />
      <div style={{ flex: 1 }}>
        <strong>{balloon.title}</strong>
        {balloon.body}
      </div>
      <button
        type="button"
        className="ds-mini-btn"
        onClick={onClose}
        aria-label={t('dismiss', { defaultValue: 'Dismiss' })}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </motion.div>
  );
}

export function Balloons({ items, onClose }: { items: Balloon[]; onClose: (id: string) => void }) {
  return (
    <div className="ds-balloons">
      <AnimatePresence>
        {items.map((b) => (
          <BalloonTip key={b.id} balloon={b} onClose={() => onClose(b.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
