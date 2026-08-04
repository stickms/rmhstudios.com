'use client';

/**
 * Nightrail — the touch pad.
 *
 * Every handler writes straight into `inputRef.current`, which is the same
 * object the fixed-step sim reads each tick. Nothing here holds React state, so
 * a thumb resting on the drift button does not re-render the tree sixty times a
 * second while the game is trying to hold a frame budget.
 *
 * The layout assumes landscape, thumbs on the bottom corners: rails and drift
 * on the left, jump/boost and the trick pad on the right. That means BOTH side
 * safe-area insets matter — a notch is on the left as often as the right,
 * depending on which way the phone was turned.
 */

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ChevronsUp, Flame, Wind } from 'lucide-react';
import type { InputState, TrickDirection } from '@/lib/nightrail/types';

/** The held, button-shaped inputs. `trick` is a one-shot and `pause`/`restart` are the parent's. */
type HoldInput = 'left' | 'right' | 'drift' | 'jump' | 'boost';

/**
 * How far a thumb must travel before it counts as a flick, in CSS pixels.
 *
 * Low enough that a quick throw registers inside the ~0.4s of air a short hop
 * gives you, high enough that resting a thumb on the pad and jittering does
 * not fire a trick the player never asked for.
 */
const FLICK_PX = 22;

/**
 * Compass order, starting at east and going anticlockwise in 45° steps.
 *
 * Index comes straight from `atan2`, so the mapping is a lookup rather than a
 * chain of angle comparisons that would be wrong at exactly one boundary.
 */
const OCTANTS: TrickDirection[] = [
  'right',
  'upRight',
  'up',
  'upLeft',
  'left',
  'downLeft',
  'down',
  'downRight',
];

interface Props {
  inputRef: RefObject<InputState>;
  visible: boolean;
}

/** Where a flick started, plus whether it has already fired this gesture. */
interface FlickOrigin {
  x: number;
  y: number;
  fired: boolean;
}

export function NightrailTouchControls({ inputRef, visible }: Props) {
  const { t } = useTranslation('c-nightrail');
  const flick = useRef<FlickOrigin | null>(null);

  if (!visible) return null;

  const bind = (key: HoldInput) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      inputRef.current[key] = true;
    },
    onPointerUp: (e: ReactPointerEvent) => {
      e.stopPropagation();
      inputRef.current[key] = false;
    },
    onPointerCancel: () => {
      inputRef.current[key] = false;
    },
    // Without this a thumb that slides off the button leaves the input latched
    // on, and the train drifts forever with nothing on screen to explain why.
    onPointerLeave: () => {
      inputRef.current[key] = false;
    },
  });

  const resolveFlick = (x: number, y: number) => {
    const origin = flick.current;
    if (!origin || origin.fired) return;
    const dx = x - origin.x;
    const dy = y - origin.y;
    if (Math.hypot(dx, dy) < FLICK_PX) return;
    // Screen Y grows downward; negate it so "up" is up.
    const index = ((Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    inputRef.current.trick = OCTANTS[index];
    origin.fired = true;
  };

  const button =
    'pointer-events-auto flex select-none items-center justify-center rounded-full ' +
    'border border-white/20 backdrop-blur-[2px] transition-colors';
  // vmin keeps the pad thumb-sized on a 4" phone without turning into slabs on
  // a tablet, in either orientation.
  const size = { width: 'clamp(52px, 11vmin, 84px)', height: 'clamp(52px, 11vmin, 84px)' };
  const smallSize = { width: 'clamp(44px, 9vmin, 68px)', height: 'clamp(44px, 9vmin, 68px)' };
  const padSize = { width: 'clamp(84px, 20vmin, 148px)', height: 'clamp(84px, 20vmin, 148px)' };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
      style={{
        touchAction: 'none',
        paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)',
        paddingTop: 'var(--safe-top)',
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      <div className="flex items-end justify-between px-4">
        {/* Left thumb — rails and drift */}
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <button
            type="button"
            className={`${button} border-cyan-400/35 bg-cyan-500/20 px-4 active:bg-cyan-500/45`}
            style={{ height: 'clamp(38px, 7.5vmin, 56px)', touchAction: 'none' }}
            aria-label={t('drift', { defaultValue: 'Drift' })}
            {...bind('drift')}
          >
            <Wind className="mr-1.5 h-4 w-4 text-cyan-200" aria-hidden="true" />
            <span className="text-[11px] font-black tracking-wider text-cyan-200">
              {t('drift', { defaultValue: 'Drift' })}
            </span>
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              className={`${button} bg-white/10 active:bg-white/25`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('rail-left', { defaultValue: 'Switch to the left rail' })}
              {...bind('left')}
            >
              <ArrowLeft className="h-7 w-7 text-white/75" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${button} bg-white/10 active:bg-white/25`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('rail-right', { defaultValue: 'Switch to the right rail' })}
              {...bind('right')}
            >
              <ArrowRight className="h-7 w-7 text-white/75" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Right thumb — boost, jump, and the trick pad */}
        <div className="pointer-events-auto flex items-end gap-3">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className={`${button} border-orange-400/35 bg-orange-500/20 active:bg-orange-500/45`}
              style={{ ...smallSize, touchAction: 'none' }}
              aria-label={t('boost', { defaultValue: 'Boost' })}
              {...bind('boost')}
            >
              <Flame className="h-5 w-5 text-orange-300" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${button} border-emerald-400/30 bg-emerald-500/18 active:bg-emerald-500/40`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('jump', { defaultValue: 'Jump — hold to charge' })}
              {...bind('jump')}
            >
              <ChevronsUp className="h-7 w-7 text-emerald-200" aria-hidden="true" />
            </button>
          </div>

          {/* Trick pad: a flick surface, not eight buttons — eight targets this
              size would each be too small to hit while the ground is coming up. */}
          <button
            type="button"
            className="pointer-events-auto relative select-none rounded-full border border-fuchsia-400/35 bg-fuchsia-500/12 backdrop-blur-[2px] transition-colors active:bg-fuchsia-500/25"
            style={{ ...padSize, touchAction: 'none' }}
            aria-label={t('trick-pad', { defaultValue: 'Trick pad — flick a direction to trick' })}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              flick.current = { x: e.clientX, y: e.clientY, fired: false };
            }}
            onPointerMove={(e) => {
              // Fire mid-gesture: waiting for release would cost the player the
              // rest of the airtime they were spending the trick on.
              resolveFlick(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              resolveFlick(e.clientX, e.clientY);
              flick.current = null;
            }}
            onPointerCancel={() => {
              flick.current = null;
            }}
            onPointerLeave={() => {
              flick.current = null;
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200/70"
            >
              {t('trick', { defaultValue: 'Trick' })}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[22%] rounded-full border border-dashed border-fuchsia-300/25"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
