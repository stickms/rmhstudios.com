/** Shared relative-time formatter for rmhladder surfaces. */
export function timeAgo(raw: Date | string | null | undefined): string {
  if (!raw) return 'unknown';
  const ms = Date.now() - new Date(raw as string).getTime();
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
