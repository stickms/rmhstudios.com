import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The shared content surface, rendered in the Liquid Glass material.
 *
 * Default is the L1 `.glass-fill` tier (tint + rim, no backdrop blur) because
 * cards are the most repeated surface on the site; `pane` promotes a singular
 * panel to L2 `.glass-pane` (blur + noise), and `interactive` adds the hover
 * tint-raise, press flex and pointer-tracked specular. The classes carry the
 * material — themes and the degradation tiers (high-contrast, reduced
 * transparency, perf-lite) restyle them centrally in `app/globals.css`.
 */
function Card({
  className,
  pane = false,
  interactive = false,
  ...props
}: React.ComponentProps<'div'> & {
  /** Use the L2 `.glass-pane` (blur + noise) instead of the default L1 fill. */
  pane?: boolean;
  /** Add hover tint-raise + press flex + pointer specular highlight. */
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      // `firm` rather than the default: a card is a large surface, and the 4%
      // that reads as a crisp press on a button reads as a wobble on something
      // the width of the column. `.glass-interactive:active` remains the
      // reduced-motion fallback (both drive the same `scale` property, so the
      // spring simply wins while it is running — see globals.css §glass).
      data-fluid-press={interactive ? 'firm' : undefined}
      className={cn(
        'flex flex-col gap-5 py-5 text-site-text sm:gap-6 sm:py-6',
        pane ? 'glass-pane' : 'glass-fill',
        interactive && 'glass-interactive',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-5 sm:px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5 sm:[.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-site-text-muted text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5 sm:px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center px-5 sm:px-6 [.border-t]:pt-5 sm:[.border-t]:pt-6',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
