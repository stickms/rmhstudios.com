'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncReveal } from '@/components/motion';

/**
 * WidgetFrame (groundwork G3) — the shared modular-block surface used by both
 * the profile showcase modules (§12) and the home dashboard widgets (§15) in
 * `docs/plans/2026-07-20-parity-qol-customization-design.md`.
 *
 * It is a single L1 `.glass-fill` `Card` (cheap, unlimited per page — these
 * blocks repeat) with a consistent header, loading skeleton, and
 * `EmptyState`-backed zero state, so every modular block across the site shares
 * one glass material, one empty state, and one skeleton instead of each feature
 * reinventing them.
 *
 * ```tsx
 * <WidgetFrame title="Achievements" icon={Trophy} action={<Button size="xs" />}>
 *   {items.length ? <Grid items={items} /> : null}
 * </WidgetFrame>
 * ```
 * Pass `loading` for the skeleton, or `empty` (+ optional `emptyIcon`/
 * `emptyDescription`) to render the zero state when the block has no content.
 */
export interface WidgetFrameProps {
  /** Block heading. */
  title: React.ReactNode;
  /** Optional heading icon (decorative). */
  icon?: LucideIcon;
  /** Right-aligned header slot (e.g. an "edit" / "see all" control). */
  action?: React.ReactNode;
  /** Show the loading skeleton instead of children. */
  loading?: boolean;
  /** Render the empty state instead of children. */
  empty?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  className?: string;
  /** Body content (ignored when `loading` or `empty`). */
  children?: React.ReactNode;
}

export function WidgetFrame({
  title,
  icon: Icon,
  action,
  loading = false,
  empty = false,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  className,
  children,
}: WidgetFrameProps) {
  // Once a widget has real content, background refreshes keep that subtree
  // mounted. This protects charts/media/local state from restarting just because
  // the widget is fetching a fresher snapshot.
  const hasResolved = React.useRef(!loading);
  if (!loading) hasResolved.current = true;
  const initialLoading = loading && !hasResolved.current;

  return (
    <Card data-slot="widget-frame" className={cn('gap-0 py-0 overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-site-border">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text">
          {Icon ? <Icon className="h-4 w-4 text-site-text-muted" aria-hidden /> : null}
          <span className="truncate">{title}</span>
        </h3>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="px-4 py-3" aria-busy={loading}>
        {initialLoading && (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        <AsyncReveal
          show={!initialLoading}
          className={cn(
            'transition-opacity duration-150',
            loading && hasResolved.current && 'opacity-70',
          )}
        >
          {empty ? (
            <EmptyState
              icon={emptyIcon ?? Icon}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
              className="py-8"
            />
          ) : (
            children
          )}
        </AsyncReveal>
      </div>
    </Card>
  );
}
