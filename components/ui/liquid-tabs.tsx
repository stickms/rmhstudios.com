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
 *  - `sheet` (default true, §5.45): the tablist rides its own L1 glass pill so a
 *    tab strip reads as a standalone, tactile control placed BELOW a hero/title
 *    (never buried in header chrome). Wrapper only — the roving nav + layoutId
 *    capsule live on the inner `role="tablist"`, untouched. Pass `sheet={false}`
 *    where the caller supplies its own container.
 */

import { useId, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useLiquidMorph } from './liquid-morph';

export interface LiquidTab {
  id: string;
  /** Already-translated label text. */
  label: string;
  icon?: LucideIcon;
  /** Optional trailing count pill (plain number). */
  count?: number;
  /** Optional unread-count danger badge (overrides `count` styling). */
  badge?: number;
  /** Disabled tabs can't be selected and are skipped by the roving nav. */
  disabled?: boolean;
}

interface LiquidTabsProps {
  tabs: LiquidTab[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'default';
  className?: string;
  /**
   * Wrap the tablist in its own L1 glass pill sheet (§5.45). Default true. When
   * true, `className` styles the sheet; when false, it styles the tablist and the
   * caller owns the container. Turn off where the caller supplies its own sheet.
   */
  sheet?: boolean;
  /**
   * Stretch every tab to equal width and the sheet to the full column width —
   * for section switchers that serve as a page's primary chrome (Inbox, Journey)
   * rather than a compact w-fit control.
   */
  fullWidth?: boolean;
  /** Accessible name for the tablist (already translated). */
  'aria-label'?: string;
}

export function LiquidTabs({
  tabs,
  value,
  onChange,
  size = 'default',
  className,
  sheet = true,
  fullWidth = false,
  'aria-label': ariaLabel,
}: LiquidTabsProps) {
  const uid = useId();
  const reduced = useReducedMotion();
  // useId scopes the capsule's layoutId so multiple LiquidTabs never collide.
  const layoutId = `liquid-tab-${uid}`;
  const tabId = (id: string) => `${layoutId}-${id}`;

  // §5.47 true liquid morphing: velocity squash/stretch on the capsule + a gooey
  // trailing droplet in an underlay. Rides on top of the layoutId spring, which
  // stays the reduced-motion fallback. The capsule lives inside the active tab
  // (pixel-accurate via layout projection); the underlay mirrors it.
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const { squashStyle, underlay } = useLiquidMorph({ capsuleRef, axis: 'x', reduced });

  // Roving keyboard nav (WAI-ARIA tabs pattern, mirrored from the creator-studio
  // tab bar): ←/→/↑/↓ move, Home/End jump to the ends, and focus follows. Disabled
  // tabs are skipped in every direction.
  const step = (from: number, dir: 1 | -1) => {
    const n = tabs.length;
    for (let i = 1; i <= n; i++) {
      const j = ((from + dir * i) % n + n) % n;
      if (!tabs[j].disabled) return j;
    }
    return from;
  };
  const edge = (dir: 1 | -1) => {
    if (dir === 1) return tabs.findIndex((t) => !t.disabled);
    for (let i = tabs.length - 1; i >= 0; i--) if (!tabs[i].disabled) return i;
    return -1;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === value);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = step(idx, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = step(idx, -1);
    else if (e.key === 'Home') next = edge(1);
    else if (e.key === 'End') next = edge(-1);
    else return;
    e.preventDefault();
    if (next < 0 || next === idx) return;
    const nextId = tabs[next].id;
    onChange(nextId);
    requestAnimationFrame(() => document.getElementById(tabId(nextId))?.focus());
  };

  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';

  const list = (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      data-slot="liquid-tabs"
      className={cn(
        'relative flex items-center gap-1',
        fullWidth ? 'w-full' : 'inline-flex',
        !sheet && className,
      )}
    >
      {/* Goo underlay (§5.47) — capsule-only, behind the tabs; labels stay above. */}
      {underlay}
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
            aria-disabled={tab.disabled || undefined}
            disabled={tab.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              pad,
              fullWidth && 'flex-1',
              active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text',
            )}
          >
            {active && (
              // Outer element owns the layoutId projection (position morph); the
              // inner span carries the material + velocity squash, so scaling never
              // fights framer-motion's projection transform (§5.47).
              <motion.span
                ref={capsuleRef}
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0"
                transition={reduced ? { duration: 0 } : SPRING.snappy}
              >
                <motion.span
                  className="glass-liquid absolute inset-0 rounded-full bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim)]"
                  style={squashStyle}
                />
              </motion.span>
            )}
            {Icon && <Icon className="relative z-1 h-4 w-4 shrink-0" aria-hidden />}
            <span className="relative z-1">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="relative z-1 text-xs opacity-70 tabular-nums">{tab.count}</span>
            )}
            {typeof tab.badge === 'number' && (
              <NotificationBadge count={tab.badge} className="relative z-1" />
            )}
          </button>
        );
      })}
    </div>
  );

  if (!sheet) return list;

  // §5.45: the tab strip rides its own L1 glass pill (cheap, repeatable; the
  // hairline glint edge comes from .glass-fill). The wrapper is presentational
  // only — the roving nav + layoutId capsule stay on the inner tablist.
  return (
    <div
      data-slot="liquid-tabs-sheet"
      className={cn(
        'glass-fill glass-bevel-sm rounded-full p-1',
        fullWidth ? 'w-full' : 'w-fit',
        className,
      )}
    >
      {list}
    </div>
  );
}
