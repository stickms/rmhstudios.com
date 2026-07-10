import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Canonical loading placeholder. Uses the site surface colour + pulse so
 * skeletons match the design system across the app.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-site-sm bg-site-surface", className)}
      {...props}
    />
  )
}

export { Skeleton }
