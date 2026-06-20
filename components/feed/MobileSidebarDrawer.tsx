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
  const drag = useRef({ startX: 0, startY: 0, active: false, decided: false });

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

  // Lock background scroll while the drawer is open. A plain `overflow:hidden`
  // on <body> is unreliable on iOS Safari (touch scrolling still bleeds through,
  // so horizontal drawer swipes end up scrolling the feed behind it). Pinning
  // the body with `position:fixed` and restoring the scroll position on close is
  // the robust cross-browser lock.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
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
      if (dx > OPEN_THRESHOLD) {
        tracking = false;
        onOpen?.();
      }
    }
    function stop() {
      tracking = false;
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', stop, { passive: true });
    document.addEventListener('touchcancel', stop, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', stop);
      document.removeEventListener('touchcancel', stop);
    };
  }, [open, onOpen]);

  // ── Drag-to-close handlers (on the drawer panel) ──────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    drag.current = { startX: t.clientX, startY: t.clientY, active: true, decided: false };
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!drag.current.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - drag.current.startX;
    const dy = t.clientY - drag.current.startY;
    // Decide gesture direction once: vertical → let inner content scroll.
    if (!drag.current.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.current.decided = true;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current.active = false;
        return;
      }
    }
    // Only track leftward (closing) movement; clamp to the panel width.
    setDragX(Math.max(-DRAWER_WIDTH, Math.min(0, dx)));
  }
  function handleTouchEnd() {
    if (!drag.current.active) {
      setDragX(null);
      return;
    }
    drag.current.active = false;
    const offset = dragX ?? 0;
    if (offset <= -CLOSE_THRESHOLD) {
      onClose();
    }
    setDragX(null);
  }

  if (!visible) return null;

  const dragging = dragX !== null;
  // Backdrop fades in proportion to how far the drawer is pulled out.
  const dragProgress = dragging ? 1 + (dragX as number) / DRAWER_WIDTH : 1;

  return (
    <div className="md:hidden fixed inset-0 z-100" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${
          dragging ? '' : 'transition-opacity duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
        } ${animating ? 'opacity-100' : 'opacity-0'}`}
        style={dragging ? { opacity: dragProgress } : undefined}
        onClick={onClose}
        aria-label="Close menu"
      />
      {/* Drawer */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`absolute left-0 top-0 bottom-0 w-64 bg-site-bg border-r border-site-border shadow-xl touch-pan-y ${
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
        <div className="overflow-y-auto h-[calc(100%-56px)]">
          <LeftSidebar expanded />
          <div className="h-8 shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
