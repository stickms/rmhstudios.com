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
        d.mode =
          Math.abs(dx) > Math.abs(dy) || isOpenRef.current ? 'drag' : 'scroll';
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
        className={`md:hidden min-w-0 w-full flex-1 overflow-x-hidden ${
          isOpen ? 'overflow-y-hidden' : 'overflow-y-auto'
        }`}
      >
        {/* Sidebar — sits fixed behind the page content */}
        <aside
          className="fixed left-0 top-0 bottom-0 z-0 w-64 bg-site-bg border-r border-site-border overflow-y-auto"
          aria-hidden={!isOpen}
        >
          <LeftSidebar expanded />
          {/* Clear the fixed bottom nav so the last items stay reachable */}
          <div className="h-20 shrink-0" aria-hidden="true" />
        </aside>

        {/* Page content — slides right to reveal the sidebar */}
        <div
          ref={panelRef}
          className={`relative z-10 min-h-dvh bg-site-bg ${
            dragging
              ? ''
              : 'transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
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
