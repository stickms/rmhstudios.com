'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AppleHeroProps {
  /** Small uppercase kicker above the title. */
  eyebrow?: ReactNode;
  /** The big San-Francisco display headline. */
  title: ReactNode;
  /** Supporting lead paragraph. */
  subtitle?: ReactNode;
  /** Optional call-to-action row (buttons, links). */
  actions?: ReactNode;
  /** Centered (marketing) or start-aligned (index pages). */
  align?: 'center' | 'start';
  /** Compact removes the tall vertical padding for denser pages. */
  compact?: boolean;
  className?: string;
}

/**
 * A reusable Apple-style parallax hero. Big SF display type, a lead line, and
 * two drifting monochrome auras for depth. Motion is 100% CSS
 * (`u-parallax-hero` + `u-reveal`, native scroll-driven timelines) so it is
 * scroller-agnostic and freezes to its finished state under reduced motion —
 * nothing ever stays hidden.
 */
export function AppleHero({
  eyebrow,
  title,
  subtitle,
  actions,
  align = 'center',
  compact = false,
  className,
}: AppleHeroProps) {
  return (
    <section
      data-slot="apple-hero"
      className={cn(
        'apple-hero',
        align === 'center' ? 'apple-hero--center' : 'apple-hero--start',
        compact && 'apple-hero--compact',
        className,
      )}
    >
      <span className="apple-hero__aura apple-hero__aura--a u-parallax-hero" aria-hidden />
      <span className="apple-hero__aura apple-hero__aura--b u-parallax-hero" aria-hidden />
      <div className="apple-hero__inner u-reveal">
        {eyebrow ? <p className="apple-hero__eyebrow">{eyebrow}</p> : null}
        <h1 className="apple-hero__title display-hero">{title}</h1>
        {subtitle ? <p className="apple-hero__sub text-pretty">{subtitle}</p> : null}
        {actions ? <div className="apple-hero__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
