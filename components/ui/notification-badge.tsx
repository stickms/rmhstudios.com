import { cn } from "@/lib/utils"

interface NotificationBadgeProps {
  count: number
  /** Cap before showing "{max}+" (default 99). */
  max?: number
  className?: string
}

/**
 * Canonical unread-count pill. Replaces the hardcoded `bg-red-500 text-white`
 * badges in LeftSidebar / InboxColumn with a single
 * token-driven component.
 */
export function NotificationBadge({ count, max = 99, className }: NotificationBadgeProps) {
  if (!count || count <= 0) return null
  const display = count > max ? `${max}+` : String(count)
  return (
    <span
      className={cn(
        // Danger glass capsule — solid danger core for legibility, plus a top rim.
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-site-danger px-1 text-[10px] font-bold leading-none text-white shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]",
        className
      )}
    >
      {display}
    </span>
  )
}
