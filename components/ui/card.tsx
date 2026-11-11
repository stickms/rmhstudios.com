import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The card parts step their padding up at `sm`. tailwind-merge cannot let an
 * unprefixed caller override (`py-3`) beat a prefixed default (`sm:py-6`), so
 * a compact card silently grew back to 24px from 640px up. Each responsive
 * default is therefore applied only when the caller has not set that axis.
 */
function setsAxis(className: string | undefined, prefixes: readonly string[]) {
  if (!className) return false;
  return className
    .split(/\s+/)
    .some((cls) => prefixes.some((p) => cls.startsWith(`${p}-`) || cls.startsWith(`sm:${p}-`)));
}
const PAD_Y = ['p', 'py', 'pt', 'pb'] as const;
const PAD_X = ['p', 'px', 'ps', 'pe', 'pl', 'pr'] as const;
const GAP = ['gap', 'gap-y'] as const;

/**
 * Steel S1: content sits directly on `--site-bg`, so a Card renders NO background and NO border; it is only a flex
 * column with the shared spacing. The API (`pane`, `interactive`, the parts) is kept so call sites compile; phases 4
 * and 5 remove the call sites page by page, and `pane` and `interactive` change nothing in the meantime.
 */
function Card({
  className,
  pane: _pane = false,
  interactive: _interactive = false,
  ...props
}: React.ComponentProps<'div'> & {
  /** Kept for call-site compatibility. No effect under Steel (S1). */
  pane?: boolean;
  /** Kept for call-site compatibility. No effect under Steel (S1). */
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-5 py-5 text-site-text',
        !setsAxis(className, GAP) && 'sm:gap-6',
        !setsAxis(className, PAD_Y) && 'sm:py-6',
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
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5 sm:[.border-b]:pb-6',
        !setsAxis(className, PAD_X) && 'sm:px-6',
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
      className={cn('text-base leading-snug font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-site-text-muted text-sm leading-relaxed', className)}
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
  return (
    <div
      data-slot="card-content"
      className={cn('px-5', !setsAxis(className, PAD_X) && 'sm:px-6', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center px-5 [.border-t]:pt-5 sm:[.border-t]:pt-6',
        !setsAxis(className, PAD_X) && 'sm:px-6',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
