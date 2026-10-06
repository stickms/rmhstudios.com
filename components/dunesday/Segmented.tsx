'use client';

/**
 * The glossy Aero segmented control.
 *
 * A `radiogroup`, because every use on this page picks a value (a mode, an
 * order, a week rhythm) rather than switching which panel is shown — the same
 * call the PF2e board makes for its own segmented control, and the reason this
 * is not `LiquidTabs`: there are no panels, and the page has its own art
 * direction. Arrow keys move the selection, per the WAI-ARIA radio pattern.
 */

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  wrap = false,
  className,
}: {
  label: string;
  value: T;
  options: SegOption<T>[];
  onChange: (value: T) => void;
  wrap?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('ds-seg', wrap && 'ds-seg--wrap', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKey(e, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
