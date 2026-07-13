'use client';

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

/** Accessible on/off toggle (role="switch") styled with site tokens. */
export function Switch({ checked, onCheckedChange, disabled, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-site-border transition-colors',
        checked ? 'bg-site-accent' : 'bg-site-surface-active',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          // Subtle knob shadow (an iOS-style micro-detail, deliberately not the
          // page-level shadow-site token) lifts the knob off the track on every theme.
          'block h-4 w-4 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform',
          checked ? 'translate-x-[24px] bg-site-accent-fg' : 'translate-x-[3px] bg-site-text-dim'
        )}
      />
    </button>
  );
}
