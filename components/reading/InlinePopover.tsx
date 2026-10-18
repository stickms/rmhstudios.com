'use client';

/**
 * A tiny anchored, non-modal popover for footnotes (narrow screens) and
 * glossary terms. Deliberately dependency-free: it ships inside the article
 * routes, which sit in the client entry chunk, so it must stay a few hundred
 * bytes. Opens on click/Enter/Space, closes on Escape (focus returns to the
 * trigger), outside press, scroll and resize. Positioned once at open time from
 * the trigger's rect — never per frame, never from the cursor.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const WIDTH = 352;

export function useAnchoredPopover<T extends HTMLElement>() {
  const triggerRef = useRef<T | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const close = useCallback((returnFocus = false) => {
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setPos((cur) => {
      if (cur) return null;
      const el = triggerRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - 24);
      const left = Math.max(12, Math.min(r.left, vw - width - 12));
      return r.bottom + 180 > vh && r.top > 200
        ? { left, bottom: vh - r.top + 6 }
        : { left, top: r.bottom + 6 };
    });
  }, []);

  const open = pos !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onAway = () => close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onAway, { passive: true, capture: true });
    window.addEventListener('resize', onAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onAway, { capture: true });
      window.removeEventListener('resize', onAway);
    };
  }, [open, close]);

  return { triggerRef, popRef, id, pos, open, toggle, close };
}

export function PopoverPanel({
  state,
  label,
  children,
}: {
  state: ReturnType<typeof useAnchoredPopover>;
  label: string;
  children: ReactNode;
}) {
  if (!state.pos || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={state.popRef}
      id={state.id}
      role="dialog"
      aria-label={label}
      className="rf-pop glass-overlay"
      style={state.pos}
    >
      {children}
    </div>,
    document.body,
  );
}
