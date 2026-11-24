import type { ReactNode } from 'react';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/** One list row's shape: a disc, a name and a line, in a paper panel. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="medapp-panel">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="medapp-row items-center">
          <span className="medapp-skeleton size-9 rounded-full" />
          <div className="medapp-row__body flex flex-col gap-2">
            <span className="medapp-skeleton h-4 w-48 max-w-full" />
            <span className="medapp-skeleton h-3 w-32 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The shape of one chart. */
export function ChartSkeleton() {
  return <span className="medapp-skeleton h-56 w-full" aria-hidden="true" />;
}

/**
 * Shows `skeleton` until `ready`, then the content, which fades in only when the skeleton was seen (M9). Content that
 * is ready on first render (server rendered, cached) gets no fade. A changed filter never brings the skeleton back: the
 * query keeps its previous answer (`placeholderData`) and the caller passes `stale` to dim it until the new one lands.
 */
export function SkeletonSwap({
  ready,
  skeleton = <ListSkeleton />,
  stale = false,
  children,
}: {
  ready: boolean;
  /** Defaults to the list-row skeleton. */
  skeleton?: ReactNode;
  /** The content is the previous answer while a changed filter loads: dimmed and busy, never replaced by a skeleton. */
  stale?: boolean;
  children: ReactNode;
}) {
  const arrival = useArrival(ready);
  return ready ? (
    <div className={cn(arrival, 'medapp-swap', stale && 'medapp-stale')} aria-busy={stale || undefined}>
      {children}
    </div>
  ) : (
    <>{skeleton}</>
  );
}
