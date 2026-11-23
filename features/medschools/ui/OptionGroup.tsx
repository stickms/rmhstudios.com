import { useRef, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** The option an arrow key lands on from `index`: previous or next, wrapping. Left and right swap in a right-to-left row. */
export function nextOptionIndex(key: string, index: number, count: number, rtl: boolean): number | null {
  if (count === 0) return null;
  const forward = rtl ? ['ArrowLeft', 'ArrowDown'] : ['ArrowRight', 'ArrowDown'];
  const back = rtl ? ['ArrowRight', 'ArrowUp'] : ['ArrowLeft', 'ArrowUp'];
  if (forward.includes(key)) return (index + 1) % count;
  if (back.includes(key)) return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * A horizontal single-select button group (owner O7): `role="radiogroup"`, each option `role="radio"` with
 * `aria-checked`, one tab stop (roving tabindex), arrow keys move and select and wrap, and the row wraps on a phone.
 * It filters what the page shows, it does not navigate, so it is not a tab strip (`Tabs`). Buttons are the `Button`
 * primitive (36px, 44px on touch); the chosen one has an ink border and weight, the others a rule: never colour alone.
 */
export function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = group.current ? getComputedStyle(group.current).direction === 'rtl' : false;
    const next = nextOptionIndex(e.key, selected, options.length, rtl);
    if (next === null) return;
    e.preventDefault();
    const o = options[next];
    if (!o) return;
    onChange(o.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div ref={group} role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = i === selected;
        return (
          <Button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            variant="default"
            size="sm"
            className={cn(checked ? 'border-site-text font-semibold' : 'text-site-text-muted')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
