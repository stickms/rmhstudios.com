import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/**
 * Canonical empty / zero-state block. Replaces the many inconsistent
 * `px-4 py-16/py-20/py-24 text-center text-site-text-muted` empty messages
 * with one consistently-spaced component.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className
      )}
    >
      {Icon ? <Icon className="h-10 w-10 text-site-text-dim" aria-hidden /> : null}
      {title ? (
        <p className="text-sm font-medium text-site-text">{title}</p>
      ) : null}
      {description ? (
        <p className="max-w-sm text-sm text-site-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
