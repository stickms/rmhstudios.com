'use client';

/**
 * On-screen controls for Forest Explorer on phones and tablets.
 *
 * Left half: a floating stick (appears under the thumb that lands). Right half:
 * a look pad (drag to turn). Buttons float over the right edge. The two pads
 * are separate elements so each owns its own pointer capture and both thumbs
 * work at once. Everything writes into `touchInput` / dispatches the same key
 * codes the keyboard path already handles, so the game logic has one input
 * vocabulary.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resetTouchInput, tapKey, touchInput } from './touchInput';

const STICK_RADIUS = 56;
const LOOK_SENSITIVITY = 0.0055;

export interface TouchAction {
  id: string;
  /** KeyboardEvent.code dispatched on tap. */
  code: string;
  label: string;
  ariaLabel: string;
}

interface Props {
  actions: TouchAction[];
  onPause: () => void;
}

const BTN =
  'flex h-12 min-w-12 items-center justify-center rounded-full border border-white/20 bg-black/45 px-3 text-xs font-semibold text-white/85 active:bg-white/25';

export function TouchControls({ actions, onPause }: Props) {
  const { t } = useTranslation('c-forest-explorer');
  const stickOrigin = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookLast = useRef<{ id: number; x: number; y: number } | null>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    resetTouchInput();
    return resetTouchInput;
  }, []);

  const hideStick = () => {
    if (baseRef.current) baseRef.current.style.opacity = '0';
    touchInput.moveX = 0;
    touchInput.moveY = 0;
  };

  const onStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickOrigin.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    stickOrigin.current = { id: e.pointerId, x, y };
    const base = baseRef.current;
    if (base) {
      base.style.left = `${x - rect.left - STICK_RADIUS}px`;
      base.style.top = `${y - rect.top - STICK_RADIUS}px`;
      base.style.opacity = '1';
    }
    if (thumbRef.current) thumbRef.current.style.transform = 'translate(0px, 0px)';
  };

  const onStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = stickOrigin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    touchInput.moveX = dx / STICK_RADIUS;
    touchInput.moveY = -dy / STICK_RADIUS;
    if (thumbRef.current) thumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onStickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickOrigin.current?.id !== e.pointerId) return;
    stickOrigin.current = null;
    hideStick();
  };

  const onLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookLast.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookLast.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const l = lookLast.current;
    if (!l || l.id !== e.pointerId) return;
    touchInput.lookYaw += (e.clientX - l.x) * LOOK_SENSITIVITY;
    touchInput.lookPitch += (e.clientY - l.y) * LOOK_SENSITIVITY;
    l.x = e.clientX;
    l.y = e.clientY;
  };

  const onLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookLast.current?.id === e.pointerId) lookLast.current = null;
  };

  const toggleRun = useCallback(() => {
    touchInput.run = !touchInput.run;
    setRun(touchInput.run);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[48]">
      {/* Move pad */}
      <div
        className="pointer-events-auto absolute inset-y-0 left-0 w-1/2 touch-none"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
        onLostPointerCapture={onStickUp}
        data-testid="fe-move-pad"
      >
        <div
          ref={baseRef}
          aria-hidden="true"
          className="absolute rounded-full border border-white/25 bg-white/10 opacity-0"
          style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
        >
          <div
            ref={thumbRef}
            className="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full bg-white/35"
          />
        </div>
      </div>

      {/* Look pad */}
      <div
        className="pointer-events-auto absolute inset-y-0 right-0 w-1/2 touch-none"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
        onLostPointerCapture={onLookUp}
        data-testid="fe-look-pad"
      />

      {/* Buttons */}
      <div className="pointer-events-none absolute bottom-[calc(1rem+var(--safe-bottom))] right-[calc(1rem+var(--safe-right))] flex flex-col items-end gap-3">
        <div className="flex gap-3">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={a.ariaLabel}
              className={`${BTN} pointer-events-auto touch-none select-none`}
              onPointerDown={(e) => {
                e.preventDefault();
                tapKey(a.code);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            aria-pressed={run}
            aria-label={t('touch-run', { defaultValue: 'Run' })}
            className={`${BTN} pointer-events-auto touch-none select-none ${run ? 'bg-green-700/70' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              toggleRun();
            }}
          >
            {t('touch-run-short', { defaultValue: 'Run' })}
          </button>
          <button
            type="button"
            aria-label={t('touch-jump', { defaultValue: 'Jump' })}
            className={`${BTN} pointer-events-auto h-16 min-w-16 touch-none select-none`}
            onPointerDown={(e) => {
              e.preventDefault();
              tapKey('Space');
            }}
          >
            {t('touch-jump-short', { defaultValue: 'Jump' })}
          </button>
        </div>
      </div>

      {/* Pause */}
      <button
        type="button"
        aria-label={t('touch-pause', { defaultValue: 'Pause' })}
        className={`${BTN} pointer-events-auto absolute left-1/2 top-[calc(0.75rem+var(--safe-top))] -translate-x-1/2 touch-none select-none`}
        onPointerDown={(e) => {
          e.preventDefault();
          onPause();
        }}
      >
        ❚❚
      </button>
    </div>
  );
}
