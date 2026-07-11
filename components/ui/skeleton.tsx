import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Canonical loading placeholder. Uses the site surface colour with a subtle
 * left-to-right shimmer so skeletons read as "loading" without pulsing hard.
 * The shimmer keyframe is scoped here (the ui/* track cannot edit globals.css);
 * `prefers-reduced-motion` neutralizes it site-wide via the global rule, and
 * the base `animate-pulse` is preserved as gentle loading feedback.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-site-sm bg-site-surface animate-pulse",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-shimmer_2s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/[0.06] after:to-transparent",
        className
      )}
      {...props}
    >
      <style>{`@keyframes skeleton-shimmer{100%{transform:translateX(100%)}}`}</style>
    </div>
  )
}

export { Skeleton }
