import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

// Hover is the shared optical glass response (tilted reflections and rim light).
// Resting variant colours stay stable; focus keeps the site-wide ring (§8).
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--site-control-radius)] border border-transparent text-sm font-medium tracking-[-0.01em] transition-[scale,color,background-color,border-color,opacity] duration-site-fast ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:ring-site-danger/30 aria-invalid:border-site-danger",
  {
    variants: {
      variant: {
        default: 'bg-site-accent text-site-accent-fg hover:bg-site-accent-hover',
        destructive: 'bg-site-danger text-site-danger-fg hover:opacity-85',
        danger: 'bg-site-danger text-site-danger-fg hover:opacity-85',
        // The featured-tier fill (/pricing, /store). Existed only as an inline
        // `style={{ background: 'var(--site-warning)' }}` on a hand-rolled
        // button, which is exactly the local copy §5.2 exists to prevent.
        warning: 'bg-site-warning text-site-warning-fg hover:opacity-85',
        // Hover was border-brighten-only, which on a transparent fill is close
        // to imperceptible — the outline button reads as inert until clicked.
        // A surface tint gives it the same feedback every other variant has.
        outline:
          'border-site-border bg-transparent text-site-text hover:bg-site-surface-hover hover:border-site-border-bright',
        secondary: 'border-site-border bg-site-surface text-site-text hover:bg-site-surface-hover',
        ghost: 'text-site-text hover:bg-site-surface-hover',
        link: 'text-site-accent underline-offset-4 hover:underline',
        accent: 'bg-site-accent text-site-accent-fg hover:bg-site-accent-hover',
        'accent-outline': 'border border-site-accent text-site-accent hover:bg-site-accent-dim',
        'accent-ghost': 'text-site-accent hover:bg-site-accent-dim',
        // The ink-gel primary action (#989): ONE per view. A dense gel of the
        // theme's ink (`--gel-ink`, `--on-ink`), which darkens toward its base
        // through the shared gel coat and wakes its plasma on hover
        // (app/jelly-material.css). Focus is the solid 2px `--focus-ring`,
        // stated here as well so no tier's ring rule can swap in a glow.
        signal:
          'bg-gel-ink text-on-ink font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-focus-ring',
      },
      size: {
        default: 'h-11 px-5 py-2.5 has-[>svg]:px-4',
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-9 gap-1.5 px-4 has-[>svg]:px-3',
        lg: 'h-12 px-7 text-[0.9375rem] has-[>svg]:px-5',
        icon: 'size-11',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-9',
        'icon-lg': 'size-12',
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
      // A control-mode jelly body (lib/jelly/physics.ts, which absorbed the old
      // press layer; `data-fluid-press` stays an accepted alias): a squash toward
      // the contact that starts on pointerdown, is interruptible, wobbles back on
      // release, and cancels itself if the gesture turns into a scroll. The
      // `active:scale-[0.98]` in the variants above stays as the no-JS fallback
      // and for the frame before the spring's first tick — the inline `scale`
      // the service writes wins over it while a finger is down.
      data-fluid-press=""
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
        // "text-only" to React: React rewrites a lone string child with `textContent`, which would wipe the jelly
        // flow carrier, so lib/jelly/flow-carriers.ts gives text-only hosts none and the button would never move.
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
