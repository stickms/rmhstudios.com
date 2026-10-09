'use client';

/**
 * LiquidTabs — the shared tab-strip renderer. A thin, presentational
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
 *  - `layoutId` is `useId()`-scoped so several LiquidTabs on one page never
 *    share a capsule and morph into each other.
 *  - Roving arrow-key nav (WAI-ARIA tabs pattern): ←/→/↑/↓ move, Home/End jump,
 *    focus follows selection (tablist mode only).
 *  - Under reduced motion the capsule jumps (no spring) — the `layoutId`
 *    element stays so the active state is still visible.
 *  - No i18n here: labels/aria-label come from callers (already translated).
 *  - `sheet` (default true, §5.45): the tablist rides its own flush track so
 *    a tab strip reads as a standalone control placed BELOW a hero/title (never
 *    buried in header chrome). Pass `sheet={false}` where the caller supplies
 *    its own container.
 *
 * ## Selection reads as selection, not as a button (2026-10-09)
 *
 * The active tab used to be a solid accent capsule — on the default theme a
 * black pill with white ink, which is ALSO exactly what every primary button on
 * the site looks like ("New", "Create a community", "Sign in"). A page with a
 * tab strip and a primary action therefore showed two identical black pills
 * with opposite meanings: one is where you are, the other is something you can
 * do. It is now Apple's segmented-control grammar instead — a neutral, raised
 * THUMB (opaque surface, hairline, small shadow) on a flush track, with the
 * label in full-strength ink. The accent fill is reserved for actions.
 * High contrast keeps the filled accent thumb, because there the material is
 * gone and a hairline-on-black thumb would be the only cue (see globals.css).
 * The thumb's colours are `--tab-thumb-*` custom properties on the strip, so a
 * game that re-skins it (Slice It!) sets two variables rather than forking.
 *
 * ## One row. Labels never truncate. (2026-10-09)
 *
 * The strip used to be a CSS grid of equal columns that WRAPPED onto further
 * rows when the tabs stopped fitting. In practice that produced two failures,
 * both measured on the live site:
 *   - equal columns ellipsed long labels long before the strip wrapped —
 *     /services rendered six product names as "RMHH…", "RMHL…", "Rebar …",
 *     /library showed "Everyt…" and "Collect…" at 1440px;
 *   - and when it did wrap, a phone got a 2×3 grid of identical buttons that
 *     no longer read as tabs and spent ~150px of the first screen.
 * Now: up to {@link EQUAL_SEGMENT_MAX} tabs split the track into equal segments
 * (the segmented control); more than that size to their own labels. Either way
 * a segment never shrinks below its label. If the row still doesn't fit, it
 * scrolls horizontally — with an edge fade on whichever side has more, and the
 * active tab kept in view — rather than wrapping. A partly visible label at a
 * faded edge is the affordance a wrapped grid never had.
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NotificationBadge } from '@/components/ui/notification-badge';

/**
 * Strips with this many tabs or fewer are a segmented control — equal segments
 * spanning the track. Beyond it the tabs size to their labels, because an equal
 * share of a phone's width is narrower than "Collections".
 */
