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

/** Shared material surface. Repeated content uses tint/rim without blur;
 * `pane` promotes a singular panel to native backdrop frost. The document's
 * liquid runtime owns nearby tap waves and cursor lighting. Palette, fallbacks
 * and performance budgets are defined in docs/liquid-glass-system.md.
 */
function Card({
  className,
  pane = false,
  interactive = false,
  ...props
}: React.ComponentProps<'div'> & {
  /** Use the L2 `.glass-pane` (native frost) instead of the default L1 fill. */
  pane?: boolean;
  /** Add hover tint-raise + press flex + the hover-raised rim glint. */
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      // `firm` rather than the default: a card is a large surface, and the 4%
      // that reads as a crisp press on a button reads as a wobble on something
      // the width of the column. `.glass-interactive:active` remains the
      // reduced-motion fallback (both drive the same `scale` property, so the
      // spring simply wins while it is running — see app/liquid-glass.css).
      data-fluid-press={interactive ? 'firm' : undefined}
      className={cn(
        'flex flex-col gap-5 py-5 text-site-text',
        !setsAxis(className, GAP) && 'sm:gap-6',
        !setsAxis(className, PAD_Y) && 'sm:py-6',
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
