'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LeftSidebar } from './LeftSidebar';

const DRAWER_WIDTH = 256; // w-64 — must match the aside width below
// How far a closed-drawer drag must travel (on release) to commit to opening,
// and how far an open-drawer drag must travel back to commit to closing.
const OPEN_COMMIT = 64;
const CLOSE_COMMIT = 64;
const DEAD_ZONE = 8; // px of movement before we decide drag vs. scroll

/**
 * True if `el` or one of its ancestors (up to but excluding `stop`) is a
 * horizontally-scrollable element that can still scroll in the swipe's
 * direction. Used to yield the gesture to native horizontal scrolling
 * (code blocks, tables, tab strips, carousels) instead of opening the drawer.
 *
 * `dir` is the finger delta-x: dir > 0 (finger moving right) reveals content to
 * the left, which is only possible when the element isn't already at scrollLeft 0;
 * dir < 0 (finger moving left) reveals content to the right, possible unless the
 * element is scrolled fully to its end.
 */
function canScrollX(el: EventTarget | null, dir: number, stop: Element): boolean {
  let n = el instanceof Element ? el : null;
  for (; n && n !== stop; n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    const ox = getComputedStyle(n).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) {
      const atStart = n.scrollLeft <= 0;
      const atEnd = n.scrollLeft >= n.scrollWidth - n.clientWidth - 1;
      if (dir > 0 ? !atStart : !atEnd) return true;
    }
  }
  return false;
}

/**
 * Vertical analogue of {@link canScrollX}: true if `el` or an ancestor (up to but
 * excluding `stop`) is a vertically-scrollable element that can still scroll in
 * the swipe's direction. Used inside the open sidebar to decide whether a
 * vertical drag should scroll its nav (yes → let it) or be swallowed so it can't
 * chain out and scroll the page behind the overlay (no → we preventDefault).
 *
 * `dir` is the finger delta-y: dir > 0 (finger moving down) reveals content above,
 * possible unless already at the top; dir < 0 reveals content below, possible
 * unless at the bottom.
 */
function canScrollY(el: EventTarget | null, dir: number, stop: Element | null): boolean {
  let n = el instanceof Element ? el : null;
  for (; n && n !== stop; n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      const atTop = n.scrollTop <= 0;
      const atBottom = n.scrollTop >= n.scrollHeight - n.clientHeight - 1;
      if (dir > 0 ? !atTop : !atBottom) return true;
    }
  }
  return false;
}

interface MobileSidebarApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarApi>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

/** Open/close the mobile push-drawer from anywhere inside the site layout. */
export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}

interface MobileSidebarShellProps {
  children: React.ReactNode;
}

/**
 * Mobile-only "push" drawer. Instead of sliding a panel on top of the page, the
 * page content itself slides to the right to reveal a left sidebar sitting fixed
 * underneath. A rightward swipe anywhere on the page opens it; swiping back or
 * tapping the pushed-aside content closes it.
 *
 * Rendered only on mobile (`md:hidden`); desktop keeps its own fixed sidebar.
 */
