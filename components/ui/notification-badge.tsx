import { cn } from "@/lib/utils"

interface NotificationBadgeProps {
  count: number
  /** Cap before showing "{max}+" (default 99). */
  max?: number
  className?: string
}

/**
 * Canonical unread-count pill. Replaces the hardcoded `bg-red-500 text-white`
 * badges in LeftSidebar / MobileNav / InboxColumn with a single
 * token-driven component.
 */
export function NotificationBadge({ count, max = 99, className }: NotificationBadgeProps) {
  if (!count || count <= 0) return null
  const display = count > max ? `${max}+` : String(count)
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-site-danger px-1 text-[10px] font-bold leading-none text-white",
        className
      )}
    >
      {display}
    </span>
  )
}
