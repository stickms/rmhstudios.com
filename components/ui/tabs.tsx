/**
 * Tabs — the shared tab-strip renderer. A thin, presentational tablist (a styled radiogroup, not a router): the caller
 * owns `value`/`onChange` and any URL/panel wiring.
 *
 * ## Steel K5 (docs/plans/2026-11-11-steel-design-implementation.md section 6): words on a rule
 *
 * On the site there is ONE appearance: the labels sit on a 1px `--site-border` rule, 22px apart, 10px of vertical
 * padding. Inactive: muted, 500. Active: ink with a 2px ink underline sitting on the rule (A2: state is never colour
 * alone). No pills, no segment backgrounds, no icons, no sheet. The underline changes in 140 ms (M2).
 *
 * The full-screen games and apps keep their own look (L8): under `AppTierContext` the strip is the raised thumb on a
 * track, one framer-motion `layoutId` capsule that morphs between tabs. That branch is the app tier's and is not
 * restyled; `size`, `sheet` and `iconOnly` apply to it only.
 *
 * Two modes, one look:
 *  - **Tablist mode** (default): each tab is a `role="tab"` button; `onChange` + roving arrow-key nav drive selection;
 *    the active tab is `aria-selected`. `idBase` wires `aria-controls` to caller-rendered `role="tabpanel"`s.
 *  - **Link mode** (`renderTab`, §16.2): each tab is rendered by the caller, typically a TanStack `<Link>`, so route
 *    tabs stay crawlable and prefetched. The container becomes a `<nav>` and the active item is `aria-current="page"`.
 *
 * Constraints:
 *  - Roving arrow-key nav (WAI-ARIA tabs pattern): ←/→/↑/↓ move, Home/End jump, focus follows selection (tablist mode).
 *  - One row. Labels never truncate: a row that does not fit scrolls horizontally, with an edge fade on whichever side
 *    has more, and the active tab is kept in view.
 *  - No i18n here: labels/aria-label come from callers (already translated).
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/app-motion';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useIsAppTier } from '@/components/ui/app-tier-context';

/**
 * Strips with this many tabs or fewer are a segmented control — equal segments
 * spanning the track. Beyond it the tabs size to their labels, because an equal
 * share of a phone's width is narrower than "Collections".
 */
const EQUAL_SEGMENT_MAX = 4;

export interface TabItem {
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
 * Props Tabs hands to a `renderTab` callback in link mode (§16.2). The
 * component owns the sheet, capsule, morph and roving structure; the caller only
 * builds the interactive element (typically a `<Link>`), spreading these onto it.
 */
export interface TabRenderProps {
  /** Whether this tab is the active one. */
  active: boolean;
  /** Stable dom id for the interactive element (aria/focus target). */
  id: string;
  /** `'page'` on the active item — link mode marks the current route this way. */
  'aria-current': 'page' | undefined;
  /** App tier only (games/apps): route tabs press like button tabs. Absent on the site. */
  'data-fluid-press'?: string;
  /** Class string matching a tablist-mode tab (pad + accent-on-active). */
  className: string;
  /** Hover tooltip — set to the label in `iconOnly` mode; spread it onto the link. */
  title?: string;
  /** Pre-composed icon + label + count/badge, already at z-1 above the capsule. */
  children: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
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
   * Icon-forward: visually hide each tab's text label (kept as an accessible
   * name via `sr-only` + a hover `title` tooltip) for tabs that carry an `icon`,
   * so crowded strips read as a compact icon row. Tabs without an icon keep
   * their label as a fallback, so this is safe to set on any strip.
   */
  iconOnly?: boolean;
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
   * `<Link>`s. See {@link TabRenderProps}. Presence of this prop flips the
   * container to a `<nav>` with `aria-current` semantics.
   */
  renderTab?: (tab: TabItem, props: TabRenderProps) => React.ReactNode;
  /** Accessible name for the tablist / nav (already translated). */
  'aria-label'?: string;
}

