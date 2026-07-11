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

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    startX: 0,
    startY: 0,
    base: 0, // panel offset at gesture start (0 closed, DRAWER_WIDTH open)
    x: 0, // live offset
    active: false,
    decided: false,
    mode: 'none' as 'none' | 'drag' | 'scroll',
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

  // Swipe handling, via non-passive native listeners on the page panel so we can
  // cancel the browser's own scroll/back gestures when we take over a drag.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

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
        // Horizontal intent becomes a drag. A vertical gesture is a scroll —
        // but while the drawer is open the page is locked, so treat it as a
        // (no-op) drag to keep the page from scrolling underneath.
        d.decided = true;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        if (
          !isOpenRef.current &&
          horizontal &&
          panel &&
          canScrollX(e.target, dx, panel)
        ) {
          // The swipe began inside a horizontally-scrollable element that can
          // still scroll this way — let the browser scroll it instead of
          // hijacking the gesture to open the drawer.
          d.mode = 'scroll';
        } else {
          d.mode = horizontal || isOpenRef.current ? 'drag' : 'scroll';
        }
      }

      if (d.mode !== 'drag') return; // let the page scroll vertically

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

      // Tap (no real movement) on the pushed-aside content closes the drawer.
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

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    panel.addEventListener('touchend', onTouchEnd, { passive: true });
    panel.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchmove', onTouchMove);
      panel.removeEventListener('touchend', onTouchEnd);
      panel.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const dragging = dragX !== null;
  const offset = dragging ? (dragX as number) : isOpen ? DRAWER_WIDTH : 0;
  // Keep `transform: none` when fully closed and idle so position:fixed
  // descendants (modals, FABs) inside the page aren't re-anchored to the panel.
  const transform = offset === 0 ? undefined : `translateX(${offset}px)`;
  const scrimProgress = offset / DRAWER_WIDTH;

  return (
    <MobileSidebarContext.Provider value={{ isOpen, open, close, toggle }}>
      <div
        ref={scrollRef}
        // Marks this element as the live scroll container on mobile so
        // useScrollRestoration can save/restore it (the router only tracks the
        // window, which doesn't scroll on mobile).
        data-scroll-root
        // `touch-pan-y` reserves horizontal gestures for our own drawer drag so the
        // browser never treats a sideways swipe as a back/forward navigation, while
        // still allowing native vertical scrolling. `overscroll-contain` keeps any
        // scroll from chaining out to the document.
        //
        // `h-dvh` (not `flex-1`) is important: this element is the page's scroll
        // container, but its parent only sets `min-h-dvh`, so `flex-1` would leave
        // it unbounded — it would grow to fit its content and never become
        // scrollable, and because `overscroll-contain` stops scroll from chaining
        // to the document, vertical scrolling would be dead until a reflow. A
        // fixed viewport height makes it a real scroller.
        className={`md:hidden min-w-0 w-full h-dvh min-h-0 overflow-x-hidden touch-pan-y overscroll-contain ${
          isOpen ? 'overflow-y-hidden' : 'overflow-y-auto'
        }`}
      >
        {/* Sidebar — sits fixed behind the page content. `overscroll-contain`
            (plus `touch-pan-y`) means grabbing and swiping the sidebar scrolls
            only the sidebar itself — never the page behind it, even when its
            content is too short to scroll. */}
        <aside
          className="fixed left-0 top-0 bottom-0 z-0 w-64 bg-site-bg border-r border-site-border overflow-y-auto overscroll-contain touch-pan-y"
          aria-hidden={!isOpen}
        >
          <LeftSidebar expanded />
          {/* Clear the fixed bottom nav so the last items stay reachable */}
          <div className="h-20 shrink-0" aria-hidden="true" />
        </aside>

        {/* Page content — slides right to reveal the sidebar */}
        <div
          ref={panelRef}
          // `touch-pan-y` must live on this panel too — not just the scroll
          // container — because this is the element the touches actually land
          // on. Without it the panel defaults to `touch-action: auto`, letting
          // the browser claim an edge swipe as back/forward navigation before
          // our non-passive listener can preventDefault.
          className={`relative z-10 min-h-dvh bg-site-bg touch-pan-y ${
            dragging
              ? ''
              : 'transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:duration-0'
          }`}
          style={{ transform }}
        >
          {children}

          {/* Scrim over the pushed content: dims it and captures taps to close */}
          {offset > 0 && (
            <div
              className={`absolute inset-0 z-50 bg-black/30 ${
                dragging
                  ? ''
                  : 'transition-opacity duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
              }`}
              style={{ opacity: scrimProgress }}
              onClick={close}
              aria-label={t("close-menu", { defaultValue: "Close menu" })}
            />
          )}
        </div>
      </div>
    </MobileSidebarContext.Provider>
  );
}
