import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app tier's button (`.medapp-btn`): the context's control height (44px on touch, 40px with a fine pointer), a 14px
 * radius and 14px medium text, so a button never looks like the pill toggles and filters beside it. `primary` is the
 * ink fill (one per view), `secondary` paper with a rule, `tertiary` a text button (underlined, with the full hit area
 * and a hover fill, so it still reads as something to press), `danger` paper in the danger colour (the label always
 * names the action). It is a native `<button>`: focus is the app tier's global ring, `disabled` is the native
 * attribute, and `loading` disables it and sets `aria-busy` (nothing spins: the app tier has no keyframes).
 */
export type MedButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

/** The class list of a button variant, for a `Link` that is drawn as a button. */
export function medButtonClass(variant: MedButtonVariant = 'secondary'): string {
  return cn('medapp-btn', variant !== 'secondary' && `medapp-btn--${variant}`);
}

export function MedButton({
  variant = 'secondary',
  loading,
  disabled,
  className,
  type = 'button',
  ...rest
}: Omit<ComponentProps<'button'>, 'type'> & {
  type?: 'button' | 'submit' | 'reset';
  variant?: MedButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      data-slot="med-button"
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(medButtonClass(variant), className)}
      {...rest}
    />
  );
}
