'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { useMenuViewportFit } from '@/hooks/useMenuViewportFit';

// useLayoutEffect warns during SSR; panels only ever open from a client
// interaction, so the visual result is identical either way.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface QuickPanelProps {
  open: boolean;
  onClose: () => void;
  /**
   * The panel's heading. Rendered — every panel wears the same header row, so
   * the four of them read as one control family rather than four one-offs; it
   * doubles as the dialog's accessible name via `aria-labelledby`.
   */
  title: string;
  /** Glyph beside the heading. Matches the top-bar control the panel hangs off. */
  icon?: LucideIcon;
  /** The top-bar control the panel hangs from — it aligns to its trailing edge. */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * The "and now the real thing" footer — every panel is a *preview*, so each one
   * renders a `<Link className="rad-panel__more">` through to its full page.
   * Passed in rather than derived from an href so each caller keeps its own
   * typed route + search params.
   */
  more?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The shared shell for the top bar's quick panels.
 *
 * Every top-bar control opens a small, cheap preview first — search results,
 * the latest notifications, recent conversations, the profile menu — with a
 * footer link through to the full page. That keeps the common case (a glance)
 * off the router entirely, and the uncommon case one click away.
 *
 * Every panel is built from the same three parts — header, body, footer link —
 * so the family shares one silhouette, one inset and one type scale no matter
 * what each one is previewing. The body also carries a floor height, because a
 * panel that collapses to the height of its "Nothing new right now." line reads
 * as a rendering glitch rather than an empty inbox.
 *
 * Bounds are not left to chance: the panel is anchored to its trigger, capped to
 * a fraction of the viewport, and then run through `useMenuViewportFit`, which
 * measures the rendered box and clamps/translates it back inside the visual
 * viewport (safe-area aware) and re-runs on every resize/rotation — the same
 * guard the composer and sidebar menus use. On narrow screens the CSS drops the
 * anchor entirely and it spans the gutters as a drawer.
 *
 * It **portals to `<body>`**. Rendering it where the trigger lives would put it
 * inside `.radial-topbar`, and the top bar carries a `backdrop-filter` at ≥768px
 * — which makes it a containing block for `position: fixed` descendants, so the
 * panel would be positioned against the bar rather than the viewport. At body
 * level `--z-quickpanel` also lands cleanly above the shell and below dialogs.
 * Leaving the trigger's DOM subtree costs the natural tab order, so focus is
 * moved in on open and handed back to the trigger on close.
 */
export function QuickPanel({
  open,
  onClose,
  title,
  icon: Icon,
  anchorRef,
  more,
  children,
  className,
}: QuickPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const [anchor, setAnchor] = useState({ top: 56, right: 12 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Position under the trigger. The top bar is sticky at the top of the page, so
  // its rect is scroll-invariant — only a resize can move it.
  useIsoLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: Math.round(rect.bottom + 8),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, anchorRef]);

  useMenuViewportFit(open, panelRef, [anchor.top, anchor.right]);

  // Escape closes; an outside press closes. `pointerdown` (not click) so the
  // panel dismisses before the press lands on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    // Capture phase: a panel must close even if something below stops propagation.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, onClose, anchorRef]);

  // Move focus into the panel on open and hand it back to the trigger on close —
  // the panel lives at the end of <body>, so without this a keyboard user would
  // be dropped at the bottom of the document when it dismisses.
  useEffect(() => {
    if (!open) return;
    const trigger = anchorRef.current;
    // Captured now: by cleanup time React may already have detached the node,
    // and the check below has to run against the panel this effect opened.
    const panel = panelRef.current;
    const raf = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      // `preventScroll` because the panel is position:fixed — it is already in
      // view by construction, so the browser's focus scroll can only drag the
      // page underneath it. On a phone that scroll lands at the same moment the
      // keyboard opens for the search field, and the two together read as the
      // viewport jumping the instant you tap the top bar.
      (el.querySelector<HTMLElement>('input, a[href], button') ?? el).focus({
        preventScroll: true,
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      // Only reclaim focus if it is still inside the panel we are unmounting;
      // a click that navigated away must not be yanked back to the top bar.
      if (panel?.contains(document.activeElement)) trigger?.focus?.();
    };
  }, [open, anchorRef]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={['rad-panel', 'glass-overlay', className].filter(Boolean).join(' ')}
      // Themes restyle through `[data-slot]` (see components/CLAUDE.md), and the
      // panel portals out of the shell — the attribute is how a theme reaches it.
      data-slot="quick-panel"
      // The shared bloom (globals.css §7.1). Every one of these is pinned by its
      // own top-right corner, right under the top-bar control it belongs to, so
      // that corner is what it unfurls from — the panel grows out of the button
      // you pressed instead of appearing beside it. Below 560px the CSS drops
      // the anchor and the panel spans the gutters, but it is still pinned by
      // its top edge, so the same origin reads correctly there.
      data-motion="pop"
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      style={
        {
          '--panel-top': `${anchor.top}px`,
          '--panel-right': `${anchor.right}px`,
          '--motion-origin': 'top right',
        } as CSSProperties
      }
    >
      <header className="rad-panel__head" data-slot="quick-panel-head">
        {Icon && <Icon aria-hidden />}
        <h2 id={headingId}>{title}</h2>
      </header>
      <div className="rad-panel__body" data-slot="quick-panel-body">
        {children}
      </div>
      {more}
    </div>,
    document.body,
  );
}

/** The footer arrow every panel puts before its "see the full page" label. */
export function QuickPanelMoreIcon() {
  return <ArrowRight aria-hidden />;
}

/** Uniform empty/loading line inside a quick panel. */
export function QuickPanelNote({ children }: { children: ReactNode }) {
  return <p className="rad-panel__note">{children}</p>;
}
