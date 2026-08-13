'use client';

/**
 * AnchoredMenu — a dropdown panel that hangs off a trigger inside the page.
 *
 * Two things it does that `absolute bottom-full right-0 z-30` cannot:
 *
 * 1. **It portals to `<body>`.** Page content renders inside `.radial-frame`,
 *    which is `position: relative; z-index: var(--z-content)` — a stacking
 *    context pinned at 1 (globals.css §5.6). Every z-index inside it is then
 *    measured INSIDE that context, so a menu left where its trigger lives can
 *    never clear the shell's own chrome no matter how large its number is: the
 *    top bar (60), the hub orb and the compose FAB (80) all paint straight over
 *    it. That was the composer (+) menu bug — its first rows landed underneath
 *    the top bar, greyed out and unclickable. At body level `--z-menu` sits
 *    above the shell and below the z-50 dialogs, the same escape `ComposeModal`
 *    and `QuickPanel` already make.
 * 2. **It measures before it commits to a side.** The panel opens on its
 *    preferred side when that side can hold it, flips to the other side when it
 *    cannot, and caps its height to whatever room the chosen side actually has
 *    (scrolling the overflow). The composer sits at the top of the feed, so a
 *    twelve-row menu asking to open upward has nowhere to go — with only a
 *    viewport clamp behind it, it got shoved down into the top bar instead of
 *    opening downward into the empty feed.
 *
 * 3. **It drives the keyboard.** `role="menu"` is a promise: arrow keys move a
 *    roving focus between rows, Home/End jump to the ends, typing jumps to the
 *    row that starts with what you typed, Tab leaves. This used to be the
 *    caller's problem and so it was nobody's — the panel opened, focus landed on
 *    the first button, and Down did nothing (or scrolled the page behind it).
 *    That gap is most of why twenty-six menus on this site hand-rolled a panel
 *    rather than adopt this one: adopting it cost them a keyboard.
 *
 * Everything else stays the caller's: it owns the open state, the trigger, and
 * the rows. Rows should be `MenuItem`/`MenuSeparator`/`MenuLabel` from
 * `components/ui/menu` — the roving focus enumerates `[data-menu-item]`, which
 * `MenuItem` sets, deliberately rather than `button, a[href]`: a menu row may
 * CONTAIN a control (a clear button in a filter field), and arrowing onto one of
 * those strands the keyboard somewhere the arrow keys cannot get it back out of.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { usePopPresence } from '@/hooks/usePopPresence';
import {
  resolveAnchoredPlacement,
  type Placement,
  type PlacementAlign,
  type PlacementSide,
} from '@/lib/anchored-placement';
import { cn } from '@/lib/utils';
import { MENU_ITEM_ATTR } from './menu';
import './anchored-menu.css';

// useLayoutEffect warns during SSR; a menu only ever opens from a client
// interaction, so the visual result is identical either way.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Gap between the trigger and the panel. */
const TRIGGER_GAP = 4;
/** Gap kept between the panel and each viewport edge. */
const EDGE_MARGIN = 12;
/**
 * How long typed characters keep accumulating into one typeahead query. The
 * same window Radix and AppKit both use; long enough to type "delete", short
 * enough that coming back a second later starts a new search.
 */
const TYPEAHEAD_MS = 1000;

/** The rows the keyboard may land on, in document order, minus the disabled. */
function enabledItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return [...panel.querySelectorAll<HTMLElement>(`[${MENU_ITEM_ATTR}]`)].filter(
    (el) =>
      !(el as HTMLButtonElement).disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      // A row inside a collapsed section is still in the DOM.
      el.offsetParent !== null,
  );
}

export interface AnchoredMenuProps {
  open: boolean;
  onClose: () => void;
  /** The trigger the panel hangs off, and the element focus returns to. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Accessible name for the panel. */
  label: string;
  /** Preferred side. Flips when that side cannot hold the panel. */
  side?: PlacementSide;
  /** Which edge of the trigger the panel lines up with. */
  align?: PlacementAlign;
  className?: string;
  children: ReactNode;
}

