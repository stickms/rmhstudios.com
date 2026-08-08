'use client';

/**
 * Two thumbs, two arms.
 *
 * ## Pointer events, per-`pointerId`, `touch-action: none`
 *
 * All three are load-bearing and all three are the same bug if you get them
 * wrong. `touchstart` would miss a stylus and fight the browser's own gesture
 * recogniser; without `setPointerCapture` a thumb that slides off the element
 * stops reporting and the arm freezes mid-swing; without `touch-action: none`
 * the first drag scrolls the page instead of aiming. `lib/bums-rush/input/
 * touch.ts` owns the maths and the multi-touch isolation (a half is claimed by
 * exactly one pointer, so a resting palm cannot steal an arm); this file owns
 * the surface and the drawing.
 *
 * ## Two schemes
 *
 * **Auto-Grab** (default, §12.2 A): each screen half is a relative virtual
 * stick. Finger down = reach and hold; finger up = let go. No buttons, because
 * two independent analog arms plus two grabs do not fit on two thumbs.
 *
 * **Two-stick** (§12.2 B): fixed bases in the lower corners plus explicit grab
 * pads. The full verb set for players who want it.
 *
 * ## Sizing
 *
 * Everything is `clamp(min, vmin, max)`. `vmin` because the scarce axis on a
 * landscape phone is height, and a control sized off width becomes a slab on a
 * tablet; the floor is 44px, which is the smallest target that is reliably
 * hittable with a thumb. Every pinned control adds the matching `--safe-*`
 * inset — checked in LANDSCAPE, where the notch takes a long edge.
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, MessageCircle, PackageOpen, Sparkles } from 'lucide-react';
import {
  TOUCH_STICK_FULL_DEFLECTION_PX,
  armForTouchX,
  onTouchDown,
  onTouchMove,
  onTouchUp,
  type ArmSide,
  type TouchArmState,
  type TouchScheme,
} from '@/lib/bums-rush/input';
import type { SeatIndex } from '@/lib/bums-rush/types';

interface TouchControlsProps {
  scheme: TouchScheme;
  /** The seat this device drives — the stick is drawn in its ink. */
  seat: SeatIndex;
  stateRef: MutableRefObject<TouchArmState>;
  buttonsRef: MutableRefObject<Set<string>>;
  /** Hidden while a menu is up, so a pause menu is not played through. */
  active: boolean;
}

/** How long a stick sits still before it fades back to 30% (§12.2). */
const IDLE_FADE_MS = 2000;

