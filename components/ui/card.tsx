import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Card — the repeated content surface. Defaults to the L1 `.glass-fill`
 * elevation (translucent tint + specular rim via shadow-site-sm, no blur — cheap
 * and unlimited per page). Pass `pane` for a singular L2 `.glass-pane` (blur +
 * micro-noise) on hero/section panels, and `interactive` to add the hover
 * tint-raise, press flex, and pointer-tracked specular highlight (for cards that
 * are link/button targets). See the redesign doc §7.2.
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
      data-glass-light={interactive ? '' : undefined}
      className={cn(
        pane ? 'glass-pane' : 'glass-fill',
        'text-site-text flex flex-col gap-5 py-5 sm:gap-6 sm:py-6 transition-[box-shadow,border-color,transform,background-color]',
        interactive && 'glass-interactive hover:-translate-y-px',
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
