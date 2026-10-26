/**
 * Font sample and picker. A scheme font is a *name* that resolves to a face, a
 * size and flags depending on the screen height; the sample renders it the way
 * the preview will, in the face that is actually active at the current
 * resolution, and says plainly when that face is a stand-in or missing.
 */
'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cssWeight, fontFamilyFor, fontStatus, type FontStatus } from '@/lib/tf2-hud/assets/fonts';
import { describeFont, fontInstalled } from '@/lib/tf2-hud/scheme/inspect';
import type { FontDef, Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { cn } from '@/lib/utils';
import { Pill, Popover, TextField } from './ui';

export const SAMPLE_TEXT = 'Health 125 · Quick brown fox 0123';

export function useFontStatusLabel() {
  const { t } = useTranslation('c-tf2-hud');
  return (s: FontStatus) =>
    ({
      custom: t('font-custom', { defaultValue: 'custom file' }),
      placeholder: t('font-placeholder', { defaultValue: 'placeholder' }),
      system: t('font-system', { defaultValue: 'system font' }),
      missing: t('font-missing', { defaultValue: 'not installed' }),
    })[s];
}

export function statusTone(s: FontStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  return s === 'custom'
    ? 'success'
    : s === 'placeholder'
      ? 'warning'
      : s === 'missing'
        ? 'danger'
        : 'neutral';
}

/** Rendered text in one face, at a size capped so it fits a list row. */
export function FaceSample({
  def,
  px,
  text = SAMPLE_TEXT,
  className,
}: {
  def: FontDef;
  px: number;
  text?: string;
  className?: string;
}) {
  return (
    <span
      className={cn('block truncate text-(--app-text)', className)}
      style={{
        fontFamily: fontFamilyFor(def.name),
        fontWeight: cssWeight(def.weight),
        fontStyle: def.italic ? 'italic' : 'normal',
        textDecoration: def.underline ? 'underline' : 'none',
        fontSize: Math.max(11, Math.min(30, px)),
        lineHeight: 1.25,
        textShadow: def.dropshadow ? '1px 1px 0 rgb(0 0 0 / 0.85)' : undefined,
        WebkitTextStroke: def.outline ? '0.6px rgb(0 0 0 / 0.9)' : undefined,
      }}
    >
      {text}
    </span>
  );
}

export function FontSummary({
  scheme,
  name,
  screenH,
}: {
  scheme: Scheme;
  name: string;
  screenH: number;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const label = useFontStatusLabel();
  const info = describeFont(scheme, name, screenH);
  if (!info) {
    return (
      <p className="text-[11px] text-(--app-warning)">
        {t('font-unknown', { defaultValue: 'No scheme font named “{{name}}”', name })}
      </p>
    );
  }
  const active = info.faces.find((f) => f.active) ?? info.faces[info.faces.length - 1];
  const status = fontStatus(active.def.name, fontInstalled);
  return (
    <div className="min-w-0 space-y-0.5">
      <FaceSample def={active.def} px={active.px} />
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-(--app-text-dim)">
        <span className="font-mono">
          {active.def.name} · {Math.round(active.px * 10) / 10}px
          {active.proportional ? ' (scales)' : ''} · {active.def.weight || 400}
        </span>
        <Pill tone={statusTone(status)}>{label(status)}</Pill>
      </p>
    </div>
  );
}

export function FontField({
  value,
  onChange,
  scheme,
  screenH,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  scheme: Scheme;
  screenH: number;
  label: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const names = useMemo(
    () => [...scheme.fontNames.values()].sort((a, b) => a.localeCompare(b)),
    [scheme],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? names.filter((n) => n.toLowerCase().includes(q)) : names).slice(0, 80);
  }, [names, query]);

  return (
    <div className="min-w-0 space-y-1">
      <button
        ref={setAnchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) px-2 text-start text-xs text-(--app-text) hover:border-(--app-accent)"
      >
        <span className="truncate">{value || t('none', { defaultValue: '(none)' })}</span>
        <ChevronDown className="size-3.5 shrink-0 text-(--app-text-dim)" aria-hidden />
      </button>
      {value ? <FontSummary scheme={scheme} name={value} screenH={screenH} /> : null}
      <Popover
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        label={t('font-picker', { defaultValue: 'Font picker' })}
        width={340}
      >
        <TextField
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('font-search', { defaultValue: 'Search scheme fonts' })}
          aria-label={t('font-search', { defaultValue: 'Search scheme fonts' })}
        />
        <ul
          className="mt-2 max-h-72 space-y-0.5 overflow-y-auto"
          role="listbox"
          aria-label={t('font-picker', { defaultValue: 'Font picker' })}
        >
          {shown.map((n) => {
            const info = describeFont(scheme, n, screenH);
            const active = info?.faces.find((f) => f.active) ?? info?.faces[info.faces.length - 1];
            return (
              <li key={n} role="option" aria-selected={n.toLowerCase() === value.toLowerCase()}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(n);
                    setOpen(false);
                  }}
                  className={cn(
                    'block w-full rounded-(--app-radius-sm) px-2 py-1 text-start hover:bg-(--app-surface-hover)',
                    n.toLowerCase() === value.toLowerCase() && 'bg-(--app-accent-dim)',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2 text-[11px] text-(--app-text-muted)">
                    <span className="truncate font-semibold">{n}</span>
                    {active ? (
                      <span className="shrink-0 font-mono text-(--app-text-dim)">
                        {Math.round(active.px)}px
                      </span>
                    ) : null}
                  </span>
                  {active ? <FaceSample def={active.def} px={active.px} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}
