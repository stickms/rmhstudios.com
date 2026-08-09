'use client';

/**
 * The layout every document-shaped Bum's Rush screen sits in.
 *
 * One place owns the four things that are wrong on some screen if they are
 * written out per-screen:
 *
 * 1. **Safe areas on all four edges, not just the bottom.** This game is played
 *    on a phone held sideways, which is exactly when the notch takes a long
 *    edge and `padding-bottom: env(safe-area-inset-bottom)` is a half-fix
 *    (design-language.md §12.1 rule 1).
 * 2. **Clearance for `GameBackLink`.** The route pins that control at
 *    `0.75rem + var(--safe-top)`; a screen whose title starts at the top edge
 *    puts an h1 underneath it.
 * 3. **A width cap.** On a 3440px ultrawide an uncapped column is a line of
 *    text nobody can track back to the start of; on a 320px phone the same
 *    column must not have side padding that leaves 280px of usable width.
 *    `clamp()` on the gutters and a `max-width` on the column handle both.
 * 4. **No inner scroller.** These screens are documents and scroll the
 *    document, which is what lets mobile Safari collapse its toolbars (§12.1
 *    rule 6). The parent supplies `.app-page`; this supplies the column.
 *
 * The heading is `clamp()`ed rather than breakpointed because the constraint is
 * the *shorter* axis: a 2532×1170 phone in landscape is 844×390 CSS px and has
 * plenty of width and almost no height, so a title sized off width alone eats
 * the screen. `vmin` is the axis that is actually scarce.
 */

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InkButton } from '../paper/InkControls';

export type ScreenWidth = 'narrow' | 'medium' | 'wide';

const WIDTHS: Record<ScreenWidth, string> = {
  narrow: 'max-w-xl',
  medium: 'max-w-3xl',
  wide: 'max-w-6xl',
};

interface ScreenFrameProps {
  title: string;
  /** One line under the title. Optional — most screens do not need one. */
  subtitle?: string;
  children: ReactNode;
  width?: ScreenWidth;
  onBack?: () => void;
  backLabel?: string;
  /** Rendered opposite the title; keep it to one control. */
  headerRight?: ReactNode;
  className?: string;
}

export function ScreenFrame({
  title,
  subtitle,
  children,
  width = 'medium',
  onBack,
  backLabel,
  headerRight,
  className,
}: ScreenFrameProps) {
  return (
    <div
      className={cn('flex w-full flex-1 flex-col', className)}
      style={{
        // The top gutter also clears the route's own back link, which is pinned
        // to the window rather than to this column.
        paddingTop: 'calc(clamp(3.25rem, 7vmin, 4.5rem) + var(--safe-top))',
        paddingLeft: 'calc(clamp(0.75rem, 3vmin, 2rem) + var(--safe-left))',
        paddingRight: 'calc(clamp(0.75rem, 3vmin, 2rem) + var(--safe-right))',
        paddingBottom: 'clamp(1.5rem, 5vmin, 3rem)',
      }}
    >
      <div className={cn('mx-auto flex w-full flex-1 flex-col', WIDTHS[width])}>
        <header className="mb-[clamp(1rem,3vmin,2rem)] flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {onBack ? (
              <InkButton
                size="sm"
                className="mb-3"
                onClick={onBack}
                aria-label={backLabel}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span>{backLabel}</span>
              </InkButton>
            ) : null}
            <h1
              className="font-bold tracking-tight text-balance text-bum-ink"
              style={{ fontSize: 'clamp(1.5rem, 4.5vmin, 2.75rem)', lineHeight: 1.1 }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-prose text-sm text-bum-graphite sm:text-base">{subtitle}</p>
            ) : null}
          </div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