export function TouchControls({ scheme, seat, stateRef, buttonsRef, active }: TouchControlsProps) {
  const { t } = useTranslation('c-bums-rush');
  const layerRef = useRef<HTMLDivElement | null>(null);
  const sticks = useRef<Record<ArmSide, HTMLDivElement | null>>({ l: null, r: null });
  const knobs = useRef<Record<ArmSide, HTMLDivElement | null>>({ l: null, r: null });
  const fadeTimers = useRef<Record<ArmSide, number | null>>({ l: null, r: null });

  useEffect(() => {
    const timers = fadeTimers.current;
    return () => {
      for (const side of ['l', 'r'] as const) {
        if (timers[side] !== null) window.clearTimeout(timers[side] as number);
      }
    };
  }, []);

  // A control that is not visible must not be holding an arm down: when the
  // pause menu opens, every claimed pointer is released.
  useEffect(() => {
    if (active) return;
    stateRef.current = { left: null, right: null };
    buttonsRef.current.clear();
    for (const side of ['l', 'r'] as const) hideStick(sticks.current[side]);
  }, [active, stateRef, buttonsRef]);

  if (!active) return null;

  const localPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = (layerRef.current ?? event.currentTarget).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width };
  };

  const sideForPointer = (pointerId: number): ArmSide | null => {
    if (stateRef.current.left?.pointerId === pointerId) return 'l';
    if (stateRef.current.right?.pointerId === pointerId) return 'r';
    return null;
  };

  const paintStick = (side: ArmSide) => {
    const touch = side === 'l' ? stateRef.current.left : stateRef.current.right;
    const base = sticks.current[side];
    const knob = knobs.current[side];
    if (!base || !knob || !touch) return;

    base.hidden = false;
    base.style.opacity = '1';
    base.style.left = `${touch.origin.x}px`;
    base.style.top = `${touch.origin.y}px`;

    const dx = touch.current.x - touch.origin.x;
    const dy = touch.current.y - touch.origin.y;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(1, distance / TOUCH_STICK_FULL_DEFLECTION_PX);
    const nx = distance > 0 ? (dx / distance) * clamped * TOUCH_STICK_FULL_DEFLECTION_PX : 0;
    const ny = distance > 0 ? (dy / distance) * clamped * TOUCH_STICK_FULL_DEFLECTION_PX : 0;
    knob.style.transform = `translate(-50%, -50%) translate(${nx.toFixed(1)}px, ${ny.toFixed(1)}px)`;

    if (fadeTimers.current[side] !== null) window.clearTimeout(fadeTimers.current[side] as number);
    fadeTimers.current[side] = window.setTimeout(() => {
      if (base) base.style.opacity = '0.3';
    }, IDLE_FADE_MS);
  };

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const { x, y, width } = localPoint(event);
    const side = armForTouchX(x, width);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (scheme === 'two-stick') {
      // The base is fixed; the finger only supplies the deflection. Claiming at
      // the base and immediately moving to the finger gives the input layer the
      // origin it needs without teaching it about our layout.
      const base = fixedBase(side, width, event.currentTarget.clientHeight);
      stateRef.current = onTouchDown(stateRef.current, event.pointerId, base, width);
      stateRef.current = onTouchMove(stateRef.current, event.pointerId, { x, y });
    } else {
      stateRef.current = onTouchDown(stateRef.current, event.pointerId, { x, y }, width);
    }
    if (sideForPointer(event.pointerId)) paintStick(side);
  };

  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const side = sideForPointer(event.pointerId);
    if (!side) return;
    const { x, y } = localPoint(event);
    stateRef.current = onTouchMove(stateRef.current, event.pointerId, { x, y });
    paintStick(side);
  };

  const handleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const side = sideForPointer(event.pointerId);
    stateRef.current = onTouchUp(stateRef.current, event.pointerId);
    if (side) hideStick(sticks.current[side]);
  };

  const bindButton = (code: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      buttonsRef.current.add(code);
    },
    onPointerUp: () => buttonsRef.current.delete(code),
    onPointerCancel: () => buttonsRef.current.delete(code),
    onLostPointerCapture: () => buttonsRef.current.delete(code),
  });

  return (
    <>
      {/*
        The gesture surface runs to the very edge of the screen on purpose: it
        is not a control that must clear the notch, it is the area a thumb may
        travel through, and hardware you cannot touch through cannot receive a
        touch anyway. The DRAWN parts of it are inset below.
      */}
      <div
        ref={layerRef}
        className="absolute inset-0 z-10"
        style={{ touchAction: 'none' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onLostPointerCapture={handleUp}
      >
        {(['l', 'r'] as const).map((side) => (
          <div
            key={side}
            hidden
            ref={(node) => {
              sticks.current[side] = node;
            }}
            className="pointer-events-none absolute rounded-full border-2 border-dashed"
            style={{
              width: 'clamp(4.5rem, 16vmin, 8rem)',
              height: 'clamp(4.5rem, 16vmin, 8rem)',
              marginLeft: 'calc(clamp(4.5rem, 16vmin, 8rem) / -2)',
              marginTop: 'calc(clamp(4.5rem, 16vmin, 8rem) / -2)',
              borderColor: `var(--bum-seat-${seat + 1})`,
              opacity: 1,
              transition: 'opacity 400ms linear',
            }}
          >
            <div
              ref={(node) => {
                knobs.current[side] = node;
              }}
              className="absolute top-1/2 left-1/2 rounded-full"
              style={{
                width: 'clamp(1.75rem, 6vmin, 3rem)',
                height: 'clamp(1.75rem, 6vmin, 3rem)',
                backgroundColor: `var(--bum-seat-${seat + 1})`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Verb buttons. Sibling of the gesture surface, never nested inside it,
          so a tap here can never also claim an arm. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center-safe"
        style={{
          paddingBottom: 'calc(var(--safe-bottom) + clamp(0.4rem, 2vmin, 1rem))',
          paddingLeft: 'var(--safe-left)',
          paddingRight: 'var(--safe-right)',
        }}
      >
        <div className="pointer-events-auto flex items-center gap-[clamp(0.35rem,1.5vmin,0.75rem)]">
          {scheme === 'two-stick' ? (
            <>
              <TouchButton
                label={t('touch.grab-left', { defaultValue: 'Grab left' })}
                {...bindButton('grab-left-button')}
              >
                <Hand className="size-[clamp(1rem,3vmin,1.5rem)] -scale-x-100" aria-hidden="true" />
              </TouchButton>
              <TouchButton
                label={t('touch.grab-right', { defaultValue: 'Grab right' })}
                {...bindButton('grab-right-button')}
              >
                <Hand className="size-[clamp(1rem,3vmin,1.5rem)]" aria-hidden="true" />
              </TouchButton>
            </>
          ) : null}
          <TouchButton label={t('touch.emote', { defaultValue: 'Holler' })} {...bindButton('btn-emote')}>
            <MessageCircle className="size-[clamp(1rem,3vmin,1.5rem)]" aria-hidden="true" />
          </TouchButton>
          <TouchButton label={t('touch.use', { defaultValue: 'Use item' })} {...bindButton('btn-use')}>
            <Sparkles className="size-[clamp(1rem,3vmin,1.5rem)]" aria-hidden="true" />
          </TouchButton>
          <TouchButton label={t('touch.drop', { defaultValue: 'Drop' })} {...bindButton('btn-drop')}>
            <PackageOpen className="size-[clamp(1rem,3vmin,1.5rem)]" aria-hidden="true" />
          </TouchButton>
        </div>
      </div>
    </>
  );
}

function TouchButton({
  label,
  children,
  ...handlers
}: {
  label: string;
  children: React.ReactNode;
} & Pick<
  React.ComponentPropsWithoutRef<'button'>,
  'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture'
>) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex items-center justify-center rounded-full border-2 border-bum-ink bg-bum-surface text-bum-ink transition-colors active:bg-bum-highlight"
      style={{
        touchAction: 'none',
        // 44px floor: the smallest target a thumb hits reliably. `vmin` keeps
        // it proportional from a 4" phone to a 13" tablet.
        width: 'clamp(2.75rem, 8vmin, 4rem)',
        height: 'clamp(2.75rem, 8vmin, 4rem)',
      }}
      {...handlers}
    >
      {children}
    </button>
  );
}

/** Where a two-stick base sits: a thumb's reach in from the bottom corner. */
function fixedBase(side: ArmSide, width: number, height: number): { x: number; y: number } {
  const inset = Math.min(140, Math.max(70, Math.min(width, height) * 0.22));
  return {
    x: side === 'l' ? inset : width - inset,
    y: height - inset,
  };
}

function hideStick(node: HTMLDivElement | null): void {
  if (!node) return;
  node.hidden = true;
  node.style.opacity = '1';
}
