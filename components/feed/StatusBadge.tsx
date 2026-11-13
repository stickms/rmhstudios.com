import { cn } from'@/lib/utils';
import { EmojiText } from '@/components/ui/emoji';
import type { UserStatus } from'@/lib/profile/status';

/**
 * StatusBadge — a small recessed glass pill showing a user's custom status
 * (§10). The status is drawn with `EmojiText`, so its emoji are Twemoji in the
 * first paint and stay so when the owner edits it (the global provider only
 * reaches what it has observed, and only after its chunk has loaded). The
 * leading emoji is decorative; the text carries the meaning.
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
'inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-sm text-site-text-muted',
 className,
 )}
 >
 {status.emoji ? (
 <span aria-hidden className="text-base leading-none">
 <EmojiText>{status.emoji}</EmojiText>
 </span>
 ) : null}
 {status.text ? <EmojiText className="truncate">{status.text}</EmojiText> : null}
 </span>
 );
}
