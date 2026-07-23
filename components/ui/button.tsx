import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--site-control-radius,12px)] text-sm font-medium tracking-[-0.015em] transition-all duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-site-accent/60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg aria-invalid:ring-site-danger/30 aria-invalid:border-site-danger",
  {
    variants: {
      variant: {
        default:
          'bg-site-accent text-site-accent-fg hover:bg-site-accent-hover shadow-[0_4px_16px_-2px_rgba(56,189,248,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] border border-white/20',
        destructive:
          'bg-site-danger text-white hover:bg-site-danger/90 shadow-[0_4px_16px_-2px_rgba(248,113,113,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] focus-visible:ring-site-danger/40',
        danger:
          'bg-site-danger text-white hover:bg-site-danger/90 shadow-[0_4px_16px_-2px_rgba(248,113,113,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] focus-visible:ring-site-danger/40',
        outline:
          'border border-site-border bg-site-surface/50 backdrop-blur-md text-site-text hover:bg-site-surface-hover hover:border-site-border-bright shadow-sm',
        secondary:
          'border border-site-border/80 bg-site-surface backdrop-blur-md text-site-text hover:bg-site-surface-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        ghost: 'text-site-text hover:bg-site-surface-hover',
        link: 'text-site-accent underline-offset-4 hover:underline',
        accent:
          'bg-site-accent text-site-accent-fg hover:bg-site-accent-hover shadow-[0_4px_16px_-2px_rgba(56,189,248,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] border border-white/20',
        'accent-outline': 'border border-site-accent text-site-accent hover:bg-site-accent-dim',
        'accent-ghost': 'text-site-accent hover:bg-site-accent-dim',
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