const EQUAL_SEGMENT_MAX = 4;

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
  /** Hover tooltip — set to the label in `iconOnly` mode; spread it onto the link. */
  title?: string;
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
   * @deprecated No-op — every strip spans the full column width; short strips
   * split it into equal segments (see the layout note in the module docblock).
   * Still accepted so no caller has to change; safe to delete at any call site.
   */
  fullWidth?: boolean;
  /**
   * @deprecated No-op — a strip that outgrows its container always scrolls in one
   * row with an edge fade (see the module docblock); there is nothing to opt into.
   * Still accepted so no caller has to change; safe to delete at any call site.
   */
  scroll?: boolean;
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
  iconOnly = false,
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
      ? 'min-h-9 pointer-coarse:min-h-11 px-3 py-2 text-xs'
      : 'min-h-10 pointer-coarse:min-h-11 px-3.5 py-2.5 text-sm';

  const equal = tabs.length <= EQUAL_SEGMENT_MAX;

  const itemClass = (active: boolean) =>
    cn(
      // A flex item that may GROW but never SHRINK below its label (the
      // `min-w-max` + `shrink-0` pair, with the basis set per mode in
      // globals.css). That is the whole truncation fix: the row scrolls before
      // a label is ever ellipsed.
      'relative flex min-w-max shrink-0 items-center justify-center gap-1.5 rounded-[var(--site-control-radius)] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      pad,
      // Tighter, more square padding while the strip is glyph-only; it relaxes
      // at md, where the labels come back (see globals.css).
      iconOnly && (size === 'sm' ? 'px-2.5 md:px-3' : 'px-3 md:px-4'),
      // Full-strength ink on the active tab, muted on the rest. The ink is the
      // strip's `--tab-thumb-ink` only once the thumb is actually painted (see
      // globals.css) — on high contrast the thumb is the accent, and a label in
      // accent-fg with no thumb behind it measured 1.0:1.
      active ? 'text-site-text' : 'text-site-text-muted hover:text-site-text',
    );

  // The active thumb — identical material in both modes. Outer element owns the
  // layoutId projection (position morph); the inner span carries the material,
  // so scaling never fights framer-motion's projection transform. The material
  // itself (`--tab-thumb-*`) lives in globals.css so themes and games re-skin it
  // with two custom properties.
  const capsule = (active: boolean) =>
    active ? (
      <motion.span
        layoutId={layoutId}
        aria-hidden
        // The hook globals.css uses to decide whether the thumb ink is safe.
        data-tab-capsule=""
        className="absolute inset-0"
        transition={reduced ? { duration: 0 } : SPRING.snappy}
      >
        <span
          data-tab-thumb=""
          className="absolute inset-0 rounded-[var(--site-control-radius)]"
        />
      </motion.span>
    ) : null;

  // Icon + label + count/badge, each above the thumb at z-1. In `iconOnly` mode
  // a tab that has an icon hides its label visually but keeps it as the
  // `sr-only` accessible name (the button/link also gets a `title` tooltip).
  const content = (tab: LiquidTab) => {
    const Icon = tab.icon;
    const compactLabel = iconOnly && Boolean(Icon);
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
          <span className="relative z-1 text-xs opacity-70 tabular-nums">{tab.count}</span>
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
  // switch (docs/ui-perf-audit-2026-10-09.md, NAV-1). A ResizeObserver
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
  const revealActive = useCallback(
    (smooth: boolean) => {
      const el = listRef.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      const active = el.querySelector<HTMLElement>('[data-tab-active="true"]');
      if (!active) return;
      const inset = 24; // clear the edge fade
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      const view = el.scrollLeft;
      const behavior = smooth && !reduced ? 'smooth' : 'auto';
      if (left - inset < view) el.scrollTo({ left: Math.max(0, left - inset), behavior });
      else if (right + inset > view + el.clientWidth)
        el.scrollTo({ left: right + inset - el.clientWidth, behavior });
    },
    [reduced],
  );

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
  const innerClass = cn('relative w-full min-w-0', sheet ? 'p-1' : className);

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
          data-has-icon={tab.icon ? '' : undefined}
          data-tab-active={active ? 'true' : 'false'}
          className="relative flex min-w-max shrink-0"
        >
          {capsule(active)}
          {renderTab!(tab, {
            active,
            id: tabId(tab.id),
            'aria-current': active ? 'page' : undefined,
            className: cn(itemClass(active), 'flex-1'),
            title: tab.icon ? tab.label : undefined,
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
        title={tab.icon ? tab.label : undefined}
        data-has-icon={tab.icon ? '' : undefined}
        data-tab-active={active ? 'true' : 'false'}
        className={itemClass(active)}
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
    'data-tab-icon-only': iconOnly ? '' : undefined,
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

  if (!sheet) return list;

  return (
    <div
      data-slot="liquid-tabs-sheet"
      className={cn(
        // Always full width: the track spans its container.
        //
        // `.glass-inset` (the field tier): a segmented control's track is a
        // flush fill on the page and the thumb sits raised on it — the same
        // role an input field plays. It also supplies the degradation rules
        // (high contrast, reduced transparency, print) for free. globals.css
        // tints the track neutrally so a white thumb reads on a white page.
        //
        // `--site-radius` (22px on the default theme), NOT `--site-control-radius`
        // (9999px): on one row the track is ~44px tall, so 22px IS the pill, and
        // it tracks each theme's own radius scale.
        'glass-inset w-full min-w-0 max-w-full rounded-[var(--site-radius)]',
        className,
      )}
    >
      {list}
    </div>
  );
}
