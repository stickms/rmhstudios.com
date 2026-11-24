import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MedMultiOption<V extends string> {
  value: V;
  label: string;
  /** A status disc or a swatch beside the words; the words always print. */
  icon?: ReactNode;
}

/**
 * A compact multi-select (owner 2026-11-24): a trigger drawn as a field (the select's shape, its chevron, the control
 * height) that names the choice ("All events", "3 types", "MD, MD-PhD"), and under it a panel of native checkboxes.
 * The panel hangs below the trigger in the flow's own stacking (absolute inside the control, never fixed), closes on
 * Escape (focus returns to the trigger) and on a press outside, and is in the HTML while closed (`hidden`), so the
 * choice is readable with scripting off. `keepOne` stops the last checked box from being cleared.
 */
export function MedMultiSelect<V extends string>({
  label,
  options,
  value,
  onChange,
  summary,
  keepOne = true,
  className,
  compact = false,
  searchLabel,
  max,
  doneLabel,
}: {
  /** The accessible name of the trigger and the group. */
  label: string;
  options: readonly MedMultiOption<V>[];
  value: readonly V[];
  onChange: (next: V[]) => void;
  /** The trigger's words for a choice. */
  summary: (value: readonly V[]) => string;
  keepOne?: boolean;
  className?: string;
  /** The rail's narrower trigger. */
  compact?: boolean;
  /** A long list (the states): a filter field at the top of the panel, named by this. */
  searchLabel?: string | undefined;
  /** The most options that can be on at once; the rest are disabled while the cap is reached. */
  max?: number | undefined;
  /** The panel's close button on a phone ("Done"). */
  doneLabel: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const full = max !== undefined && value.length >= max;
  const needle = filter.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const toggle = (v: V) => {
    const on = value.includes(v);
    if (on && keepOne && value.length <= 1) return;
    if (!on && full) return;
    const next = on ? value.filter((x) => x !== v) : [...value, v];
    // The options' own order, whatever order they were pressed in.
    onChange(options.map((o) => o.value).filter((x) => next.includes(x)));
  };

  return (
    <div
      ref={wrapRef}
      className={cn('medapp-multi', compact && 'medapp-multi--compact', className)}
      data-slot="med-multi-select"
    >
      <button
        ref={triggerRef}
        type="button"
        className="medapp-select medapp-multi__trigger"
        aria-label={`${label}: ${summary(value)}`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="medapp-multi__summary">{summary(value)}</span>
        <ChevronDown aria-hidden="true" className="medapp-multi__chevron size-4" />
      </button>
      <div
        id={`${id}-panel`}
        role="group"
        aria-label={label}
        className={cn('medapp-multi__panel', searchLabel && 'medapp-multi__panel--long')}
        hidden={!open}
      >
        {searchLabel ? (
          <input
            type="search"
            className="medapp-field medapp-multi__filter"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        ) : null}
        {shown.map((o) => {
          const on = value.includes(o.value);
          return (
            <label key={o.value} className="medapp-checkrow medapp-multi__row">
              <input
                type="checkbox"
                className="medapp-check"
                checked={on}
                aria-disabled={(on && keepOne && value.length <= 1) || (!on && full) ? true : undefined}
                onChange={() => toggle(o.value)}
              />
              {o.icon}
              <span>{o.label}</span>
            </label>
          );
        })}
        {/* A phone shows the panel as a full-width sheet under the toolbar: an obvious way out. */}
        <button
          type="button"
          className="medapp-btn medapp-multi__done"
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
