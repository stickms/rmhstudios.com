'use client';

/**
 * LiquidTabs — the ONE shared tab-strip renderer (§16.2). A thin, presentational
 * tablist (a styled radiogroup, not a router): the caller owns `value`/`onChange`
 * and any URL/panel wiring. The active capsule is one framer-motion `layoutId`
 * element that morphs between tab positions with SPRING.snappy, so switching tabs
 * looks like liquid settling into place.
 *
 * Two modes, one look:
 *  - **Tablist mode** (default): each tab is a `role="tab"` button; `onChange`
 *    + roving arrow-key nav drive selection; the active tab is `aria-selected`.
 *    `idBase` wires `aria-controls` to caller-rendered `role="tabpanel"`s.
 *  - **Link mode** (`renderTab`, §16.2): each tab is rendered by the caller —
 *    typically a TanStack `<Link>` — so route tabs stay crawlable/prefetched.
 *    The container becomes a `<nav>` and the active item is `aria-current="page"`
 *    (not `aria-selected`); LiquidTabs still owns the sheet, capsule and morph.
 *    Selection is the browser's job (href), so `onChange`/roving-arrow selection
 *    don't apply — every link is reachable with Tab/Shift+Tab as usual.
 *
 * Constraints:
 *  - The capsule carries `.glass-liquid` (ambient sheen) — it IS a signature
 *    surface, so it counts against the ≤3 ambient-sheen-per-page budget (§5.2).
 *  - `layoutId` is `useId()`-scoped so several LiquidTabs on one page never
 *    share a capsule and morph into each other.
 *  - Roving arrow-key nav (WAI-ARIA tabs pattern): ←/→/↑/↓ move, Home/End jump,
 *    focus follows selection (tablist mode only).
 *  - Under reduced motion the capsule jumps (no spring) — the `layoutId`
 *    element stays so the active state is still visible.
 *  - No i18n here: labels/aria-label come from callers (already translated).
 *  - `sheet` (default true, §5.45): the tablist rides its own L1 glass pill so a
 *    tab strip reads as a standalone, tactile control placed BELOW a hero/title
 *    (never buried in header chrome). Pass `sheet={false}` where the caller
 *    supplies its own container.
 *  - `scroll` (§5.45 / §5.5x A.4): the tablist scrolls horizontally INSIDE its
 *    sheet when the tabs overflow, so the sheet can stay put (e.g. sticky) while
 *    the tabs slide — the decoupled structure mobile Safari needs (a single
 *    element that is both sticky and overflow-x drops horizontal touch scroll).
 */

import { useEffect, useId, useRef } from 'react';
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

/**
 * Props LiquidTabs hands to a `renderTab` callback in link mode (§16.2). The
 * component owns the sheet, capsule, morph and roving structure; the caller only
 * builds the interactive element (typically a `<Link>`), spreading these onto it.
 */
export interface LiquidTabRenderProps {
  /** Whether this tab is the active one. */
  active: boolean;
  /** Stable dom id for the interactive element (aria/focus target). */
  id: string;
  /** `'page'` on the active item — link mode marks the current route this way. */
  'aria-current': 'page' | undefined;
  /** Class string matching a tablist-mode tab (pad + accent-on-active). */
  className: string;
  /** Pre-composed icon + label + count/badge, already at z-1 above the capsule. */
  children: React.ReactNode;
}

