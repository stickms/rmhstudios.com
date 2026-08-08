'use client';

/**
 * The interactive paper controls: a drawn button, a drawn toggle, and the seat
 * chip that carries a player's identity.
 *
 * These wrap `components/ui/` primitives where the primitive is carrying real
 * behaviour worth inheriting (focus management, disabled semantics) and restyle
 * it, rather than reimplementing a button — the site's focus-visible rings are
 * global and a hand-rolled `<div role="button">` would lose them.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SEAT_MARKS } from '@/lib/bums-rush/constants';
import type { SeatIndex } from '@/lib/bums-rush/types';

type InkButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** `primary` is the one action on the screen; there is never more than one. */
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm min-h-9',
  // 44px is the smallest reliable touch target, and this game is played with
  // thumbs on a phone more often than with a mouse.
  md: 'px-4 py-2 text-base min-h-11',
  lg: 'px-6 py-3 text-lg min-h-14',
} as const;

/**
 * A button drawn in biro: a double border that mimics the graphite under-pass
 * the canvas renderer uses for every stroke (design doc §2.3), so DOM chrome and
 * drawn world look like they came from the same pen.
 *
 * The press state moves the button down onto its own shadow rather than
 * scaling it — a scale transform on text makes it resample and go soft, and
 * this button is frequently the only text on a phone screen.
 */
export function InkButton({
  children,
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: InkButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'relative inline-flex items-center justify-center gap-2 rounded-bum font-medium',
        'border-2 border-bum-ink transition-[transform,background-color,color] duration-150',
        'shadow-[2px_2px_0_0_var(--bum-graphite)]',
        'hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        'disabled:pointer-events-none disabled:opacity-45',
        // `motion-reduce` rather than a JS check: this is presentation only, and
        // the media query is the cheapest correct answer.
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        SIZES[size],
        variant === 'primary' && 'bg-bum-highlight text-bum-ink',
        variant === 'ghost' && 'bg-bum-surface text-bum-ink hover:bg-bum-paper-2',
        variant === 'danger' && 'bg-bum-danger text-bum-paper border-bum-danger',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A checkbox drawn as a hand-ticked box. `appearance-none` on a real
 * `<input type="checkbox">` keeps the semantics, the label association and the
 * keyboard behaviour; only the paint changes.
 */
export function InkToggle({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className={cn(
          'mt-0.5 size-5 shrink-0 appearance-none rounded-bum-sm border-2 border-bum-ink bg-bum-paper',
          'checked:bg-bum-highlight',
          // The tick is drawn with a background image so it inherits the ink
          // colour through `--bum-ink` instead of shipping an asset.
          'checked:bg-[length:80%_80%] checked:bg-center checked:bg-no-repeat',
          'checked:[background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Cpath d=%27M3 8.5l3.2 3.4L13 4.6%27 fill=%27none%27 stroke=%27%231e2430%27 stroke-width=%272.4%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")]',
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-bum-ink">{label}</span>
        {hint ? <span className="block text-xs text-bum-graphite">{hint}</span> : null}
      </span>
    </label>
  );
}

const MARK_PATHS: Record<(typeof SEAT_MARKS)[number], ReactNode> = {
  circle: <circle cx="8" cy="8" r="4.5" />,
  triangle: <path d="M8 3.2 13 12.4H3z" />,
  square: <rect x="4" y="4" width="8" height="8" rx="1" />,
  cross: <path d="M8 3v10M3 8h10" strokeWidth="2.6" strokeLinecap="round" />,
};

/**
 * The seat's forehead mark, drawn as SVG.
 *
 * This is the load-bearing half of the colourblind-safe claim in
 * `lib/game-capabilities.ts`: seat colour alone would leave four players who
 * cannot tell red from green unable to find themselves in a scramble, so the
 * mark travels with the colour everywhere the colour appears — HUD, results,
 * scoreboard, wardrobe.
 */
export function SeatMark({
  seat,
  className,
  title,
}: {
  seat: SeatIndex;
  className?: string;
  title?: string;
}) {
  const mark = SEAT_MARKS[seat];
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-4', className)}
      style={{ color: `var(--bum-seat-${seat + 1})` }}
      fill="currentColor"
      stroke="currentColor"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {MARK_PATHS[mark]}
    </svg>
  );
}
