'use client';

import type { ElementType, ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DUR_BASE, DUR_FAST, EASE_OUT_EXPO } from './motionTokens';

export interface AsyncRevealProps {
  /** Keep the presence boundary mounted; toggle only its keyed content. */
  show: boolean;
  as?: ElementType;
  className?: string;
  'aria-label'?: string;
  children?: ReactNode;
}

/**
 * A stable entrance for content that arrives after hydration or polling.
 *
 * The AnimatePresence boundary exists even while empty and `initial={false}`
 * prevents server/loader-seeded content from double-animating. Later content
 * fades/rises once; updates to the same mounted content retain identity and do
 * not restart its entrance.
 */
export function AsyncReveal({
  show,
  as = 'div',
  className,
  'aria-label': ariaLabel,
  children,
}: AsyncRevealProps) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {show && (
        <MotionTag
          key="async-content"
          className={className}
          aria-label={ariaLabel}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={
            reduced
              ? { opacity: 1 }
              : {
                  opacity: 0,
                  y: -4,
                  transition: { duration: DUR_FAST, ease: EASE_OUT_EXPO },
                }
          }
          transition={reduced ? { duration: 0 } : { duration: DUR_BASE, ease: EASE_OUT_EXPO }}
        >
          {children}
        </MotionTag>
      )}
    </AnimatePresence>
  );
}
