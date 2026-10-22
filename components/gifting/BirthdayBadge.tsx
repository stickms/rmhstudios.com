'use client';

/**
 * The profile's birthday chip (G1). Mounted only when the server says it is the
 * owner's day, and lazy-loaded, so a normal profile view pays nothing. The
 * confetti plays once and is skipped entirely under reduced motion.
 */
import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PartyPopper } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const PIECES = Array.from({ length: 14 }, (_, i) => ({
  x: ((i * 37) % 100) - 50,
  y: -30 - ((i * 53) % 40),
  r: (i * 71) % 360,
  tone: ['bg-site-accent', 'bg-site-success', 'bg-site-warning', 'bg-site-danger'][i % 4]!,
}));

export default function BirthdayBadge() {
  const { t } = useTranslation('f-gifting');
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-3 mt-3 inline-flex">
      <span className="glass-fill inline-flex items-center gap-1.5 rounded-site-sm px-3 py-1.5 text-sm font-medium text-site-text">
        <PartyPopper className="size-4 text-site-accent" aria-hidden />
        {t('birthday-today', { defaultValue: "It's their birthday today" })}
      </span>
      {reduce ? null : (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
          {PIECES.map((p, i) => (
            <motion.span
              key={i}
              className={`absolute left-1/2 top-1/2 size-1.5 rounded-site-sm ${p.tone}`}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x * 2, y: p.y * 2, opacity: 0, rotate: p.r }}
              transition={{ duration: 1.4, ease: 'easeOut', delay: i * 0.02 }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
