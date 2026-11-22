import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/** One list row's shape: a name and a figure on a rule. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-site-border py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

/** The shape of one chart. */
export function ChartSkeleton() {
  return <Skeleton className="h-56 w-full" aria-hidden="true" />;
}

/**
 * Shows `skeleton` until `ready`, then the content, which fades in only when the skeleton was seen (M9). Content that
 * is ready on first render (server rendered, cached) gets no fade.
 */
export function SkeletonSwap({
  ready,
  skeleton,
  children,
}: {
  ready: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const arrival = useArrival(ready);
  return ready ? <div className={cn(arrival)}>{children}</div> : <>{skeleton}</>;
}
