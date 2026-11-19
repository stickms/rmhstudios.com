/**
 * Small building blocks shared by both systems' editors: sections, labelled
 * fields, a searchable picker for long lists (spells, feats, equipment), a
 * number stepper and a toggle chip.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-b border-app-border py-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-app-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium text-app-text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-app-text-muted">{hint}</span> : null}
    </label>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm text-app-text-muted', className)}>{children}</p>;
}

/** A toggle drawn as a bordered chip; `aria-pressed` carries the state. */
export function Chip({
  on,
  onToggle,
  children,
  disabled,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-app-sm border px-3 text-sm transition-[background-color,border-color,color] duration-100 pointer-coarse:min-h-11 disabled:opacity-45',
        on
          ? 'border-app-accent bg-app-surface-active font-medium text-app-text'
          : 'border-app-border bg-app-surface text-app-text-muted hover:bg-app-surface-hover',
      )}
    >
      {on ? <Check className="size-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const btn =
    'inline-flex size-8 items-center justify-center rounded-app-sm border border-app-border bg-app-surface text-app-text hover:bg-app-surface-hover disabled:opacity-45 pointer-coarse:size-11';
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={t('stepper.less', { defaultValue: 'Decrease {{label}}', label })}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <span className="min-w-8 text-center font-mono text-sm tabular-nums">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={t('stepper.more', { defaultValue: 'Increase {{label}}', label })}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export interface PickerItem {
  id: string;
  name: string;
  meta?: string;
  text?: string;
  disabled?: boolean;
}

/**
 * A searchable list for choices that run to hundreds of entries. Selected items
 * show first; each row expands to its rules text.
 */
export function Picker({
  items,
  selected,
  onToggle,
  placeholder,
  emptyText,
  limit,
}: {
  items: PickerItem[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  emptyText: string;
  /** Maximum selections; further rows are disabled once reached. */
  limit?: number;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.meta?.toLowerCase().includes(q)) : items;
    const sel = new Set(selected);
    return [...list.filter((i) => sel.has(i.id)), ...list.filter((i) => !sel.has(i.id))].slice(0, 250);
  }, [items, query, selected]);
  const full = limit !== undefined && selected.length >= limit;
  return (
    <div className="flex flex-col gap-2">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <ul className="rmhc-list rounded-app-sm border border-app-border">
        {shown.length === 0 ? <li className="p-3 text-sm text-app-text-muted">{emptyText}</li> : null}
        {shown.map((item) => {
          const on = selected.includes(item.id);
          const disabled = item.disabled || (!on && full);
          return (
            <li key={item.id} className="border-b border-app-border last:border-b-0">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onToggle(item.id)}
                  className={cn(
                    'inline-flex size-8 shrink-0 items-center justify-center rounded-app-sm border pointer-coarse:size-11 disabled:opacity-45',
                    on ? 'border-app-accent bg-app-accent text-app-accent-fg' : 'border-app-border bg-app-surface',
                  )}
                  aria-label={on ? t('picker.remove', { defaultValue: 'Remove {{name}}', name: item.name }) : t('picker.add', { defaultValue: 'Add {{name}}', name: item.name })}
                >
                  {on ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start rounded-app-sm px-1 py-0.5 text-left hover:bg-app-surface-hover"
                  aria-expanded={open === item.id}
                  onClick={() => setOpen(open === item.id ? null : item.id)}
                >
                  <span className="text-sm font-medium text-app-text">{item.name}</span>
                  {item.meta ? <span className="font-mono text-xs text-app-text-muted">{item.meta}</span> : null}
                </button>
              </div>
              {open === item.id && item.text ? <p className="rmhc-prose px-12 pb-3 text-sm text-app-text-muted">{item.text}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A label/value row on a rule, for the computed sheet. */
export function StatRow({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-app-border py-1.5 last:border-b-0">
      <span className="text-sm text-app-text-muted">{label}</span>
      <span className="text-right">
        <span className="font-mono text-sm tabular-nums text-app-text">{value}</span>
        {note ? <span className="block text-xs text-app-text-muted">{note}</span> : null}
      </span>
    </div>
  );
}

export function Issues({ issues }: { issues: string[] }) {
  const { t } = useTranslation('c-rmhcharacters');
  if (!issues.length) return <Muted>{t('issues.none', { defaultValue: 'No rules problems found.' })}</Muted>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {issues.map((i) => (
        <li key={i} className="border-l-2 border-app-warning pl-2 text-app-text">
          {i}
        </li>
      ))}
    </ul>
  );
}

export const nativeSelectClass =
  'h-9 w-full min-w-0 rounded-app-sm border border-app-border bg-app-surface px-2 text-sm text-app-text pointer-coarse:h-11';
