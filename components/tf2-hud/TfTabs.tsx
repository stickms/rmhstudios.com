/**
 * TfTabs — the TF2 editor's tab strip: flat, square-cornered buttons on a dark
 * rail with an orange underline on the active tab, like the game's own menus.
 *
 * This app is deliberately outside the site's Plasmatic Jelly material (no glass,
 * haze, arcs or soft body), so it cannot use `LiquidTabs`, whose capsule and
 * thumb are jelly. Same contract otherwise: the caller owns `value`/`onChange`,
 * roving arrow-key navigation, `role="tablist"`.
 *
 * When the tabs are wider than the space they are given (a phone), the strip turns into a dropdown of
 * the same tabs, instead of a row that needs scrolling. The strip stays mounted (invisible, out of
 * flow) while collapsed, so its natural width is always known and the tabs come back as soon as they fit.
 */
'use client';

import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Popover } from './ui';

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
  const strip = useRef<HTMLDivElement>(null);
  const enabled = tabs.filter((t) => !t.disabled);
  const [collapsed, setCollapsed] = useState(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  // Collapse when the strip's natural width exceeds the room its parent offers.
  useLayoutEffect(() => {
    const el = strip.current;
    const parent = el?.parentElement?.parentElement;
    if (!el || !parent) return undefined;
    const measure = () => setCollapsed(el.scrollWidth > parent.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs]);

  useEffect(() => {
    if (!collapsed) setOpen(false);
  }, [collapsed]);

  // In a strip that scrolls sideways (a phone), the selected tab must not sit off screen.
  useEffect(() => {
    if (!collapsed)
      refs.current.get(value)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value, collapsed]);

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

  const current = tabs.find((t) => t.id === value) ?? tabs[0];
  const CurrentIcon = current?.icon;
  const compact = size === 'sm';

  return (
    // Collapsed, the strip is still laid out (invisibly, at its full width) to be measured: clip it, or a
    // narrow phone's page scrolls sideways by the overhang.
    <div className={cn('relative min-w-0', collapsed && 'overflow-x-clip', className)}>
      {collapsed ? (
        <>
          <button
            ref={setTrigger}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'tf2hud-tab flex w-full min-w-40 items-center justify-between gap-2 border-b border-(--app-border) bg-(--tf2-panel) font-semibold uppercase tracking-wide text-(--app-text)',
              compact ? 'h-8 px-2.5 text-[11px]' : 'h-10 px-4 text-xs',
              'pointer-coarse:h-11 pointer-coarse:text-xs',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {CurrentIcon ? <CurrentIcon className="size-3.5 shrink-0" aria-hidden /> : null}
              <span className="truncate">{current?.label}</span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-(--app-text-dim)" aria-hidden />
          </button>
          <Popover
            anchor={trigger}
            open={open}
            onClose={() => setOpen(false)}
            label={ariaLabel ?? current?.label ?? ''}
            width={Math.max(220, trigger?.offsetWidth ?? 0)}
          >
            <ul role="listbox" aria-label={ariaLabel} className="-m-2 max-h-72 overflow-y-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.id === value;
                return (
                  <li key={tab.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={tab.disabled}
                      onClick={() => {
                        onChange(tab.id);
                        setOpen(false);
                        trigger?.focus();
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-2 text-start text-xs font-semibold uppercase tracking-wide hover:bg-(--app-surface-hover) disabled:opacity-45 pointer-coarse:min-h-11',
                        active ? 'text-(--app-text)' : 'text-(--app-text-muted)',
                      )}
                    >
                      {Icon ? (
                        <Icon className="size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                      {tab.count !== undefined ? (
                        <span className="font-mono text-(--app-text-dim)">{tab.count}</span>
                      ) : null}
                      {active ? (
                        <Check className="size-3.5 shrink-0 text-(--app-accent-text)" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>
        </>
      ) : null}
      <div
        ref={strip}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKey}
        // While collapsed it is only measured: out of flow, invisible and unreachable.
        inert={collapsed}
        aria-hidden={collapsed || undefined}
        className={cn(
          'tf2hud-tabs flex min-w-0 overflow-x-auto border-b border-(--app-border) bg-(--app-bg-subtle)',
          collapsed && 'pointer-events-none invisible absolute start-0 top-0 w-max max-w-none',
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
                // Touch: 44px tabs with 12px labels.
                'pointer-coarse:h-11 pointer-coarse:text-xs',
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
    </div>
  );
}
