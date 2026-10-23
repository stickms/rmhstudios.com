import { cn } from "@/lib/utils"

interface NotificationBadgeProps {
 count: number
 /** Cap before showing "{max}+" (default 99). */
 max?: number
 className?: string
}

/**
 * Canonical unread-count pill. Replaces the hardcoded `bg-red-500 text-white`
 * badges across the nav and inbox surfaces with a single token-driven component.
 */
export function NotificationBadge({ count, max = 99, className }: NotificationBadgeProps) {
 if (!count || count <= 0) return null
 const display = count > max ? `${max}+` : String(count)
 return (
 <span
 // Tier L jelly (04 §1): static rim only — a pulsing count would be motion that carries
 // meaning. The rim lives in app/jelly-coverage.css §7. Deliberately not a `data-jelly`
 // host: it sits inside buttons, and would swallow their press.
 data-slot="notification-badge"
 className={cn(
 // Danger glass capsule — solid danger core for legibility, plus a top rim.
 "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-site-danger px-1 text-[10px] font-bold leading-none text-site-danger-fg",
 className
 )}
 >
 {display}
 </span>
 )
}