function samePlacement(a: Placement | null, b: Placement) {
  return (
    a !== null &&
    a.side === b.side &&
    a.offset === b.offset &&
    a.inset === b.inset &&
    a.maxHeight === b.maxHeight
  );
}

export function AnchoredMenu({
  open,
  onClose,
  anchorRef,
  label,
  side = 'bottom',
  align = 'end',
  className,
  children,
}: AnchoredMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const measure = useCallback(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const rect = anchor.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    const safe = (name: string) => parseFloat(rootStyle.getPropertyValue(name)) || 0;
    const bounds = {
      top: EDGE_MARGIN + safe('--safe-top'),
      bottom: window.innerHeight - EDGE_MARGIN - safe('--safe-bottom'),
      left: EDGE_MARGIN + safe('--safe-left'),
      right: window.innerWidth - EDGE_MARGIN - safe('--safe-right'),
    };

    // Natural height, free of the cap the previous pass applied. Read inside
    // the same layout effect as the write, so nothing paints in between, and
    // RESTORED rather than removed — a re-measure that resolves to the same
    // placement produces no re-render, so React would never put the cap back.
    const prevMax = panel.style.getPropertyValue('--anchored-menu-max-h');
    panel.style.setProperty('--anchored-menu-max-h', 'none');
    const natural = panel.offsetHeight;
    if (prevMax) panel.style.setProperty('--anchored-menu-max-h', prevMax);
    else panel.style.removeProperty('--anchored-menu-max-h');

    const next = resolveAnchoredPlacement({
      anchor: rect,
      panelHeight: natural,
      bounds,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      side,
      align,
      gap: TRIGGER_GAP,
    });
    setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
  }, [anchorRef, side, align]);

  // Resolved in a LAYOUT effect, so the placement React renders with is the
  // real one before anything paints. The last placement is deliberately NOT
  // cleared on close: the panel stays mounted for its exit (below), and a
  // placement reset would teleport it to the unplaced corner for the length of
  // its own close. The next open re-measures here before paint anyway.
  useIsoLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  // Re-anchor while open. The trigger scrolls with the page and the panel does
  // not, so a page scroll has to move it; a scroll INSIDE the panel must not.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedule = (e?: Event) => {
      if (e?.target instanceof Node && panelRef.current?.contains(e.target)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // Capture, so a scrolling ancestor that is not the document still reaches us.
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [open, measure]);

  // The shared bloom (globals.css §7.1) plays on mount and on `data-state`, so
  // all this needs is to stay mounted long enough for the close — and to say
  // which corner it grew out of, which `placement.side` has already decided.
  const { present, state } = usePopPresence(open);

  // Roving focus, the half of `role="menu"` that is a keyboard contract rather
  // than a label. Bound to the PANEL rather than to the document: a menu is not
  // modal, and a document-level Down-arrow handler would hijack the arrow keys
  // of whatever else is focused while the menu happens to be open.
  const typeahead = useRef({ query: '', at: 0 });
  const onPanelKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = enabledItems(panelRef.current);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);

    const focusAt = (index: number) => {
      e.preventDefault();
      // `preventScroll` because the panel is position:fixed — it is in view by
      // construction, so the browser's focus scroll can only drag the page
      // underneath it. The row is brought into the panel's own scroll instead.
      const el = items[(index + items.length) % items.length];
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    };

    switch (e.key) {
      case 'ArrowDown':
        return focusAt(current + 1);
      case 'ArrowUp':
        // From nowhere, Up enters at the BOTTOM — the platform behaviour, and
        // the reason `current === -1` is not just treated as 0 here.
        return focusAt(current === -1 ? items.length - 1 : current - 1);
      case 'Home':
        return focusAt(0);
      case 'End':
        return focusAt(items.length - 1);
      case 'Tab':
        // Tab is a dismissal, not a way through the rows. Let the browser move
        // focus onward from the trigger, which the close effect restores it to.
        onClose();
        return;
      default:
        break;
    }

    // Typeahead. Single printable characters only — modified keys are shortcuts,
    // and a space is a row's own activation, not the start of a search.
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.key === ' ') return;
    const now = performance.now();
    const state = typeahead.current;
    state.query = (now - state.at > TYPEAHEAD_MS ? '' : state.query) + e.key.toLowerCase();
    state.at = now;
    // Search from the row AFTER the focused one and wrap, so repeating a letter
    // cycles through the rows that start with it instead of sticking on the first.
    const from = current + 1;
    for (let i = 0; i < items.length; i++) {
      const item = items[(from + i) % items.length];
      if ((item.textContent ?? '').trim().toLowerCase().startsWith(state.query)) {
        focusAt(items.indexOf(item));
        return;
      }
    }
  }, [onClose]);

  // Escape closes and hands focus back; an outside press closes. `pointerdown`
  // (not click) so the panel dismisses before the press lands on what is under
  // it, and capture phase so a panel that stops propagation cannot swallow it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, onClose, anchorRef]);

  // The panel lives at the end of <body>, so it is nowhere near its trigger in
  // the tab order — move focus in on open and hand it back on close, or a
  // keyboard user is dropped at the bottom of the document.
  useEffect(() => {
    if (!open) return;
    const trigger = anchorRef.current;
    // Captured now: by cleanup time React may already have detached the node.
    const panel = panelRef.current;
    const raf = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      // `preventScroll` because the panel is position:fixed — it is in view by
      // construction, so the browser's focus scroll can only drag the page
      // underneath it.
      // Rows first, then any other focusable the panel opens with (a filter
      // field at the top of a picker, which is where the keyboard wants to be).
      (enabledItems(el)[0] ??
        el.querySelector<HTMLElement>('input, button:not(:disabled), a[href]') ??
        el).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      // Reclaim focus only if the closing menu is what held it. Two shapes of
      // that: the panel is still attached and contains it, or — the ordinary
      // case, since React detaches the portal before this cleanup runs — the
      // removal ORPHANED it and the browser fell back to <body>. Without the
      // second check the Escape path silently strands the keyboard at the top
      // of the document. Focus that landed somewhere real (the textarea, a
      // modal the row opened, a page navigated to) is left alone.
      const active = document.activeElement;
      const orphaned = !active || active === document.body;
      if (orphaned || panel?.contains(active)) trigger?.focus?.();
    };
  }, [open, anchorRef]);

  const style: CSSProperties = placement
    ? ({
        top: placement.side === 'bottom' ? placement.offset : undefined,
        bottom: placement.side === 'top' ? placement.offset : undefined,
        left: align === 'start' ? placement.inset : undefined,
        right: align === 'end' ? placement.inset : undefined,
        '--anchored-menu-max-h': `${placement.maxHeight}px`,
      } as CSSProperties)
    : // First pass: mounted so it can be measured, invisible so the unplaced
      // corner never paints. The placement effect resolves it before paint.
      { top: 0, left: 0, visibility: 'hidden' };

  return (
    <>
      {present &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            // Themes restyle through `[data-slot]` (components/CLAUDE.md), and
            // the panel portals out of the shell — this is how one reaches it.
            data-slot="anchored-menu"
            data-side={placement?.side ?? side}
            // Which corner the bloom unfurls from — read by the `--motion-origin`
            // rules in anchored-menu.css. The side is whatever the collision
            // check above settled on, so a menu that flipped to open upward also
            // grows upward out of its trigger.
            data-align={align}
            data-motion="pop"
            data-state={state}
            onKeyDown={onPanelKeyDown}
            // `p-1`, not `py-1`: rows are `rounded-site-sm` and inset from the
            // panel edge (components/ui/menu.tsx), so the highlight is a pill
            // inside the panel rather than a square band that collides with the
            // panel's own corner radius on the first and last row.
            className={cn('anchored-menu glass-overlay p-1', className)}
            style={style}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
