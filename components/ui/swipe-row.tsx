'use client';

/**
 * Swipe actions on a list row (plan U11) — swipe-to-reply in iMessage,
 * swipe-to-archive in Mail. Touch only; on a mouse the same actions are the
 * row's visible buttons, so nothing here is ever the ONLY way to do a thing.
 *
 * Cost model, because a notification list can hold a hundred of these:
 *  - This is a gesture drag — the sanctioned exception to "nothing tracks the
 *    pointer" (design-language §5.1.1), same as `hooks/useFluidDrag`.
 *  - No listener exists until a finger lands. `pointerdown` attaches move/up/
 *    cancel to the row via pointer capture and removes them on release.
 *  - The row moves through `style.translate` on a ref — no React state, no
 *    render per move. The action strip behind it is sized to the uncovered
 *    gap, so the row keeps its list's own (glass) surface.
 *  - `touch-action: pan-y` hands vertical scrolling to the browser, which
 *    cancels the pointer the moment the gesture turns into a scroll, so a
 *    swipe can never fight the list.
 */

import { forwardRef, useCallback, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFluidDragEnabled } from '@/hooks/useFluidDrag';

export interface SwipeAction {
  icon: LucideIcon;
  /** Announced and shown under the icon. */
  label: string;
  onAction: () => void;
}

/** Travel at which a release commits the action. */
const COMMIT_PX = 72;
/** Beyond this the row resists (rubber band). */
const MAX_PX = 112;
/** Horizontal travel before the row starts to follow — below it, a tap is a tap. */
const SLOP_PX = 8;

export function SwipeRow({
  leading,
  trailing,
  children,
  className,
}: {
  /** Revealed by swiping right. */
  leading?: SwipeAction;
  /** Revealed by swiping left. */
  trailing?: SwipeAction;
  children: ReactNode;
  className?: string;
}) {
  const enabled = useFluidDragEnabled('(pointer: coarse)');
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const swallowClick = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || e.pointerType === 'mouse' || e.button > 0) return;
      const row = rowRef.current;
      const content = contentRef.current;
      if (!row || !content) return;
      const startX = e.clientX;
      const pointerId = e.pointerId;
      let dx = 0;
      let tracking = false;
      let armed: 'leading' | 'trailing' | null = null;
      // Follow the finger exactly; the CSS transitions only run on release.
      for (const el of [content, leadRef.current, trailRef.current]) {
        if (el) el.style.transition = 'none';
      }

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const raw = ev.clientX - startX;
        if (!tracking) {
          if (Math.abs(raw) < SLOP_PX) return;
          tracking = true;
          try {
            row.setPointerCapture(pointerId);
          } catch {
            /* pointer already gone */
          }
        }
        // Only the sides that have an action move at all.
        let next = raw;
        if ((next > 0 && !leading) || (next < 0 && !trailing)) next = 0;
        const sign = Math.sign(next);
        const mag = Math.abs(next);
        dx = sign * (mag <= MAX_PX ? mag : MAX_PX + (mag - MAX_PX) * 0.25);
        content.style.translate = `${dx}px 0`;
        // The strip is exactly the uncovered gap, so the row never needs an
        // opaque fill to hide it (it keeps its list's glass surface).
        if (leadRef.current) leadRef.current.style.width = `${Math.max(0, dx)}px`;
        if (trailRef.current) trailRef.current.style.width = `${Math.max(0, -dx)}px`;
        const nextArmed = dx >= COMMIT_PX ? 'leading' : dx <= -COMMIT_PX ? 'trailing' : null;
        if (nextArmed !== armed) {
          armed = nextArmed;
          row.dataset.armed = armed ?? '';
          // A tick as the action arms — the only feedback a thumb can feel.
          if (armed && 'vibrate' in navigator) navigator.vibrate?.(8);
        }
      };

      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        row.removeEventListener('pointermove', move);
        row.removeEventListener('pointerup', up);
        row.removeEventListener('pointercancel', cancel);
        for (const el of [content, leadRef.current, trailRef.current]) {
          if (el) el.style.transition = '';
        }
        content.style.translate = '';
        if (leadRef.current) leadRef.current.style.width = '';
        if (trailRef.current) trailRef.current.style.width = '';
        row.dataset.armed = '';
      };
      const up = (ev: PointerEvent) => {
        const fired = armed;
        end(ev);
        if (tracking) swallowClick.current = true;
        if (fired === 'leading') leading?.onAction();
        else if (fired === 'trailing') trailing?.onAction();
      };
      const cancel = (ev: PointerEvent) => end(ev);

      row.addEventListener('pointermove', move);
      row.addEventListener('pointerup', up);
      row.addEventListener('pointercancel', cancel);
    },
    [enabled, leading, trailing],
  );

  return (
    <div
      ref={rowRef}
      data-slot="swipe-row"
      className={cn('group/swipe relative overflow-hidden', className)}
      onPointerDown={enabled ? onPointerDown : undefined}
      onClickCapture={(e) => {
        // The release that ends a swipe is not also a tap on the row.
        if (swallowClick.current) {
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={enabled ? { touchAction: 'pan-y' } : undefined}
    >
      {enabled && leading ? <SwipeReveal ref={leadRef} action={leading} side="leading" /> : null}
      {enabled && trailing ? (
        <SwipeReveal ref={trailRef} action={trailing} side="trailing" />
      ) : null}
      <div ref={contentRef} className="relative transition-[translate] duration-site">
        {children}
      </div>
    </div>
  );
}

const SwipeReveal = forwardRef<
  HTMLDivElement,
  { action: SwipeAction; side: 'leading' | 'trailing' }
>(function SwipeReveal({ action, side }, ref) {
  const Icon = action.icon;
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        // Zero width at rest; the gesture sizes it to the uncovered gap.
        'absolute inset-y-0 w-0 overflow-hidden',
        'flex flex-col items-center justify-center gap-1 text-xs font-medium whitespace-nowrap',
        'bg-site-surface text-site-text-muted transition-[width,background-color,color] duration-site',
        side === 'leading'
          ? 'left-0 group-data-[armed=leading]/swipe:bg-site-accent group-data-[armed=leading]/swipe:text-site-accent-fg'
          : 'right-0 group-data-[armed=trailing]/swipe:bg-site-accent group-data-[armed=trailing]/swipe:text-site-accent-fg',
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {action.label}
    </div>
  );
});
