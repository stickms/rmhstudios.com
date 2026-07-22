'use client';

/**
 * RevealGroup — a staggered container. Children scroll into view one after
 * another via `staggerChildren`. Use `RevealItem` for each child (or nest your
 * own `motion` children that consume the `fadeRise` variants).
 *
 * Transform/opacity only; degrades to plain elements under reduced motion.
 */
import type { ElementType, ReactNode } from 'react';
import { m as motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { STAGGER, fadeRise } from './motionTokens';

export interface RevealGroupProps {
  /** Gap between each child's start, in seconds. */
  stagger?: number;
  /** Delay before the first child animates, in seconds. */
  delay?: number;
  className?: string;
  as?: ElementType;
  children?: ReactNode;
}

export interface RevealItemProps {
  className?: string;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * A single staggered child. Consumes the parent's `fadeRise` variants — no
 * props needed beyond content. Its element type stays stable when the user's
 * reduced-motion preference resolves after hydration.
 */
export function RevealItem({ as = 'div', className, children }: RevealItemProps) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;
  const variants = reduced
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : fadeRise;
  return (
    <MotionTag className={className} variants={variants}>
      {children}
    </MotionTag>
  );
}

export function RevealGroup({
  stagger = STAGGER,
  delay = 0,
  className,
  as = 'div',
  children,
}: RevealGroupProps) {
  const reduced = useReducedMotion();
  const container: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  };

  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      variants={container}
      initial={reduced ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, margin: '-10% 0px' }}
    >
      {children}
    </MotionTag>
  );
}
