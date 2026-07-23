import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/lib/utils';

/**
 * Shared pill/badge primitive. Consolidates the many inline
 * `inline-flex items-center gap-1 rounded-full …` chips scattered across the
 * feed, profile, predictions and shop columns into one token-driven component
 * so every status/label pill looks the same.
 */
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-[var(--site-control-radius)] border font-semibold whitespace-nowrap transition-colors [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: 'border-site-border bg-site-surface text-site-text-muted',
        accent: 'border-site-accent/20 bg-site-accent-dim text-site-accent',
        solid: 'border-site-accent bg-site-accent text-site-accent-fg',
        success: 'border-site-success/20 bg-site-success/10 text-site-success',
        warning: 'border-site-warning/20 bg-site-warning/10 text-site-warning',
        danger: 'border-site-danger/20 bg-site-danger/10 text-site-danger',
        outline: 'border border-site-border text-site-text-muted',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        default: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
