import { useRef, type KeyboardEvent } from 'react';

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
 * It filters what the page shows, it does not navigate, so it is not a tab strip (`Tabs`). Options are
 * `.medapp-chip` pills (36px, 44px on touch); the chosen one is filled with a stronger border and weight 600, the
 * others muted: never colour alone.
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
    <div ref={group} role="radiogroup" aria-label={label} className="medapp-chips" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = i === selected;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="medapp-chip"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
