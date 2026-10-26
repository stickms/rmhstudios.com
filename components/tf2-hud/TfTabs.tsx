/**
 * TfTabs — the TF2 editor's tab strip: flat, square-cornered buttons on a dark
 * rail with an orange underline on the active tab, like the game's own menus.
 *
 * This app is deliberately outside the site's Plasmatic Jelly material (no glass,
 * haze, arcs or soft body), so it cannot use `LiquidTabs`, whose capsule and
 * thumb are jelly. Same contract otherwise: the caller owns `value`/`onChange`,
 * roving arrow-key navigation, `role="tablist"`.
 */
'use client';

import type { LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface TfTab {
  id: string;
  /** Already-translated label. */
  label: string;
  icon?: LucideIcon;
  /** Optional trailing count. */
  count?: number;
  disabled?: boolean;
}

export function TfTabs({
  tabs,
  value,
  onChange,
  size = 'default',
  className,
  'aria-label': ariaLabel,
}: {
  tabs: TfTab[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'default';
  className?: string;
  'aria-label'?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const enabled = tabs.filter((t) => !t.disabled);

  const onKey = (e: KeyboardEvent) => {
    const i = enabled.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % enabled.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = enabled[next].id;
    onChange(id);
    refs.current.get(id)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={cn(
        'tf2hud-tabs flex min-w-0 overflow-x-auto border-b border-(--app-border) bg-(--app-bg-subtle)',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              'tf2hud-tab inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold uppercase tracking-wide disabled:opacity-45',
              size === 'sm' ? 'h-8 px-2.5 text-[11px]' : 'h-10 px-4 text-xs',
              active
                ? 'bg-(--tf2-panel) text-(--app-text)'
                : 'text-(--app-text-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)',
            )}
          >
            {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <span className="font-mono text-(--app-text-dim)">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
