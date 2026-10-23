import * as React from "react"

import { cn } from "@/lib/utils"

interface SkeletonProps extends React.ComponentProps<"div"> {
 /**
 * Use the travelling light-sweep instead of the default opacity pulse. Reads
 * as "content streaming in" — nice for above-the-fold / hero placeholders.
 * Reduced-motion-safe (falls back to a static themed surface in
 * `globals.css`).
 */
 shimmer?: boolean
}

/**
 * Canonical loading placeholder. Uses the site surface colour so skeletons
 * match the design system across the app and every theme. Defaults to a
 * gentle `animate-pulse`; pass `shimmer` for a moving highlight sweep.
 */
function Skeleton({ className, shimmer = false, ...props }: SkeletonProps) {
 return (
 <div
 data-slot="skeleton"
 // Tier L jelly (04 §1): the static haze and rim of a card at rest
 // (app/jelly-coverage.css §7), never a carrier — the drift above is
 // the only motion a placeholder may have.
 data-jelly="lite"
 data-jelly-flow="off"
 className={cn(
 // Glass tint fill — reads as light moving through frosted glass; the
 // shimmer highlight (globals.css) rides on top.
 "rounded-site-sm bg-site-surface-hover",
 shimmer ? "animate-shimmer" : "animate-pulse",
 className,
 )}
 {...props}
 />
 )
}

export { Skeleton }
