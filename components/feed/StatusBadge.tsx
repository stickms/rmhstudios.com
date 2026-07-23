'use client';

import { cn } from'@/lib/utils';
import type { UserStatus } from'@/lib/profile/status';

/**
 * StatusBadge — a small recessed glass pill showing a user's custom status
 * (§10). Emoji render through the global TwemojiProvider. The emoji is
 * decorative; the text carries the meaning.
 */
export function StatusBadge({
 status,
 className,
}: {
 status: UserStatus;
 className?: string;
}) {
 return (
 <span
 data-slot="status-badge"
 className={cn(
'bg-site-surface-hover border border-site-border rounded-2xl shadow-xs inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-site-text-muted',
 className,
 )}
 >
 {status.emoji ? (
 <span aria-hidden className="text-base leading-none">
 {status.emoji}
 </span>
 ) : null}
 {status.text ? <span className="truncate">{status.text}</span> : null}
 </span>
 );
}
