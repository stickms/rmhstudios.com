import { cn } from '@/lib/utils';
import { STATUS, type StatusKey } from './status';

/** The status's words in its text token, weight 600. The label is passed in (it differs by event or milestone). */
export function StatusText({
  status,
  children,
  className,
}: {
  status: StatusKey;
  children: string;
  className?: string | undefined;
}) {
  return (
    <span className={cn('medapp-status-text', `medapp-status--${STATUS[status].stem}`, className)}>{children}</span>
  );
}
