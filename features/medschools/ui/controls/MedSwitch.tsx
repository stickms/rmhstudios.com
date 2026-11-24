interface MedSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/**
 * An on/off switch: a native `<button role="switch" aria-checked>` with a 44px target. The track fills with the ink when
 * on and the thumb moves 140 ms in response to the press; the state is also the thumb's side, never colour alone. A
 * name comes from `aria-label` or `aria-labelledby`, as for the site's `Switch`.
 */
export function MedSwitch({ checked, onCheckedChange, disabled, className, ...rest }: MedSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="med-switch"
      className={className ? `medapp-switch ${className}` : 'medapp-switch'}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    />
  );
}
