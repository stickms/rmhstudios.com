import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Card — the repeated content surface. Defaults to the L1 `.bg-site-surface border border-site-border`
 * elevation (translucent tint + specular rim via shadow-site-sm, no blur — cheap
 * and unlimited per page). Pass `pane` for a singular L2 `.bg-site-surface border border-site-border` (blur +
 * micro-noise) on hero/section panels, and `interactive` to add the hover
 * tint-raise, press flex, and pointer-tracked specular highlight (for cards that
 * are link/button targets). See the redesign doc §7.2.
 */
function Card({
 className,
 pane = false,
 interactive = false,
 organic = false,
 ...props
}: React.ComponentProps<'div'> & {
 /** Use the L2 `.bg-site-surface border border-site-border` (blur + noise) instead of the default L1 fill. */
 pane?: boolean;
 /** Add hover tint-raise + press flex + pointer specular highlight. */
 interactive?: boolean;
 /** Organic arched corner geometry from minimalist design system. */
 organic?: boolean;
}) {
 return (
 <div
 data-slot="card"
 data-glass-light={interactive ? '' : undefined}
 className={cn(
        // Removed pane conditional as it evaluates to the same solid styles
        'text-site-text flex flex-col gap-3 py-4 sm:gap-4 transition-all duration-300 ease-out border border-site-border bg-site-surface shadow-site-sm',
        organic ? 'rounded-tr-[2.5rem] rounded-bl-[2.5rem] rounded-tl-2xl rounded-br-2xl' : 'rounded-2xl',
        interactive &&'hover:-translate-y-1 hover:shadow-site hover:border-site-text/40',
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
 '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4',
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
 className={cn('leading-none font-serif text-lg font-medium', className)}
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
 return <div data-slot="card-content" className={cn('px-4', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
 return (
 <div
 data-slot="card-footer"
 className={cn('flex items-center px-4 [.border-t]:pt-4', className)}
 {...props}
 />
 );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
