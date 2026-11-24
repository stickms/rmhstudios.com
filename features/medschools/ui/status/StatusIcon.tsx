import { cn } from '@/lib/utils';
import { STATUS, type StatusKey } from './status';

const BOX = { sm: 'medapp-status-icon--sm', md: '' } as const;

/**
 * A round swatch with the status's stroke icon in its ink token. Decorative whenever the status is also written out
 * beside it (`StatusText`), which is every place it is used: it is `aria-hidden` then. Pass `label` only where the icon
 * stands alone and the swatch must name itself.
 */
export function StatusIcon({
  status,
  size = 'md',
  label,
  className,
}: {
  status: StatusKey;
  size?: keyof typeof BOX;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const def = STATUS[status];
  return (
    <span
      className={cn('medapp-status-icon', BOX[size], `medapp-status--${def.stem}`, className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={def.icon} />
      </svg>
    </span>
  );
}
