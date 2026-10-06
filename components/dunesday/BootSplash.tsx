'use client';

/**
 * "Starting Dunesday…" — a Windows 7 boot-screen homage: four coloured lights
 * swirl in and bloom into a glowing orb, then the desktop fades up.
 *
 * Once per browser session, client-only (so the server-rendered page is what
 * crawlers and link previews see), skipped under reduced motion, and a click or
 * any key dismisses it immediately. It lasts under two seconds.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

const KEY = 'dunesday:booted';
const LIGHTS = [
  { color: '#ff5a3c', from: [-140, -60] },
  { color: '#7ad33c', from: [140, -70] },
  { color: '#2ba7ff', from: [-120, 90] },
  { color: '#ffc928', from: [130, 80] },
];

export function BootSplash() {
  const { t } = useTranslation('c-dunesday');
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen: boolean;
    try {
      seen = sessionStorage.getItem(KEY) === '1';
      sessionStorage.setItem(KEY, '1');
    } catch {
      seen = true;
    }
    if (seen || prefersReducedMotion()) return;
    setShow(true);
    const done = window.setTimeout(() => setShow(false), 1900);
    const skip = () => setShow(false);
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.clearTimeout(done);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="ds-boot"
          role="presentation"
          onClick={() => setShow(false)}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="ds-boot-stage" aria-hidden="true">
            {LIGHTS.map((l, i) => (
              <motion.span
                key={l.color}
                className="ds-boot-light"
                style={{ background: `radial-gradient(circle, ${l.color} 0%, transparent 70%)` }}
                initial={{ x: l.from[0], y: l.from[1], opacity: 0, scale: 0.4 }}
                animate={{ x: 0, y: 0, opacity: [0, 1, 1, 0], scale: [0.4, 1, 1.2, 0.6] }}
                transition={{ duration: 1.1, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
            <motion.span
              className="ds-boot-orb"
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.85, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <motion.p
            className="ds-boot-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
          >
            {t('booting', { defaultValue: 'Starting Dunesday' })}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
