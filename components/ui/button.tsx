import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

// Steel K1 to K3 (docs/plans/2026-11-11-steel-design-implementation.md section 6): 8px radius, 1px border, 500 weight,
// 14px text, 36px high on a fine pointer and 44px on touch. Hover is a fill change in 90 ms (M1); nothing scales, glows
// or lifts. Focus is the global K10 outline: no component here sets a ring.
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-site border border-transparent text-sm font-medium transition-[background-color,border-color,color,opacity] duration-(--m1) ease-[ease] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:border-site-danger",
  {
    variants: {
      variant: {
        // K1: surface fill, border, ink text.
        default: 'border-site-border bg-site-surface text-site-text hover:bg-site-bg-subtle',
        // K2: ink fill. One per view (R4).
        primary: 'bg-site-accent text-site-accent-fg hover:opacity-88',
        // K3: no border, no fill.
        ghost: 'text-site-text hover:bg-site-bg-subtle',
        // A destructive action: the K1 body with danger text and border (the label names the action; A2).
        danger: 'border-site-danger bg-site-surface text-site-danger hover:bg-site-bg-subtle',
      },
      size: {
        default: 'h-9 px-4 pointer-coarse:h-11 has-[>svg]:px-3',
        xs: "h-7 gap-1 px-3 text-xs pointer-coarse:h-11 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-9 gap-1.5 px-4 pointer-coarse:h-11 has-[>svg]:px-3',
        lg: 'h-9 px-4 pointer-coarse:h-11 has-[>svg]:px-3',
        icon: 'size-9 pointer-coarse:size-11',
        'icon-xs': "size-7 pointer-coarse:size-11 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-9 pointer-coarse:size-11',
        'icon-lg': 'size-9 pointer-coarse:size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading,
  loadingText,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * Show an inline spinner, disable interaction, and set `aria-busy`. This is
     * the canonical way to give a button in-flight feedback — don't hand-roll
     * `disabled={x}` + a separate `<Loader2 />`. Ignored when `asChild` (a Slot
     * must wrap a single child, so no spinner is injected).
     */
    loading?: boolean;
    /** Optional loading label. Both states reserve their width so in-flight feedback never shifts nearby controls. */
    loadingText?: React.ReactNode;
  }) {
  const Comp = asChild ? Slot : 'button';
  // The spinner can only be injected into a real <button>; a Slot must receive a
  // single child, so for asChild we only carry the busy/disabled semantics.
  const hasLoadingState = loading !== undefined && !asChild;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? disabled : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {hasLoadingState ? (
        <span
          data-slot="button-content"
          className="inline-grid min-w-0 items-center justify-items-center gap-[inherit]"
        >
          <span
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit]',
              loading && 'opacity-0',
            )}
            aria-hidden={loading && loadingText ? true : undefined}
          >
            {children}
          </span>
          <span
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit]',
              !loading && 'invisible',
            )}
            aria-hidden={!loading || !loadingText ? true : undefined}
          >
            <Loader2 className={loading ? 'animate-spin' : undefined} aria-hidden />
            {loadingText}
          </span>
        </span>
      ) : !asChild && (typeof children === 'string' || typeof children === 'number') ? (
        // A plain-text label gets a layout-neutral (`display: contents`) element of its own, so the button is never
        // "text-only" to React: React rewrites a lone string child with `textContent`, which would wipe any node a
        // service injected into the button.
        <span data-slot="button-label" className="contents">
          {children}
        </span>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
