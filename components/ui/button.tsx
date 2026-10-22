import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

// Hover is the shared optical glass response (tilted reflections and rim light).
// Resting variant colours stay stable; focus keeps the site-wide ring (§8).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--site-control-radius)] border border-transparent text-[0.78rem] font-semibold tracking-[-0.01em] transition-[scale,color,background-color,border-color,opacity] duration-site-fast ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:ring-site-danger/30 aria-invalid:border-site-danger",
  {
    variants: {
      variant: {
        default: 'bg-site-accent text-site-accent-fg',
        destructive: 'bg-site-danger text-site-danger-fg',
        danger: 'bg-site-danger text-site-danger-fg',
        // The featured-tier fill (/pricing, /store). Existed only as an inline
        // `style={{ background: 'var(--site-warning)' }}` on a hand-rolled
        // button, which is exactly the local copy §5.2 exists to prevent.
        warning: 'bg-site-warning text-site-warning-fg',
        // Hover was border-brighten-only, which on a transparent fill is close
        // to imperceptible — the outline button reads as inert until clicked.
        // A surface tint gives it the same feedback every other variant has.
        outline: 'border-site-border bg-transparent text-site-text hover:border-site-border-bright',
        secondary: 'border-site-border bg-site-surface text-site-text',
        ghost: 'text-site-text',
        link: 'text-site-accent underline-offset-4 hover:underline',
        accent: 'bg-site-accent text-site-accent-fg',
        'accent-outline': 'border border-site-accent text-site-accent',
        'accent-ghost': 'text-site-accent',
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
  loading = false,
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
    /** Optional label to swap in while loading (e.g. "Saving…"). Falls back to the button's children. */
    loadingText?: React.ReactNode;
  }) {
  const Comp = asChild ? Slot : 'button';
  // The spinner can only be injected into a real <button>; a Slot must receive a
  // single child, so for asChild we only carry the busy/disabled semantics.
  const showSpinner = loading && !asChild;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      // Opt into the site-wide fluid press layer (hooks/useFluidPress): a spring
      // that starts on pointerdown, is interruptible, releases more slowly than
      // it presses, and cancels itself if the gesture turns into a scroll. The
      // `active:scale-[0.98]` in the variants above stays as the fallback for
      // reduced motion and for the frame before the spring's first tick — the
      // inline `scale` the layer writes wins over it while a finger is down.
      data-fluid-press=""
      // The state layer (globals.css §7.3). A link-styled button has no surface to turn over.
      data-evert={variant === 'link' ? undefined : ''}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? disabled : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {showSpinner ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
