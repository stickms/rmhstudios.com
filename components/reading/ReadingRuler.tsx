'use client';

/**
 * Y2 — the reading ruler: a line-focus band that dims everything except the line
 * you are on.
 *
 * It follows the READER, never the pointer (the design language forbids
 * cursor-tracking): the band holds its place on screen while the page scrolls
 * under it, ArrowUp/ArrowDown step it a line at a time, and it jumps to
 * whatever receives keyboard focus or to the caret when text is selected with
 * the keyboard. At the top/bottom of the screen the arrow keys fall through to
 * normal scrolling. State changes only on those discrete events — nothing runs
 * per frame — and motion is skipped entirely under reduced motion.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function lineHeightOf(el: Element | null): number {
  if (!el) return 28;
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  if (Number.isFinite(lh)) return lh;
  const fs = parseFloat(cs.fontSize);
  return Number.isFinite(fs) ? fs * 1.5 : 28;
}

export default function ReadingRuler({
  scope,
  containerRef,
}: {
  /** `page`: fixed to the viewport. `contained`: fills its positioned parent (the reader text view). */
  scope: 'page' | 'contained';
  containerRef: RefObject<HTMLElement | null>;
}) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [lh, setLh] = useState(28);
  // Band top, relative to the ruler's own box.
  const [top, setTop] = useState<number | null>(null);
  const viaKeyboard = useRef(false);
  const topRef = useRef<number | null>(null);
  topRef.current = top;

  const box = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    return { top: r?.top ?? 0, height: r?.height ?? window.innerHeight };
  }, []);

  // Initial placement: ~40% down the box, at the container's line height.
  useEffect(() => {
    const h = lineHeightOf(containerRef.current);
    setLh(h);
    setTop((cur) => cur ?? Math.round(box().height * 0.4));
  }, [box, containerRef]);

  const bandH = lh * 2;

  const place = useCallback(
    (viewportY: number) => {
      const b = box();
      const rel = viewportY - b.top;
      setTop(Math.max(0, Math.min(b.height - bandH, Math.round(rel))));
    },
    [box, bandH],
  );

  useEffect(() => {
    const inField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

    const onKeyDown = (e: KeyboardEvent) => {
      viaKeyboard.current = KEYS.has(e.key) || e.shiftKey;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (inField(e.target) || (e.target as HTMLElement | null)?.closest?.('[role="dialog"]'))
        return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const b = box();
      const at = topRef.current ?? Math.round(b.height * 0.4);
      const next = at + (e.key === 'ArrowDown' ? lh : -lh);
      const margin = lh * 3;
      // Near an edge, let the page scroll instead of pinning the band there.
      if (next < margin || next > b.height - bandH - margin) return;
      e.preventDefault();
      setTop(next);
    };
    const onPointer = () => {
      viaKeyboard.current = false;
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !containerRef.current?.contains(t)) return;
      const r = t.getBoundingClientRect();
      place(r.top + r.height / 2 - bandH / 2);
    };
    const onSelection = () => {
      if (!viaKeyboard.current) return;
      const sel = document.getSelection();
      const root = containerRef.current;
      if (!sel || sel.rangeCount === 0 || !root || !root.contains(sel.focusNode)) return;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(false);
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (r && (r.height > 0 || r.top > 0)) place(r.top + r.height / 2 - bandH / 2);
    };
    const onResize = () =>
      setTop((cur) => (cur === null ? cur : Math.min(cur, Math.max(0, box().height - bandH))));

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('selectionchange', onSelection);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('selectionchange', onSelection);
      window.removeEventListener('resize', onResize);
    };
  }, [box, bandH, lh, place, containerRef]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-rf-skip=""
      data-motion={reduced ? 'none' : 'smooth'}
      className={scope === 'contained' ? 'rf-ruler rf-ruler--contained' : 'rf-ruler'}
      style={
        {
          '--rf-ruler-top': `${top ?? 0}px`,
          '--rf-ruler-h': `${bandH}px`,
          visibility: top === null ? 'hidden' : 'visible',
        } as React.CSSProperties
      }
    >
      <div className="rf-ruler__dim rf-ruler__dim--top" />
      <div className="rf-ruler__band" />
      <div className="rf-ruler__dim rf-ruler__dim--bottom" />
    </div>
  );
}
