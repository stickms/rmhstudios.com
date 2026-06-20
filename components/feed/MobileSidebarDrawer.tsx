'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LeftSidebar } from './LeftSidebar';

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Opened by an edge-swipe from the left of the screen. */
  onOpen?: () => void;
}

const DRAWER_WIDTH = 256; // w-64
// How far a left-edge swipe must travel to open, and how far a drag must travel
// (or how fast it must fling) to close.
const OPEN_THRESHOLD = 48;
const CLOSE_THRESHOLD = DRAWER_WIDTH * 0.4;
const EDGE_ZONE = 28; // px from the left edge that starts an open-swipe

export function MobileSidebarDrawer({ open, onClose, onOpen }: MobileSidebarDrawerProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  // While the user is dragging the open drawer closed, this holds the live
  // x-offset (0 → -DRAWER_WIDTH). null means "not dragging — use CSS classes".
  const [dragX, setDragX] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    startX: 0,
    startY: 0,
    offset: 0,
    active: false,
    decided: false,
    mode: 'none' as 'none' | 'drag' | 'scroll',
    inPanel: false,
    inScroll: false,
  });
  // Live ref to onClose so the once-attached native touch listeners never call
  // a stale closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mount the component when open becomes true
  useEffect(() => {
    if (open) {
      setVisible(true);
    } else if (visible) {
      setAnimating(false);
      const timeout = setTimeout(() => setVisible(false), 150);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Trigger slide-in animation after the component has mounted and painted
  useEffect(() => {
    if (visible && open) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    }
  }, [visible, open]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lock background scroll while the drawer is open. Touch scrolling is blocked
  // by the overlay's non-passive handlers below; this `overflow:hidden` covers
  // wheel/keyboard scroll on desktop. We deliberately avoid `position:fixed` —
  // toggling it during an active touch occasionally left the body stuck
  // (unscrollable) after the drawer closed.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Edge-swipe to open: a left-edge horizontal drag opens the drawer. Always
  // listening (this effect still runs while the drawer renders null), but only
  // acts when closed, on touch/narrow viewports, and when an opener is provided.
  useEffect(() => {
    if (open || !onOpen) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function onStart(e: TouchEvent) {
      if (window.innerWidth >= 768) return; // mobile only (md breakpoint)
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_ZONE) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    }
    function onMove(e: TouchEvent) {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Abort if the gesture is mostly vertical (let the page scroll).
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        tracking = false;
        return;
      }
      // Horizontal drag inward from the left edge: cancel the browser's native
      // edge-swipe (iOS Safari "go back") so the gesture opens the drawer
      // instead of navigating away. Must be a non-passive listener for this.
      if (dx > 0 && Math.abs(dx) >= Math.abs(dy) && e.cancelable) {
        e.preventDefault();
      }
      if (dx > OPEN_THRESHOLD) {
        tracking = false;
        onOpen?.();
      }
    }
    function stop() {
      tracking = false;
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', stop);
      document.removeEventListener('touchcancel', stop);
    };
  }, [open, onOpen]);

  // Drag-to-close + background scroll lock, via non-passive native listeners on
  // the whole overlay. This means: (a) a horizontal swipe ANYWHERE — including
  // the dimmed area to the right of the panel — drags the drawer closed, (b) a
  // tap outside the panel closes it, and (c) the page can never scroll while the
  // drawer is open or being dragged (only the inner nav list may scroll).
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!visible || !overlay) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const target = e.target as Node;
      drag.current = {
        startX: t.clientX,
        startY: t.clientY,
        offset: 0,
        active: true,
        decided: false,
        mode: 'none',
        inPanel: !!panelRef.current?.contains(target),
        inScroll: !!scrollRef.current?.contains(target),
      };
    }

    function onTouchMove(e: TouchEvent) {
      const d = drag.current;
      if (!d.active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - d.startX;
      const dy = t.clientY - d.startY;

      // Decide gesture direction once it clears a small dead zone.
      if (!d.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        d.decided = true;
        d.mode = Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll';
      }

      if (d.mode === 'drag') {
        // Horizontal drag-to-close from anywhere on the overlay.
        if (e.cancelable) e.preventDefault();
        d.offset = Math.max(-DRAWER_WIDTH, Math.min(0, dx));
        setDragX(d.offset);
        return;
      }

      // Vertical gesture: let the inner nav list scroll, but block anything that
      // would bleed through to the page behind the drawer.
      if (d.inScroll && scrollRef.current) {
        const el = scrollRef.current;
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
        if ((atTop && dy > 0) || (atBottom && dy < 0)) {
          if (e.cancelable) e.preventDefault();
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
    }

    function onTouchEnd() {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      if (d.mode === 'drag') {
        if (d.offset <= -CLOSE_THRESHOLD) onCloseRef.current();
        setDragX(null);
        return;
      }
      // Tap outside the panel (no significant move) → close.
      if (!d.decided && !d.inPanel) onCloseRef.current();
      setDragX(null);
    }

    overlay.addEventListener('touchstart', onTouchStart, { passive: true });
    overlay.addEventListener('touchmove', onTouchMove, { passive: false });
    overlay.addEventListener('touchend', onTouchEnd, { passive: true });
    overlay.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      overlay.removeEventListener('touchstart', onTouchStart);
      overlay.removeEventListener('touchmove', onTouchMove);
      overlay.removeEventListener('touchend', onTouchEnd);
      overlay.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [visible]);

  if (!visible) return null;

  const dragging = dragX !== null;
  // Backdrop fades in proportion to how far the drawer is pulled out.
  const dragProgress = dragging ? 1 + (dragX as number) / DRAWER_WIDTH : 1;

  return (
    <div ref={overlayRef} className="md:hidden fixed inset-0 z-100" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm touch-none ${
          dragging ? '' : 'transition-opacity duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
        } ${animating ? 'opacity-100' : 'opacity-0'}`}
        style={dragging ? { opacity: dragProgress } : undefined}
        onClick={onClose}
        aria-label="Close menu"
      />
      {/* Drawer */}
      <div
        ref={panelRef}
        className={`absolute left-0 top-0 bottom-0 w-64 bg-site-bg border-r border-site-border shadow-xl touch-none ${
          dragging ? '' : 'transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
        } ${animating ? 'translate-x-0' : '-translate-x-full'}`}
        style={dragging ? { transform: `translateX(${dragX}px)` } : undefined}
      >
        <div className="flex items-center justify-between p-3 border-b border-site-border">
          <span className="site-logo font-bold text-lg text-site-text">
            RMH
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div ref={scrollRef} className="overflow-y-auto h-[calc(100%-56px)] touch-pan-y">
          <LeftSidebar expanded />
          <div className="h-8 shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
