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
        // Track = a tiny glass tube: recessed inset shadow (like an input well),
        // flooded with accent glass when on (§7.2).
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-site-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-colors',
        checked ? 'bg-site-accent' : 'bg-site-glass-ink',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          // Knob = a convex glass bead: white-top radial + a small drop shadow so
          // it lifts off the tube on every theme.
          'block h-4 w-4 rounded-full bg-[radial-gradient(circle_at_50%_32%,rgba(255,255,255,0.98),rgba(214,222,236,0.78))] shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform',
          checked ? 'translate-x-[24px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  );
}
