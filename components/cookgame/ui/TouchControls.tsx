"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { touchInput, resetTouchInput } from '@/lib/cookgame/touch-input';
import { useCookgameStore } from '@/lib/cookgame/store';

const RADIUS = 56; // joystick travel in px
const DEAD_ZONE = 0.12;

/**
 * On-screen controls for phones/tablets: a joystick, a Use button (the touch
 * equivalent of E) and a run latch. Shown only on coarse pointers so desktop
 * keyboard play is unchanged. Without this the game was unplayable on touch
 * devices: there was no way to move or interact.
 */
export function TouchControls() {
  const [coarse, setCoarse] = useState(false);
  const [sprint, setSprint] = useState(false);
  const overlay = useCookgameStore((s) => s.activeOverlay);
  const near = useCookgameStore((s) => s.nearbyInteractable);
  const padRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    const update = () => setCoarse(!!mq?.matches || navigator.maxTouchPoints > 0);
    update();
    mq?.addEventListener?.('change', update);
    return () => {
      mq?.removeEventListener?.('change', update);
      resetTouchInput();
      touchInput.sprint = false;
    };
  }, []);

  // Never leave the player walking when a menu opens or the app is backgrounded.
  const release = useCallback(() => {
    pointerId.current = null;
    resetTouchInput();
    if (thumbRef.current) thumbRef.current.style.transform = 'translate(0px, 0px)';
  }, []);
  useEffect(() => {
    if (overlay) release();
  }, [overlay, release]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') release();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [release]);

  const track = useCallback((e: React.PointerEvent) => {
    const pad = padRef.current;
    const thumb = thumbRef.current;
    if (!pad || !thumb) return;
    const r = pad.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / RADIUS;
    let dy = (e.clientY - (r.top + r.height / 2)) / RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    thumb.style.transform = `translate(${dx * RADIUS}px, ${dy * RADIUS}px)`;
    if (Math.min(1, len) < DEAD_ZONE) {
      touchInput.x = 0;
      touchInput.z = 0;
    } else {
      touchInput.x = dx;
      touchInput.z = dy;
    }
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    track(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId === pointerId.current) track(e);
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerId === pointerId.current) release();
  };

  const interact = () => {
    const s = useCookgameStore.getState();
    if (s.nearbyInteractable && !s.activeOverlay) s.setActiveOverlay(s.nearbyInteractable);
  };

  if (!coarse || overlay) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none" data-jelly-scope="off">
      <div
        ref={padRef}
        data-gesture=""
        className="pointer-events-auto absolute bottom-[calc(1.5rem+var(--safe-bottom))] left-[calc(1.5rem+var(--safe-left))] flex h-36 w-36 touch-none items-center justify-center rounded-full border-2 border-white/20 bg-black/30"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-hidden="true"
      >
        <div ref={thumbRef} className="h-14 w-14 rounded-full border border-white/40 bg-white/25" style={{ willChange: 'transform' }} />
      </div>
      <div className="absolute bottom-[calc(1.5rem+var(--safe-bottom))] right-[calc(1.5rem+var(--safe-right))] flex flex-col items-end gap-3">
        <button
          type="button"
          aria-pressed={sprint}
          onClick={() => {
            touchInput.sprint = !sprint;
            setSprint(!sprint);
          }}
          className={`pointer-events-auto touch-manipulation h-14 min-w-14 rounded-full border px-3 font-mono text-xs uppercase tracking-widest ${
            sprint ? 'border-lime-400 bg-lime-400/25 text-lime-300' : 'border-white/30 bg-black/40 text-neutral-200'
          }`}
        >
          Run
        </button>
        <button
          type="button"
          onClick={interact}
          disabled={!near}
          className="pointer-events-auto touch-manipulation h-16 min-w-16 rounded-full border border-lime-400/60 bg-lime-400/20 px-4 font-mono text-sm uppercase tracking-widest text-lime-300 disabled:opacity-40"
        >
          Use
        </button>
      </div>
    </div>
  );
}
