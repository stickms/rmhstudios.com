'use client';

/**
 * Gabriel's Horn — the handful of primitives this game repeats.
 *
 * The full-screen tier ships its own controls (see `components/CLAUDE.md`), so
 * rather than five slightly different buttons across five screens there are
 * three things here and nothing else: a button, a panel, and a seat's avatar.
 * All three are `--app-*` tokens end to end, so the light and high-contrast
 * appearances come out right without any screen knowing they exist.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover)',
  secondary:
    'bg-(--app-surface) text-(--app-text) border border-(--app-border) hover:bg-(--app-surface-hover)',
  ghost: 'text-(--app-text-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)',
  danger:
    'bg-transparent text-(--app-danger) border border-(--app-danger) hover:bg-(--app-danger-dim)',
};

export interface HornButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  /** React 19 passes refs as an ordinary prop — no `forwardRef` wrapper needed. */
  ref?: Ref<HTMLButtonElement>;
}

export function HornButton({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: HornButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--app-radius-sm)] font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        // Minimum heights rather than padding alone: the game is played on a
        // phone, mid-round, under a clock. `sm` is used for icon-only chrome
        // and inline row actions, and padding on a 12px glyph gives a ~26px
        // target — small enough to miss twice while a phase timer runs.
        size === 'sm' ? 'min-h-9 px-2.5 py-1.5 text-xs' : 'min-h-11 px-4 py-2.5 text-sm',
        VARIANT[variant],
        className,
      )}
      {...rest}
    />
  );
}

/**
 * A glass surface, by role.
 *
 * `pane` (L2) is the default: a singular panel, blurred. `fill` (L1) is for
 * anything REPEATED — it carries no backdrop blur, which is the whole reason
 * the two tiers are separate (design-language.md §5.1: zero blurred surfaces on
 * repeated list items). Picking the tier by what the surface *is* rather than by
 * how it should look is what keeps the elevation reading consistently.
 */
export function Panel({
  children,
  className,
  tier = 'pane',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  tier?: 'pane' | 'fill';
  as?: 'section' | 'div' | 'aside';
}) {
  return (
    <Tag className={cn(tier === 'fill' ? 'gh-fill' : 'gh-pane', 'p-3.5', className)}>
      {children}
    </Tag>
  );
}

/**
 * A seat's face. Falls back to an initial rather than a broken image, because
 * the roster is how you tell who is lying to you and a hole in it is a hole in
 * the game.
 */
export function SeatAvatar({
  name,
  avatarUrl,
  size = 32,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  className?: string;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-full object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-(--app-surface-active) font-semibold text-(--app-text-muted)',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </span>
  );
}
