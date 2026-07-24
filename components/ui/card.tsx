import * as React from 'react';

import { cn } from '@/lib/utils';

/** Shared spatial-minimal content surface. */
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
      className={cn(
        'flex flex-col gap-5 rounded-site border border-site-border bg-site-surface py-5 text-site-text transition-[border-color,transform,background-color] duration-200 sm:gap-6 sm:py-6',
        pane && 'bg-site-surface',
        interactive && 'hover:-translate-y-0.5 hover:border-site-border-bright',
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