export function MobileSidebarShell({ children }: MobileSidebarShellProps) {
  const { t } = useTranslation('feed');
  const [isOpen, setIsOpen] = useState(false);
  // Live drag offset in px (0 → DRAWER_WIDTH). null means "not dragging — animate
  // to the resting position via CSS transition".
  const [dragX, setDragX] = useState<number | null>(null);
  // Whether the fixed sidebar layer should paint. When the drawer is fully
  // closed and idle we hide it (see the effect below): the `<aside>` is
  // `position: fixed`, so during a vertical overscroll / pull-to-refresh bounce
  // the page rubber-bands away while the fixed sidebar stays put and would
  // otherwise peek out behind it.
  const [asidePainted, setAsidePainted] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  // Outer wrapper the gesture listeners attach to (so touches on the page, the
  // scrim, and the sidebar all reach them) and a ref to the sidebar panel (so a
  // vertical swipe on its nav scrolls the nav instead of dragging the drawer).
  const wrapRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef({
    startX: 0,
    startY: 0,
    base: 0, // panel offset at gesture start (0 closed, DRAWER_WIDTH open)
    x: 0, // live offset
    active: false,
    decided: false,
    // 'drag' moves the drawer; 'scroll' lets a native scroller (page or sidebar
    // nav) handle it; 'lock' swallows the gesture so it can't chain out and
    // scroll the page behind the open overlay.
    mode: 'none' as 'none' | 'drag' | 'scroll' | 'lock',
  });

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Live ref so the once-attached native listeners never read stale state.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Close on navigation so tapping a sidebar link doesn't leave the drawer open.
  const { pathname } = useLocation();
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Lock body scroll while the drawer is open. Since the page now scrolls the
  // document (not an inner container), we can't just set overflow:hidden on a
  // scroller — use the iOS-robust position:fixed + top:-scrollY technique, which
  // freezes the page without losing the scroll position (restored on close).
  useEffect(() => {
    if (!isOpen) return;
    const body = document.body;
    const html = document.documentElement;
    const y = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    // Tint the root canvas behind Safari's bar to the sidebar's glass tone (see
    // the html.drawer-open rule) so the sidebar reads as full height even though
    // iOS clips the fixed panel to the visual viewport.
    html.classList.add('drawer-open');
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      html.classList.remove('drawer-open');
      window.scrollTo(0, y);
    };
  }, [isOpen]);

  // Swipe handling, via non-passive native listeners on the OUTER wrapper so a
  // touch anywhere — the page (to open), the scrim, or the glass sidebar itself
  // (to close) — reaches them, and we can cancel the browser's own scroll/back
  // gestures when we take over a horizontal drag.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    function onTouchStart(e: TouchEvent) {
      if (window.innerWidth >= 768) return; // mobile only (md breakpoint)
      // Multi-touch is a pinch/zoom — never a drawer drag. Leaving `active`
      // false means onTouchMove bails and the browser handles the zoom.
      if (e.touches.length !== 1) {
        drag.current.active = false;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      drag.current = {
        startX: t.clientX,
        startY: t.clientY,
        base: isOpenRef.current ? DRAWER_WIDTH : 0,
        x: isOpenRef.current ? DRAWER_WIDTH : 0,
        active: true,
        decided: false,
        mode: 'none',
      };
    }

    function onTouchMove(e: TouchEvent) {
      const d = drag.current;
      if (!d.active) return;
      // A second finger landed mid-gesture: it's becoming a pinch/zoom. Abandon
      // the drag and snap back to a resting position so the browser can zoom.
      if (e.touches.length !== 1) {
        d.active = false;
        d.mode = 'none';
        setDragX(null);
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - d.startX;
      const dy = t.clientY - d.startY;

      if (!d.decided) {
        if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;
        d.decided = true;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const overSidebar = !!(
          asideRef.current && e.target instanceof Node && asideRef.current.contains(e.target)
        );
        if (overSidebar && !horizontal) {
          // Vertical swipe on the open sidebar: let it scroll the nav ONLY if an
          // inner scroller can move that way; otherwise LOCK it so a drag on the
          // non-scrolling parts (logo, footer, or the nav at its edge) can't chain
          // out and scroll the page behind the overlay.
          d.mode = canScrollY(e.target, dy, asideRef.current) ? 'scroll' : 'lock';
        } else if (!isOpenRef.current && horizontal && wrap && canScrollX(e.target, dx, wrap)) {
          // The swipe began inside a horizontally-scrollable element that can
          // still scroll this way — let it scroll instead of opening the drawer.
          d.mode = 'scroll';
        } else if (isOpenRef.current && !horizontal) {
          // Open + a vertical swipe anywhere else (the scrim) → lock, never scroll
          // the page.
          d.mode = 'lock';
        } else {
          // Horizontal intent is a drag (open when closed, close when open).
          d.mode = horizontal || isOpenRef.current ? 'drag' : 'scroll';
        }
      }

      // 'lock' swallows the gesture (no page scroll) without moving the drawer.
      if (d.mode === 'lock') {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (d.mode !== 'drag') return; // 'scroll' → let the page / nav scroll natively

      if (e.cancelable) e.preventDefault();
      d.x = Math.max(0, Math.min(DRAWER_WIDTH, d.base + dx));
      setDragX(d.x);
    }

    function onTouchEnd() {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;

      if (d.mode !== 'drag') {
        setDragX(null);
        return;
      }

      // Tap (no real movement) closes the drawer when it's open.
      if (d.x === d.base) {
        if (isOpenRef.current) setIsOpen(false);
        setDragX(null);
        return;
      }

      if (d.base === 0) {
        // Was closed: commit to open only past a small threshold.
        setIsOpen(d.x > OPEN_COMMIT);
      } else {
        // Was open: commit to close once dragged back past the threshold.
        setIsOpen(d.x > DRAWER_WIDTH - CLOSE_COMMIT);
      }
      setDragX(null);
    }

    wrap.addEventListener('touchstart', onTouchStart, { passive: true });
    wrap.addEventListener('touchmove', onTouchMove, { passive: false });
    wrap.addEventListener('touchend', onTouchEnd, { passive: true });
    wrap.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart);
      wrap.removeEventListener('touchmove', onTouchMove);
      wrap.removeEventListener('touchend', onTouchEnd);
      wrap.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const dragging = dragX !== null;
  const offset = dragging ? (dragX as number) : isOpen ? DRAWER_WIDTH : 0;
  // Overlay drawer: the glass sidebar slides in OVER the page from the left.
  // offset 0 = fully off-screen (translateX(-DRAWER_WIDTH)); DRAWER_WIDTH = in.
  // The page itself never moves.
  const sidebarTransform = `translateX(${offset - DRAWER_WIDTH}px)`;
  const scrimProgress = offset / DRAWER_WIDTH;

  // Paint the fixed sidebar only while it's actually being revealed. It must
  // stay painted through the whole close animation (React snaps `offset` to 0 at
  // once, but the page keeps sliding back over the sidebar for ~380ms), then be
  // hidden once fully closed so it can't peek out during a pull-to-refresh
  // bounce. The timeout also covers reduced-motion users, where the page has no
  // transition to slide back.
  useEffect(() => {
    if (offset > 0) {
      setAsidePainted(true);
      return;
    }
    const id = window.setTimeout(() => setAsidePainted(false), 420);
    return () => window.clearTimeout(id);
  }, [offset]);
  const asideRevealed = offset > 0 || asidePainted;

  return (
    <MobileSidebarContext.Provider value={{ isOpen, open, close, toggle }}>
      {/* Outer wrapper — the gesture listeners attach here so touches on the
          page, the scrim, and the glass sidebar all reach them. */}
      <div ref={wrapRef} className="md:hidden w-full min-w-0">
        {/* Page content — every _site page flows here and scrolls the DOCUMENT
            (the window), NOT an inner overflow container. That's deliberate: iOS
            Safari only shrinks its floating bottom bar when the *document*
            scrolls, and document scroll isn't capped at 100lvh, so content draws
            all the way to the physical bottom behind the (then-minimized) bar. An
            inner scroller can do neither. Transparent, so the body aurora is the
            single backdrop and draws edge-to-edge. `min-h-dvh` fills the viewport
            on short pages. `touch-pan-y` reserves horizontal gestures for the
            drawer drag (vertical stays native document scroll). The drawer's
            scroll-lock is handled by the body-lock effect above, not overflow
            here. No `data-scroll-root` → useScrollRestoration and BackToTop use
            the window; the custom PullToRefresh (which needs an inner scroller)
            goes inert, so iOS's native document pull-to-refresh takes over. */}
        <div ref={panelRef} className="relative min-h-[100lvh] touch-pan-y">
          {children}
        </div>

        {/* Scrim — dims the page and captures taps/keys to close. Above the page,
            below the sidebar. A real <button> so it's keyboard-operable (Esc also
            closes). No backdrop blur here (the sidebar already frosts the page —
            stacking a second backdrop-filter is wasteful). */}
        {asideRevealed && (
          <button
            type="button"
            onClick={close}
            aria-label={t('close-menu', { defaultValue: 'Close menu' })}
            // inset-0 fills the visual viewport — all a fixed element can cover on
            // iOS (it's clipped to the visual viewport). The strip behind Safari's
            // bar is the root canvas aurora, which reads fine undimmed.
            className={`fixed inset-0 z-[55] bg-black/40 ${
              dragging
                ? ''
                : 'transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
            }`}
            style={{ opacity: scrimProgress }}
          />
        )}

        {/* Sidebar — a Liquid Glass overlay that slides in OVER the page (blurring
            the content + aurora behind it) instead of sitting underneath it. The
            blur lives on glass-chrome--aside's ::before, so the aside itself never
            gains backdrop-filter and stays a valid containing block for
            LeftSidebar's non-portaled fixed user menu (§3.3.1). */}
        <aside
          ref={asideRef}
          // inset-y-0 fills the visual viewport top-to-bottom — the full extent a
          // fixed element can reach on iOS (fixed is clipped to the visual
          // viewport; it can't paint behind Safari's bar, so there's no point
          // over-sizing it). The glass now runs to the bottom of the usable area,
          // and the root canvas aurora continues behind the browser bar below it.
          className={`glass-chrome--aside fixed inset-y-0 left-0 z-[60] flex w-64 flex-col border-r border-site-border shadow-site overscroll-contain touch-pan-y ${
            asideRevealed ? '' : 'invisible'
          } ${
            dragging
              ? ''
              : 'transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:duration-0'
          }`}
          // Footer clears the home indicator / browser bar by a small gap.
          style={{ transform: sidebarTransform, paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
          aria-hidden={!isOpen}
        >
          <LeftSidebar expanded />
        </aside>
      </div>
    </MobileSidebarContext.Provider>
  );
}