interface LiquidTabsProps {
  tabs: LiquidTab[];
  value: string;
  /** Tablist mode only — link mode navigates via the caller's `<Link>`. */
  onChange?: (id: string) => void;
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
  /**
   * Scroll the tablist horizontally inside its sheet when the tabs overflow the
   * column, instead of wrapping/clipping (§5.45 / §5.5x A.4). Keeps the sheet
   * static (so it can be sticky) while the tabs slide, and edge-fades the ends.
   */
  scroll?: boolean;
  /**
   * Tablist-mode ARIA panel wiring (§16.2). When set, each tab gets a stable dom
   * id `${idBase}-tab-${id}` (instead of the useId-scoped default) and
   * `aria-controls="${idBase}-panel-${id}"`, so the caller can render matching
   * `role="tabpanel"` elements (`id="${idBase}-panel-${id}"` +
   * `aria-labelledby="${idBase}-tab-${id}"`).
   */
  idBase?: string;
  /**
   * Link mode (§16.2). Render each tab through this callback instead of as a
   * `role="tab"` button — for route tabs that must stay crawlable/prefetched
   * `<Link>`s. See {@link LiquidTabRenderProps}. Presence of this prop flips the
   * container to a `<nav>` with `aria-current` semantics.
   */
  renderTab?: (tab: LiquidTab, props: LiquidTabRenderProps) => React.ReactNode;
  /** Accessible name for the tablist / nav (already translated). */
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
  scroll = false,
  idBase,
  renderTab,
  'aria-label': ariaLabel,
}: LiquidTabsProps) {
  const uid = useId();
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLElement>(null);
  // useId scopes the capsule's layoutId so multiple LiquidTabs never collide.
  const layoutId = `liquid-tab-${uid}`;
  // §16.2: with `idBase` the tab dom ids are deterministic so callers can wire
  // aria-controls panels + aria-labelledby back-references; without it they stay
  // useId-scoped (roving focus still works either way).
  const tabId = (id: string) => (idBase ? `${idBase}-tab-${id}` : `${layoutId}-${id}`);
  const panelId = (id: string) => (idBase ? `${idBase}-panel-${id}` : undefined);

  // §5.47 true liquid morphing: velocity squash/stretch on the capsule + a gooey
  // trailing droplet in an underlay. Rides on top of the layoutId spring, which
  // stays the reduced-motion fallback. The capsule lives inside/behind the active
  // tab (pixel-accurate via layout projection); the underlay anchors the shared
  // material sampler without rendering a trailing droplet for tabs.
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const { squashStyle, underlay } = useLiquidMorph({
    capsuleRef,
    axis: 'x',
    reduced,
    activeKey: value,
    // A lagging metaball can detach on wide jumps and reads as an idle dot.
    // Tabs keep the cohesive active pill and its squash/layout animation only.
    trail: false,
  });

  const link = Boolean(renderTab);
  const activeTabId = tabId(value);

  // Route-backed tabs can mount with an active item outside the visible part of
  // a narrow strip. Bring only that item into the nearest horizontal viewport;
  // `block: nearest` prevents this from unexpectedly repositioning the page.
  useEffect(() => {
    if (!scroll) return;
    const item = document.getElementById(activeTabId);
    if (!item || !listRef.current?.contains(item)) return;
    item.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTabId, reduced, scroll]);

  // Roving keyboard nav (WAI-ARIA tabs pattern): ←/→/↑/↓ move, Home/End jump to
  // the ends, and focus follows. Disabled tabs are skipped. Tablist mode only —
  // link mode leaves the browser's native link tabbing untouched.
  const step = (from: number, dir: 1 | -1) => {
    const n = tabs.length;
    for (let i = 1; i <= n; i++) {
      const j = (((from + dir * i) % n) + n) % n;
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
    onChange?.(nextId);
    requestAnimationFrame(() => document.getElementById(tabId(nextId))?.focus());
  };

  const pad = size === 'sm' ? 'min-h-9 px-3 py-1 text-xs' : 'min-h-10 px-4 py-1.5 text-sm';

  const itemClass = (active: boolean) =>
    cn(
      'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      pad,
      fullWidth && 'flex-1',
      active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text',
    );

  // The active capsule — identical material in both modes. Outer element owns the
  // layoutId projection (position morph); the inner span carries the material +
  // velocity squash, so scaling never fights framer-motion's projection transform.
  const capsule = (active: boolean) =>
    active ? (
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
    ) : null;

  // Icon + label + count/badge, each above the capsule at z-1.
  const content = (tab: LiquidTab) => {
    const Icon = tab.icon;
    return (
      <>
        {Icon && <Icon className="relative z-1 h-4 w-4 shrink-0" aria-hidden />}
        <span className="relative z-1">{tab.label}</span>
        {typeof tab.count === 'number' && (
          <span className="relative z-1 text-xs opacity-70 tabular-nums">{tab.count}</span>
        )}
        {typeof tab.badge === 'number' && (
          <NotificationBadge count={tab.badge} className="relative z-1" />
        )}
      </>
    );
  };

  const innerClass = cn(
    'relative flex items-center gap-1',
    // Scroll overflows inside the sheet; otherwise size to content (or full width).
    scroll ? 'tab-sheet-scroll w-full min-w-0' : fullWidth ? 'w-full' : 'inline-flex',
    !sheet && className,
  );

  const items = tabs.map((tab) => {
    const active = tab.id === value;
    if (link) {
      // Link mode: the caller's interactive element and the capsule share a
      // `relative` wrapper — the capsule sits behind the link (a link can't host
      // the layoutId element AND be the focus/aria target cleanly).
      return (
        <div key={tab.id} className={cn('relative shrink-0', fullWidth && 'flex-1')}>
          {capsule(active)}
          {renderTab!(tab, {
            active,
            id: tabId(tab.id),
            'aria-current': active ? 'page' : undefined,
            className: itemClass(active),
            children: content(tab),
          })}
        </div>
      );
    }
    return (
      <button
        key={tab.id}
        id={tabId(tab.id)}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls={panelId(tab.id)}
        aria-disabled={tab.disabled || undefined}
        disabled={tab.disabled}
        tabIndex={active ? 0 : -1}
        onClick={() => onChange?.(tab.id)}
        className={itemClass(active)}
      >
        {capsule(active)}
        {content(tab)}
      </button>
    );
  });

  // Link mode → a <nav> (aria-current semantics); tablist mode → role="tablist"
  // with roving nav. The morph underlay is an invisible coordinate anchor for
  // tabs; the distracting lagging droplet is disabled above.
  const list = link ? (
    <nav
      ref={listRef as React.Ref<HTMLElement>}
      aria-label={ariaLabel}
      data-slot="liquid-tabs"
      className={innerClass}
    >
      {underlay}
      {items}
    </nav>
  ) : (
    <div
      ref={listRef as React.Ref<HTMLDivElement>}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      data-slot="liquid-tabs"
      className={innerClass}
    >
      {underlay}
      {items}
    </div>
  );

  if (!sheet) return list;

  // §5.45: the tab strip rides its own L1 glass pill (cheap, repeatable; the
  // hairline glint edge comes from .glass-fill). The wrapper is presentational
  // only — the roving nav + layoutId capsule stay on the inner tablist/nav.
  return (
    <div
      data-slot="liquid-tabs-sheet"
      className={cn(
        'glass-fill glass-bevel-sm min-w-0 max-w-full rounded-full p-1',
        scroll && 'overflow-hidden',
        fullWidth || scroll ? 'w-full' : 'w-fit',
        className,
      )}
    >
      {list}
    </div>
  );
}