export function Tabs({
  tabs,
  value,
  onChange,
  size = 'default',
  className,
  sheet = true,
  iconOnly = false,
  idBase,
  renderTab,
  'aria-label': ariaLabel,
}: TabsProps) {
  // Games and apps keep the raised thumb (L8); the main site is Steel's words on a rule (K5).
  const appTier = useIsAppTier();
  const uid = useId();
  const listRef = useRef<HTMLElement>(null);
  // useId scopes the capsule's layoutId so multiple Tabs never collide.
  const layoutId = `liquid-tab-${uid}`;
  // §16.2: with `idBase` the tab dom ids are deterministic so callers can wire
  // aria-controls panels + aria-labelledby back-references; without it they stay
  // useId-scoped (roving focus still works either way).
  const tabId = (id: string) => (idBase ? `${idBase}-tab-${id}` : `${layoutId}-${id}`);
  const panelId = (id: string) => (idBase ? `${idBase}-panel-${id}` : undefined);

  const link = Boolean(renderTab);

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
    let next: number;
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

  // Padding drives the pill's size; min-height is only a touch-target floor.
  //
  // These used to be px-4 py-1.5 — 16px of horizontal inset against 6px of
  // vertical, a 2.7:1 ratio, with the height coming from min-h rather than from
  // the padding, so the label read as pinned to the top and bottom edges of its
  // own capsule. A capsule does want slightly more horizontal room (its rounded
  // ends eat into the corners), but the ratio belongs nearer 1.4:1, which is
  // where Apple's segmented controls sit. Same resulting heights, evenly
  // distributed, and `pointer-coarse:min-h-11` keeps the 44px touch floor.
  const pad =
    size === 'sm'
      ? 'min-h-9 pointer-coarse:min-h-11 px-3.5 py-2 text-xs'
      : 'min-h-10 pointer-coarse:min-h-11 px-4.5 py-2.5 text-sm';

  const equal = appTier && tabs.length <= EQUAL_SEGMENT_MAX;

  // K5: words on a rule. The 2px ink underline is the item's own ::after, sitting on the strip's rule (-1px), shown
  // only on the active item (M2: 140 ms). Link mode draws it on the wrapper (`ruleClass`), tablist mode on the button.
  const ruleClass = (active: boolean) =>
    cn(
      "relative flex shrink-0 whitespace-nowrap after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-site-text after:transition-opacity after:duration-(--m2) after:ease-[ease] after:content-['']",
      active ? 'after:opacity-100' : 'after:opacity-0',
    );
  const steelItem = (active: boolean) =>
    cn(
      'flex min-h-9 items-center gap-1.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-(--m1) ease-[ease] pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-40',
      active ? 'text-site-text' : 'text-site-text-muted hover:text-site-text',
    );

  const itemClass = (active: boolean) =>
    cn(
      // A flex item that may GROW but never SHRINK below its label (the
      // `min-w-max` + `shrink-0` pair, with the basis set per mode in
      // globals.css). That is the whole truncation fix: the row scrolls before
      // a label is ever ellipsed.
      'relative flex min-w-max shrink-0 items-center justify-center gap-1.5 rounded-[var(--tab-radius,var(--site-control-radius))] font-medium whitespace-nowrap transition-colors duration-site-fast disabled:cursor-not-allowed disabled:opacity-40',
      pad,
      // Tighter, more square padding while the strip is glyph-only; it relaxes
      // at md, where the labels come back (see globals.css).
      iconOnly && (size === 'sm' ? 'px-2.5 md:px-3' : 'px-3 md:px-4'),
      // Full-strength ink on the active tab, muted on the rest. The ink is the
      // strip's `--tab-thumb-ink` only once the thumb is actually painted (see
      // globals.css) — on high contrast the thumb is the accent, and a label in
      // accent-fg with no thumb behind it measured 1.0:1.
      active
        ? 'text-[color:var(--app-text,var(--site-text))]'
        : 'text-[color:var(--app-text-muted,var(--site-text-muted))] hover:text-[color:var(--app-text,var(--site-text))]',
    );
  const siteItem = (active: boolean) => (appTier ? itemClass(active) : steelItem(active));

  // The active thumb — identical material in both modes. Outer element owns the
  // layoutId projection (position morph); the inner span carries the material,
  // so scaling never fights framer-motion's projection transform. The material
  // itself (`--tab-thumb-*`) lives in globals.css so themes and games re-skin it
  // with two custom properties.
  const capsule = (active: boolean) =>
    appTier && active ? (
      <motion.span
        layoutId={layoutId}
        aria-hidden
        // The hook globals.css uses to decide whether the thumb ink is safe.
        data-tab-capsule=""
        className="absolute inset-0"
        transition={SPRING.snappy}
      >
        <span
          data-tab-thumb=""
          className="absolute inset-0 rounded-[var(--tab-radius,var(--site-control-radius))]"
        />
      </motion.span>
    ) : null;

  // Icon + label + count/badge, each above the thumb at z-1. In `iconOnly` mode
  // a tab that has an icon hides its label visually but keeps it as the
  // `sr-only` accessible name (the button/link also gets a `title` tooltip).
  const content = (tab: TabItem) => {
    const Icon = appTier ? tab.icon : undefined;
    const compactLabel = appTier && iconOnly && Boolean(Icon);
    return (
      <>
        {Icon && (
          <Icon
            className={cn(
              'relative z-1 shrink-0',
              iconOnly ? 'h-[1.15rem] w-[1.15rem] md:h-4 md:w-4' : 'h-4 w-4',
            )}
            aria-hidden
          />
        )}
        <span
          className={cn(
            'liquid-tabs__label relative z-1',
            // Not `sr-only` outright: globals.css applies the sr-only technique
            // below md and lets the label render from md up.
            compactLabel && 'liquid-tabs__label--compact',
          )}
        >
          {tab.label}
        </span>
        {typeof tab.count === 'number' && (
          <span className={cn('relative z-1 text-xs tabular-nums', appTier && 'opacity-70')}>{tab.count}</span>
        )}
        {typeof tab.badge === 'number' && (
          <NotificationBadge count={tab.badge} className="relative z-1" />
        )}
      </>
    );
  };

  // ── Overflow: keep the active tab in view, fade whichever edge has more ──
  //
  // Both are written to the strip itself (never to <html>) and only when the
  // value changes, so a scroll costs one comparison per edge. The edges are
  // re-measured on the strip's own `scroll`, when the strip or its content
  // changes size, and when the selection changes — the only things that can
  // change them.
  //
  // Never measured synchronously on mount. A strip mounts as part of a page
  // switch, and reading `scrollWidth` in a mount effect forced style + layout
  // of the ENTIRE incoming page mid-commit — which the next effect's DOM write
  // then invalidated, so the page was laid out twice before its first paint.
  // On a 4×-throttled CPU that one read was 120–330ms of every tabbed page
  // switch (docs/archive/2026/ui-perf-audit-2026-10-09.md, NAV-1). A ResizeObserver
  // callback runs AFTER the frame's own layout, so the same read there is free.
  const syncEdges = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // Logical start/end, so the fade lands on the right side in RTL too
    // (`scrollLeft` runs 0 → −max there).
    const pos = Math.abs(el.scrollLeft);
    const start = max > 1 && pos > 1 ? 'true' : 'false';
    const end = max > 1 && pos < max - 1 ? 'true' : 'false';
    if (el.dataset.fadeStart !== start) el.dataset.fadeStart = start;
    if (el.dataset.fadeEnd !== end) el.dataset.fadeEnd = end;
  }, []);

  // Bring the selected tab into view inside the strip — by moving the STRIP's
  // scroll offset directly. `scrollIntoView()` would also scroll the document
  // to reach a strip below the fold, yanking the page on first paint.
  // `smooth` only once the strip is on screen: the first reveal jumps.
  const revealActive = useCallback((smooth: boolean) => {
    const el = listRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const active = el.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!active) return;
    const inset = 24; // clear the edge fade
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    const view = el.scrollLeft;
    const behavior = smooth ? 'smooth' : 'auto';
    if (left - inset < view) el.scrollTo({ left: Math.max(0, left - inset), behavior });
    else if (right + inset > view + el.clientWidth)
      el.scrollTo({ left: right + inset - el.clientWidth, behavior });
  }, []);

  const revealRef = useRef(revealActive);
  revealRef.current = revealActive;
  const measuredRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', syncEdges, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      syncEdges();
      revealRef.current(false);
      measuredRef.current = true;
      window.addEventListener('resize', syncEdges);
      return () => {
        el.removeEventListener('scroll', syncEdges);
        window.removeEventListener('resize', syncEdges);
      };
    }
    // Observes the strip (its own width) and its first child (the row's content
    // width moves with it), so a viewport resize, a font swap or a label change
    // all re-measure — after layout, never during it.
    const ro = new ResizeObserver(() => {
      if (!measuredRef.current) {
        measuredRef.current = true;
        revealRef.current(false);
      }
      syncEdges();
    });
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', syncEdges);
    };
  }, [syncEdges]);

  // A selection change. In link mode it arrives with a page switch, so the read
  // waits for the next frame — by then every effect of the commit has written
  // its DOM and the layout this forces is the one the frame paints. Before the
  // first measurement the observer above owns the reveal.
  useEffect(() => {
    if (!measuredRef.current) return;
    const raf = requestAnimationFrame(() => {
      revealActive(true);
      syncEdges();
    });
    return () => cancelAnimationFrame(raf);
  }, [value, revealActive, syncEdges]);

  // The strip is its own scroller, so its padding (not the sheet's) is what keeps
  // the thumb's shadow from being clipped at the scroll box edge.
  const innerClass = appTier
    ? cn('relative w-full min-w-0', sheet ? 'p-1' : className)
    : cn('relative w-full min-w-0', className);

  const items = tabs.map((tab) => {
    const active = tab.id === value;
    if (link) {
      // Link mode: the caller's interactive element and the thumb share a
      // `relative` wrapper — the thumb sits behind the link (a link can't host
      // the layoutId element AND be the focus/aria target cleanly). The wrapper
      // is the flex item; the link fills it.
      return (
        <div
          key={tab.id}
          data-has-icon={appTier && tab.icon ? '' : undefined}
          data-tab-active={active ? 'true' : 'false'}
          className={
            appTier
              ? 'relative flex min-w-max shrink-0 rounded-[var(--tab-radius,var(--site-control-radius))]'
              : ruleClass(active)
          }
        >
          {capsule(active)}
          {renderTab!(tab, {
            active,
            id: tabId(tab.id),
            'aria-current': active ? 'page' : undefined,
            'data-fluid-press': appTier ? '' : undefined,
            className: cn(siteItem(active), 'flex-1'),
            title: appTier && tab.icon ? tab.label : undefined,
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
        // A tooltip whenever the label can be hidden — by `iconOnly`, or by the
        // phone breakpoint that hides labels on any icon-bearing tab.
        title={appTier && tab.icon ? tab.label : undefined}
        data-has-icon={appTier && tab.icon ? '' : undefined}
        data-tab-active={active ? 'true' : 'false'}
        data-fluid-press={appTier ? '' : undefined}
        className={appTier ? itemClass(active) : cn(steelItem(active), ruleClass(active))}
      >
        {capsule(active)}
        {content(tab)}
      </button>
    );
  });

  // Shared attributes. `data-tab-fit` picks the flex basis in globals.css:
  // `equal` segments for a short strip, `content` widths for a long one.
  const listProps = {
    'aria-label': ariaLabel,
    'data-slot': 'liquid-tabs',
    'data-tab-size': size,
    'data-tab-fit': equal ? 'equal' : 'content',
    'data-tab-appearance': appTier ? 'thumb' : 'rule',
    'data-tab-icon-only': appTier && iconOnly ? '' : undefined,
    'data-fade-start': 'false',
    'data-fade-end': 'false',
    className: innerClass,
  } as const;

  // Link mode → a <nav> (aria-current semantics); tablist mode → role="tablist"
  // with roving nav.
  const list = link ? (
    <nav ref={listRef as React.Ref<HTMLElement>} {...listProps}>
      {items}
    </nav>
  ) : (
    <div
      ref={listRef as React.Ref<HTMLDivElement>}
      role="tablist"
      onKeyDown={onKeyDown}
      {...listProps}
    >
      {items}
    </div>
  );

  if (!appTier || !sheet) return list;

  return (
    <div
      data-slot="liquid-tabs-sheet"
      className={cn(
        // The app tier's track: always full width, the field tier surface the raised thumb sits on.
        'glass-inset w-full min-w-0 max-w-full rounded-[var(--site-control-radius)]',
        className,
      )}
    >
      {list}
    </div>
  );
}
