'use client';

/**
 * PinnedHero — Track D's signature pinned scroll-narrative hero.
 *
 * Built on the frozen `ScrollScene` primitive: on md+ viewports the stage pins
 * to the top for a few screens while big Inter display type composes itself as
 * scroll `progress` scrubs 0→1 (transform/opacity only). The end state
 * (progress = 1) is the fully-composed beauty shot, so ScrollScene's
 * reduced-motion fallback (which fixes progress at 1 in natural flow) reads as a
 * finished, static hero with no dead space.
 *
 * On small viewports the page scrolls inside a nested `data-scroll-root`
 * container (not the window), where ScrollScene's window-based `useScroll` can't
 * advance — so we render a NON-pinned static composition there instead of a
 * frozen pinned stage. The swap is pure CSS (`hidden md:block` / `md:hidden`),
 * which keeps SSR/first-paint identical and avoids any hydration mismatch.
 *
 * Consumes ScrollScene; never modifies it.
 */
import type { ReactNode } from 'react';
import { motion, useTransform } from 'framer-motion';
import type { MotionValue, MotionStyle } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { ScrollScene } from '@/components/motion';

export interface PinnedHeroProps {
  /** Small mono eyebrow above the headline. */
  eyebrow: string;
  /** Display headline (may include <br/> and an accent <span>). */
  title: ReactNode;
  /** Supporting line under the headline. */
  subtitle: string;
  /** CTA row / secondary actions, revealed last. */
  actions?: ReactNode;
  /** Scroll affordance label (pinned desktop only). Omit to hide. */
  scrollCue?: string;
  /** Viewport-heights the pinned scene scrolls through. */
  screens?: number;
}

/** Shared presentational frame. `styles` carries per-slot motion/plain styles. */
function HeroFrame({
  styles,
  eyebrow,
  title,
  subtitle,
  actions,
  scrollCue,
  minH,
}: {
  styles: {
    glow: MotionStyle;
    eyebrow: MotionStyle;
    title: MotionStyle;
    subtitle: MotionStyle;
    actions: MotionStyle;
    cue: MotionStyle;
  };
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  actions?: ReactNode;
  scrollCue?: string;
  minH: string;
}) {
  return (
    <div
      className={`relative flex ${minH} flex-col items-center justify-center overflow-hidden px-5 py-16 text-center sm:px-8`}
    >
      {/* Accent atmosphere — pinned behind the type, scales with progress. */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={styles.glow}>
        <div
          className="absolute left-1/2 top-[42%] h-[70vh] w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--site-accent) 34%, transparent), transparent 70%)',
          }}
        />
      </motion.div>

      <motion.p
        className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-site-text-muted sm:text-sm"
        style={styles.eyebrow}
      >
        {eyebrow}
      </motion.p>

      <motion.h1
        className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-[-0.022em] text-site-text sm:text-6xl lg:text-7xl"
        style={{ ...styles.title, fontFamily: 'var(--site-font-display)' }}
      >
        {title}
      </motion.h1>

      <motion.p
        className="mt-7 max-w-xl text-base leading-relaxed text-site-text-muted sm:text-lg"
        style={styles.subtitle}
      >
        {subtitle}
      </motion.p>

      {actions && (
        <motion.div className="mt-9 flex flex-wrap items-center justify-center gap-3" style={styles.actions}>
          {actions}
        </motion.div>
      )}

      {scrollCue && (
        <motion.div
          aria-hidden
          className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-1.5 text-site-text-dim"
          style={styles.cue}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.24em]">{scrollCue}</span>
          <motion.span
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </motion.div>
      )}
    </div>
  );
}

/** Pinned (desktop) stage — drives each slot off scroll progress. */
function AnimatedStage({
  progress,
  ...content
}: { progress: MotionValue<number> } & Omit<PinnedHeroProps, 'screens'>) {
  const glowScale = useTransform(progress, [0, 1], [1.22, 1]);
  const glowOpacity = useTransform(progress, [0, 1], [0.35, 0.9]);
  const eyebrowOpacity = useTransform(progress, [0, 0.3], [0, 1]);
  const eyebrowY = useTransform(progress, [0, 0.3], [14, 0]);
  // Title stays fully visible from the first frame (the pinned screen is never
  // blank); it only settles in scale/position as you scrub.
  const titleScale = useTransform(progress, [0, 1], [1.06, 1]);
  const titleY = useTransform(progress, [0, 1], [26, 0]);
  const subOpacity = useTransform(progress, [0.2, 0.58], [0, 1]);
  const subY = useTransform(progress, [0.2, 0.58], [26, 0]);
  const actOpacity = useTransform(progress, [0.42, 0.78], [0, 1]);
  const actY = useTransform(progress, [0.42, 0.78], [22, 0]);
  const cueOpacity = useTransform(progress, [0, 0.08, 0.72, 0.9], [0, 1, 1, 0]);

  return (
    <HeroFrame
      {...content}
      minH="min-h-[100svh]"
      styles={{
        glow: { scale: glowScale, opacity: glowOpacity },
        eyebrow: { opacity: eyebrowOpacity, y: eyebrowY },
        title: { scale: titleScale, y: titleY },
        subtitle: { opacity: subOpacity, y: subY },
        actions: { opacity: actOpacity, y: actY },
        cue: { opacity: cueOpacity },
      }}
    />
  );
}

const STATIC_STYLES = {
  glow: { scale: 1, opacity: 0.8 },
  eyebrow: { opacity: 1 },
  title: { scale: 1 },
  subtitle: { opacity: 1 },
  actions: { opacity: 1 },
  cue: { opacity: 0 },
};

export function PinnedHero({ screens = 2.6, scrollCue, ...content }: PinnedHeroProps) {
  return (
    <>
      {/* md+: pinned, scrubbing scene (window-driven). */}
      <div className="hidden md:block">
        <ScrollScene screens={screens}>
          {(progress) => <AnimatedStage progress={progress} scrollCue={scrollCue} {...content} />}
        </ScrollScene>
      </div>
      {/* Small viewports: composed static hero, no pin (nested scroll root). */}
      <div className="md:hidden">
        <HeroFrame {...content} styles={STATIC_STYLES} minH="min-h-[72svh]" />
      </div>
    </>
  );
}
