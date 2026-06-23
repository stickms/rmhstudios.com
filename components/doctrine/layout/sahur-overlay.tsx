import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useDoctrineSahur } from '@/hooks/useDoctrineSahur';
import { SAHUR_WINDOW } from '@/lib/doctrine/constants';

/**
 * Full-screen Sahur Mode overlay.
 * Tung Tung Tung Doctrine: Maximum intensity. The smell is the weapon.
 */
export function SahurOverlay() {
  const { t } = useTranslation("c-doctrine");
  const { sahurActive, sahurCountdown } = useDoctrineSahur();
  const [dismissed, setDismissed] = useState(false);
  const [showGreeting, setShowGreeting] = useState(true);

  useEffect(() => {
    if (sahurActive) {
      setDismissed(false);
      setShowGreeting(true);
      const timer = setTimeout(() => setShowGreeting(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [sahurActive]);

  if (!sahurActive || dismissed) return null;

  return (
    <AnimatePresence>
      {showGreeting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
          style={{
            background: 'radial-gradient(ellipse at center, #2D1A00 0%, #1A0F00 50%, #0A0500 100%)',
          }}
          onClick={() => setShowGreeting(false)}
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 10, stiffness: 100 }}
            className="text-center px-6"
          >
            <motion.p
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              className="text-5xl md:text-7xl font-black tracking-tight"
              style={{ color: '#F59E0B', textShadow: '0 0 40px rgba(245,158,11,0.5)' }}
            >
              {SAHUR_WINDOW.greeting}
            </motion.p>
            <p className="text-base md:text-lg text-amber-300/60 mt-3 md:mt-4 font-mono">
              {sahurCountdown} minutes remaining — {SAHUR_WINDOW.xpMultiplier}x XP
            </p>
            <p className="text-sm text-amber-300/30 mt-4 md:mt-6">
              {t("tap-to-enter", { defaultValue: "Tap to enter" })}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
