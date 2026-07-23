import type { ReactNode } from'react';
import { cn } from'@/lib/utils';

interface ContextRailProps {
 children?: ReactNode;
 /** Preserve the rail's width when it has no content, keeping narrow pages centered. */
 reserve?: boolean;
 /** Wide content pages need only a small trailing breathing gutter. */
 compactReserve?: boolean;
 className?: string;
}

/** Desktop-only contextual column shared by the feed and standard pages. */
export function ContextRail({
 children,
 reserve = false,
 compactReserve = false,
 className,
}: ContextRailProps) {
 if (children) {
 return (
 <aside
 data-slot="context-rail"
 className={cn('hidden w-64 shrink-0 self-start xl:block 2xl:w-72', className)}
 >
 {children}
 </aside>
 );
 }

 if (!reserve) return null;

 return (
 <div
 aria-hidden="true"
 data-slot="context-rail-spacer"
 className={
 compactReserve ?'hidden w-3 shrink-0 xl:block':'hidden w-64 shrink-0 xl:block 2xl:w-72'
 }
 />
 );
}
