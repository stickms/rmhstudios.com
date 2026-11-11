import { cn } from '@/lib/utils';

interface SwitchProps {
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
 * Steel K6: an accessible on/off toggle (role="switch"). Track 44 x 16px, 8px radius, `--site-border`, ink when on.
 * The thumb is a real 22 x 12px pill (6px radius, 2px inset) that slides 18px in 140 ms (M2) and is chrome per
 * section 4.1: flat grey at rest, chrome when the pointer is within 20px, over the row (`.chrome-row`), focused or
 * pressed. The 44 x 44px hit area is the button's own `::after` (A3).
 *
 * The wrapper span owns `--c` and the 20px proximity zone (`.chrome-host`, app/styles/steel-chrome.css), so clicking
 * that zone does not toggle the switch. The thumb carries `data-chrome="pill"` for the renderer (section 4.3 V4).
 */
export function Switch({ checked, onCheckedChange, disabled, className, ...rest }: SwitchProps) {
  return (
    <span className={cn('chrome-host inline-flex shrink-0', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-slot="switch"
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative block h-4 w-11 shrink-0 rounded-site bg-site-border transition-[background-color] duration-(--m1) ease-[ease] after:absolute after:inset-x-0 after:-inset-y-3.5 after:content-['']",
          checked && 'bg-site-text',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          data-chrome="pill"
          className={cn(
            'chrome-thumb absolute top-0.5 left-0.5 block h-3 w-[22px] rounded-full transition-[translate] duration-(--m2) ease-[ease]',
            checked ? 'translate-x-[18px]' : 'translate-x-0',
          )}
        />
      </button>
    </span>
  );
}
