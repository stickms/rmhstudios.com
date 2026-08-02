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
 * Everything else stays the caller's: it owns the open state, the trigger, and
 * the rows. Rows are ordinary children — this is a positioned surface, not a
 * roving-focus ARIA menu implementation.
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
import './anchored-menu.css';

// useLayoutEffect warns during SSR; a menu only ever opens from a client
// interaction, so the visual result is identical either way.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Gap between the trigger and the panel. */
const TRIGGER_GAP = 4;
/** Gap kept between the panel and each viewport edge. */
const EDGE_MARGIN = 12;

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
      (el.querySelector<HTMLElement>('button:not(:disabled), a[href], input') ?? el).focus({
        preventScroll: true,
      });
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
            className={cn('anchored-menu glass-overlay py-1', className)}
            style={style}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
