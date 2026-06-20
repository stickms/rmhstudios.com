'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { LeftSidebar } from './LeftSidebar';
import { useSidebarStore } from '@/stores/sidebarStore';

const DRAWER_WIDTH = 288; // w-72
// How far the page must be pulled across (px) at release to settle open.
const OPEN_THRESHOLD = DRAWER_WIDTH * 0.4;
// Dead zone before a gesture is classified as horizontal vs. vertical.
const DECIDE_SLOP = 8;

interface DragState {
  startX: number;
  startY: number;
  offset: number;
  active: boolean;
  decided: boolean;
  /** 'drag' = moving the panel; 'lock' = block background scroll; 'scroll' =
   *  let the touch scroll natively (page when closed, sidebar when open). */
  mode: 'none' | 'drag' | 'lock' | 'scroll';
  fromOpen: boolean;
  target: HTMLElement | null;
}

/**
 * Walk up from `start` to `boundary` looking for an ancestor that can still be
 * scrolled horizontally in the direction the finger is moving. Lets native
 * horizontal scrollers (e.g. the feed's filter tabs) win over the drawer
 * gesture instead of being hijacked.
 *
 * `dir > 0` = finger moving right (content scrolls toward scrollLeft 0).
 */
function hasHorizontalScroll(start: HTMLElement | null, boundary: Element | null, dir: number): boolean {
  let el: HTMLElement | null = start;
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        if (dir > 0 && el.scrollLeft > 0) return true;
        if (dir < 0 && el.scrollLeft < el.scrollWidth - el.clientWidth) return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Twitter-style navigation drawer for mobile. The sidebar sits *beneath* the
 * page; the page content slides to the right to reveal it. A right-swipe from
 * anywhere opens it, a left-swipe (or a tap on the dimmed page) closes it.
 */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const open = useSidebarStore((s) => s.open);
  const setOpen = useSidebarStore((s) => s.setOpen);
  const { pathname } = useLocation();

  const [dragX, setDragX] = useState<number | null>(null);
  const dragging = dragX !== null;
  // A `transform` makes the content the containing block for `position:fixed`
  // descendants (page modals) and changes sticky behaviour. So we only keep the
  // transform applied while the drawer is open/dragging — and briefly during the
  // close animation — then remove it so normal browsing is unaffected.
  const [transformActive, setTransformActive] = useState(false);
  useEffect(() => {
    if (open || dragging) {
      setTransformActive(true);
      return;
    }
    const id = setTimeout(() => setTransformActive(false), 220);
    return () => clearTimeout(id);
  }, [open, dragging]);

  const containerRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const drag = useRef<DragState>({
    startX: 0, startY: 0, offset: 0,
    active: false, decided: false, mode: 'none',
    fromOpen: false, target: null,
  });

  // Close when the route changes (a nav link was followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Lock background scroll while open or mid-drag.
  useEffect(() => {
    if (!open && !dragging) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, dragging]);

  // Swipe gestures — non-passive so horizontal drags can cancel native page
  // scroll and the browser's edge "go back". Attached once; reads live open
  // state via a ref so the listeners never go stale.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onStart(e: TouchEvent) {
      if (window.innerWidth >= 768) return;
      const t = e.touches[0];
      if (!t) return;
      drag.current = {
        startX: t.clientX, startY: t.clientY,
        offset: openRef.current ? DRAWER_WIDTH : 0,
        active: true, decided: false, mode: 'none',
        fromOpen: openRef.current,
        target: e.target as HTMLElement,
      };
    }

    function onMove(e: TouchEvent) {
      const d = drag.current;
      if (!d.active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - d.startX;
      const dy = t.clientY - d.startY;

      if (!d.decided) {
        if (Math.abs(dx) < DECIDE_SLOP && Math.abs(dy) < DECIDE_SLOP) return;
        d.decided = true;

        const horizontal = Math.abs(dx) > Math.abs(dy);
        const opensDrawer = !d.fromOpen && dx > 0 && !hasHorizontalScroll(d.target, container, 1);
        const closesDrawer = d.fromOpen && dx < 0;

        if (horizontal && (opensDrawer || closesDrawer)) {
          d.mode = 'drag';
        } else if (d.fromOpen && !asideRef.current?.contains(d.target)) {
          // Drawer open: block the background page from scrolling. (The sidebar
          // itself — asideRef — is allowed to scroll.)
          d.mode = 'lock';
        } else {
          // Let the touch scroll natively (page when closed, sidebar when open).
          d.mode = 'scroll';
          d.active = false;
          return;
        }
      }

      if (d.mode === 'drag') {
        if (e.cancelable) e.preventDefault();
        d.offset = Math.max(0, Math.min(DRAWER_WIDTH, (d.fromOpen ? DRAWER_WIDTH : 0) + dx));
        setDragX(d.offset);
      } else if (d.mode === 'lock') {
        if (e.cancelable) e.preventDefault();
      }
    }

    function onEnd() {
      const d = drag.current;
      const wasDragging = d.mode === 'drag';
      const offset = d.offset;
      d.active = false;
      d.decided = false;
      d.mode = 'none';
      if (wasDragging) {
        setOpen(offset > OPEN_THRESHOLD);
      }
      setDragX(null);
    }

    container.addEventListener('touchstart', onStart, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onEnd, { passive: true });
    container.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      container.removeEventListener('touchcancel', onEnd);
    };
  }, [setOpen]);

  const tx = dragging ? (dragX as number) : open ? DRAWER_WIDTH : 0;
  const overlayVisible = open || (dragging && tx > 0);

  return (
    <div ref={containerRef} className="md:hidden relative min-h-dvh overflow-x-hidden">
      {/* Sidebar — sits beneath the page and is revealed as it slides right. */}
      <aside
        ref={asideRef}
        className="fixed inset-y-0 left-0 w-72 z-10 overflow-y-auto bg-site-bg border-r border-site-border"
        aria-hidden={!overlayVisible}
      >
        <LeftSidebar expanded />
      </aside>

      {/* Page content — slides right over the sidebar. */}
      <div
        className={`relative z-20 min-h-dvh bg-site-bg ${
          dragging ? '' : 'transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
        }`}
        style={{ transform: transformActive ? `translate3d(${tx}px, 0, 0)` : undefined }}
      >
        {children}

        {/* Dim overlay over the page — tap to close. */}
        {overlayVisible && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 z-30 bg-black/50"
            style={{ opacity: tx / DRAWER_WIDTH }}
          />
        )}
      </div>
    </div>
  );
}
