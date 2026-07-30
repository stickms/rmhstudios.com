'use client';

/**
 * Touch controls for the first-person cockpit.
 *
 * Two layouts, because the two ways of holding a phone want different things:
 *
 *  - **Handheld** — the usual pad: steer on the left, throttle and brake on
 *    the right, boost in the middle. Buttons are sized in `vmin` so they stay
 *    thumb-sized on a 4" phone and don't turn into slabs on a tablet.
 *  - **Viewer (stereo)** — the phone is in a headset and the screen cannot be
 *    read, so there are no visible buttons at all. The two halves of the panel
 *    become steering zones, the throttle is held open for you, and a two-finger
 *    touch fires boost. This is the only scheme that works when you cannot see
 *    your hands.
 */

import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, RotateCcw } from 'lucide-react';
import type { InputState } from '@/lib/neon-driftway/types';

interface Props {
  inputRef: MutableRefObject<InputState>;
  onPause: () => void;
  onRecenter: () => void;
  /** Show the recenter control only when head look is actually running. */
  showRecenter: boolean;
  stereo: boolean;
  visible: boolean;
}

export function NeonDriftwayTouchControls({
  inputRef,
  onPause,
  onRecenter,
  showRecenter,
  stereo,
  visible,
}: Props) {
  const { t } = useTranslation('c-neon-driftway');
  if (!visible) return null;

  const bind = (key: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      inputRef.current[key] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      inputRef.current[key] = false;
    },
    onPointerCancel: () => {
      inputRef.current[key] = false;
    },
    onPointerLeave: () => {
      inputRef.current[key] = false;
    },
  });

  // ── Viewer mode: invisible half-screen steering, throttle held open ──
  if (stereo) {
    const steer = (key: 'left' | 'right') => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        inputRef.current[key] = true;
        // A second finger anywhere means boost — reachable without looking.
        if (e.isPrimary === false) inputRef.current.boost = true;
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        inputRef.current[key] = false;
        inputRef.current.boost = false;
      },
      onPointerCancel: () => {
        inputRef.current[key] = false;
        inputRef.current.boost = false;
      },
    });

    return (
      <div className="absolute inset-0 z-20 flex" style={{ touchAction: 'none' }}>
        <button
          type="button"
          className="h-full w-1/2 bg-transparent"
          aria-label={t('steer-left', { defaultValue: 'Steer left' })}
          {...steer('left')}
        />
        <button
          type="button"
          className="h-full w-1/2 bg-transparent"
          aria-label={t('steer-right', { defaultValue: 'Steer right' })}
          {...steer('right')}
        />
      </div>
    );
  }

  // ── Handheld mode ──
  const button =
    'pointer-events-auto select-none rounded-full flex items-center justify-center ' +
    'border border-white/20 backdrop-blur-[2px] transition-colors';
  // vmin keeps the pad proportional on every screen, portrait or landscape.
  const size = { width: 'clamp(52px, 11vmin, 84px)', height: 'clamp(52px, 11vmin, 84px)' };
  const smallSize = { width: 'clamp(44px, 9vmin, 68px)', height: 'clamp(44px, 9vmin, 68px)' };

  return (
    <>
      {/* Utility row, clear of the notch and the back button */}
      <div
        className="pointer-events-none absolute z-40 flex gap-2"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.65rem)', right: '0.65rem' }}
      >
        {showRecenter && (
          <button
            type="button"
            onClick={onRecenter}
            className={`${button} pointer-events-auto h-10 w-10 bg-black/50 active:bg-white/20`}
            aria-label={t('recenter-view', { defaultValue: 'Recenter view' })}
          >
            <RotateCcw className="h-4 w-4 text-white/75" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onPause}
          className={`${button} pointer-events-auto h-10 w-10 bg-black/50 active:bg-white/20`}
          aria-label={t('pause', { defaultValue: 'Pause' })}
        >
          <Pause className="h-4 w-4 text-white/75" aria-hidden="true" />
        </button>
      </div>

      {/* Driving pad */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
        style={{ touchAction: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="flex items-end justify-between px-4">
          {/* Steering */}
          <div className="pointer-events-auto flex items-center gap-3">
            <button
              type="button"
              className={`${button} bg-white/10 active:bg-white/25`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('steer-left', { defaultValue: 'Steer left' })}
              {...bind('left')}
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/70" fill="currentColor" aria-hidden="true">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <button
              type="button"
              className={`${button} bg-white/10 active:bg-white/25`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('steer-right', { defaultValue: 'Steer right' })}
              {...bind('right')}
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/70" fill="currentColor" aria-hidden="true">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>

          {/* Boost */}
          <div className="pointer-events-auto" style={{ marginBottom: '1.1rem' }}>
            <button
              type="button"
              className={`${button} border-orange-400/35 bg-orange-500/20 active:bg-orange-500/45`}
              style={{ ...smallSize, touchAction: 'none' }}
              aria-label={t('boost', { defaultValue: 'BOOST' })}
              {...bind('boost')}
            >
              <span className="text-[11px] font-black tracking-wider text-orange-300">NOS</span>
            </button>
          </div>

          {/* Throttle + brake */}
          <div className="pointer-events-auto flex flex-col gap-3">
            <button
              type="button"
              className={`${button} border-green-400/25 bg-green-500/15 active:bg-green-500/35`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('accelerate', { defaultValue: 'Accelerate' })}
              {...bind('up')}
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-green-300/75" fill="currentColor" aria-hidden="true">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
              </svg>
            </button>
            <button
              type="button"
              className={`${button} border-red-400/25 bg-red-500/15 active:bg-red-500/35`}
              style={{ ...size, touchAction: 'none' }}
              aria-label={t('brake', { defaultValue: 'Brake' })}
              {...bind('down')}
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-red-300/75" fill="currentColor" aria-hidden="true">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
