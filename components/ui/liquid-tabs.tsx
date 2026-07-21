'use client';

/**
 * LiquidTabs — the shared active-tab glass capsule that FLOWS between tabs.
 *
 * A thin, presentational tablist (a styled radiogroup, not a router): the caller
 * owns `value`/`onChange` and any URL/panel wiring. The active capsule is one
 * framer-motion `layoutId` element that morphs between tab positions with
 * SPRING.snappy, so switching tabs looks like liquid settling into place.
 *
 * Constraints:
 *  - The capsule carries `.glass-liquid` (ambient sheen) — it IS a signature
 *    surface, so it counts against the ≤3 ambient-sheen-per-page budget (§5.2).
 *  - `layoutId` is `useId()`-scoped so several LiquidTabs on one page never
 *    share a capsule and morph into each other.
 *  - Roving arrow-key nav (WAI-ARIA tabs pattern, mirrored from the creator-
 *    studio tab bar): ←/→/↑/↓ move, Home/End jump, focus follows selection.
 *  - Under reduced motion the capsule jumps (no spring) — the `layoutId`
 *    element stays so the active state is still visible.
 *  - No i18n here: labels/aria-label come from callers (already translated).
 */

import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface LiquidTab {
  id: string;
  /** Already-translated label text. */
  label: string;
  icon?: LucideIcon;
  /** Optional trailing count pill. */
  count?: number;
}

interface LiquidTabsProps {
  tabs: LiquidTab[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'default';
  className?: string;
  /** Accessible name for the tablist (already translated). */
  'aria-label'?: string;
}

export function LiquidTabs({
  tabs,
  value,
  onChange,
  size = 'default',
  className,
  'aria-label': ariaLabel,
}: LiquidTabsProps) {
  const uid = useId();
  const reduced = useReducedMotion();
  // useId scopes the capsule's layoutId so multiple LiquidTabs never collide.
  const layoutId = `liquid-tab-${uid}`;
  const tabId = (id: string) => `${layoutId}-${id}`;

  // Roving keyboard nav (WAI-ARIA tabs pattern, mirrored from the creator-studio
  // tab bar): ←/→/↑/↓ move, Home/End jump to the ends, and focus follows.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === value);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const nextId = tabs[next].id;
    onChange(nextId);
    requestAnimationFrame(() => document.getElementById(tabId(nextId))?.focus());
  };

  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      data-slot="liquid-tabs"
      className={cn('inline-flex items-center gap-1', className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors',
              pad,
              active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="glass-liquid absolute inset-0 rounded-full bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim)]"
                transition={reduced ? { duration: 0 } : SPRING.snappy}
              />
            )}
            {Icon && <Icon className="relative z-1 h-4 w-4 shrink-0" aria-hidden />}
            <span className="relative z-1">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="relative z-1 text-xs opacity-70 tabular-nums">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
