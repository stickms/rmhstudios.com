import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:ring-site-accent/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg",
  {
    variants: {
      variant: {
        default:
          'bg-site-accent text-site-accent-fg hover:bg-site-accent-hover shadow-sm border border-site-accent',
        destructive:
          'bg-site-danger text-white hover:bg-site-danger/90 shadow-sm border border-site-danger',
        danger:
          'bg-site-danger text-white hover:bg-site-danger/90 shadow-sm border border-site-danger',
        outline:
          'border border-site-border bg-site-surface text-site-text hover:bg-site-surface-hover hover:border-site-text/40 shadow-sm',
        secondary:
          'border border-site-border bg-site-bg-subtle text-site-text hover:bg-site-surface-hover',
        ghost: 'text-site-text hover:bg-site-surface-hover',
        link: 'text-site-accent underline-offset-4 hover:underline lowercase tracking-normal text-sm font-medium',
        accent:
          'bg-site-accent text-site-accent-fg hover:bg-site-accent-hover shadow-sm border border-site-accent',
        'accent-outline': 'border border-site-text text-site-text hover:bg-site-text hover:text-site-bg',
        'accent-ghost': 'text-site-text hover:bg-site-surface-hover',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3.5',
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 px-5 text-[0.9375rem] has-[>svg]:px-4',
        icon: 'size-10',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
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
