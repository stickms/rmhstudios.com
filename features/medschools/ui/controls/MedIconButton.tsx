import type { ComponentProps, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An icon-only round control (`.medapp-round`, 44px). The label is required: it is the accessible name and the native
 * `title`, so there is no hand-rolled tooltip. `aria-haspopup`, `aria-expanded` and the rest pass through.
 */
export function MedIconButton({
  icon: Icon,
  label,
  className,
  ref,
  ...rest
}: Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  icon: LucideIcon;
  label: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="med-icon-button"
      aria-label={label}
      title={label}
      className={cn('medapp-round', className)}
      {...rest}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
