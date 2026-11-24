import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app tier's button: a pill chip (`.medapp-chip`, the same control the toggles and the tabs use), so a page has one
 * button shape. `primary` is the ink-filled chip (one per view), `secondary` the paper chip, `ghost` a chip with no
 * border or fill for a quiet action, `danger` a paper chip in the danger colour (the label always names the action).
 * It is a native `<button>`: focus is the app tier's global ring, `disabled` is the native attribute, and `loading`
 * disables it and sets `aria-busy` (nothing spins: the app tier has no keyframes).
 */
export type MedButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function MedButton({
  variant = 'secondary',
  size = 'default',
  loading,
  disabled,
  className,
  type = 'button',
  ...rest
}: Omit<ComponentProps<'button'>, 'type'> & {
  type?: 'button' | 'submit' | 'reset';
  variant?: MedButtonVariant;
  size?: 'default' | 'xs';
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      data-slot="med-button"
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'medapp-chip',
        variant === 'primary' && 'medapp-chip--primary',
        variant === 'ghost' && 'medapp-chip--quiet',
        variant === 'danger' && 'medapp-chip--danger',
        size === 'xs' && 'medapp-chip--xs',
        className,
      )}
      {...rest}
    />
  );
}
