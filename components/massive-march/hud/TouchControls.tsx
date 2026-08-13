/**
 * Massive March — playing this on a phone.
 *
 * A thumbstick on the left, look-drag anywhere on the right, and the four verbs
 * that matter as buttons. It writes into the same `input` object the keyboard
 * does, so nothing downstream knows or cares which one produced a movement.
 *
 * Deliberately not a full parity layer: rebinding, the gesture number keys and
 * push-to-talk-by-key have no touch equivalent, and the overlays cover those.
 * What it does guarantee is that walking, looking, picking things up, using what
 * you are holding and talking are all reachable with two thumbs — which is the
 * whole game minus the keyboard shortcuts.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, MessageSquare, Mic, Sparkles } from 'lucide-react';
import { input } from '@/lib/massive-march/input';
import { mm } from '@/lib/massive-march/net/client';
import { isTransmitting, setTransmitting } from '@/lib/massive-march/voice';
import { useMmStore } from '@/lib/massive-march/store';
import { BOARD, INK } from '../ui';

const STICK_RADIUS = 56;

export function TouchControls({ onInteract }: { onInteract: () => void }) {
  const { t } = useTranslation('c-massive-march');
  const setChatOpen = useMmStore((s) => s.setChatOpen);
  const setOverlay = useMmStore((s) => s.setOverlay);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const stickOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    // Touch means the look input is always live; there is no pointer to lock.
    input.looking = true;
    return () => {
      input.looking = false;
      input.moveX = 0;
      input.moveY = 0;
    };
  }, []);

  const onStickDown = useCallback((event: React.PointerEvent) => {
    stickId.current = event.pointerId;
    stickOrigin.current = { x: event.clientX, y: event.clientY };
    setKnob({ x: 0, y: 0 });
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }, []);

  const onStickMove = useCallback((event: React.PointerEvent) => {
    if (stickId.current !== event.pointerId) return;
    let dx = event.clientX - stickOrigin.current.x;
    let dy = event.clientY - stickOrigin.current.y;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) {
      dx = (dx / length) * STICK_RADIUS;
      dy = (dy / length) * STICK_RADIUS;
    }
    setKnob({ x: dx, y: dy });
    input.moveX = dx / STICK_RADIUS;
    input.moveY = -dy / STICK_RADIUS;
    // Pushing the stick to its edge is running; a partial push is a walk. No
    // separate run button, because there is no room for one.
    input.run = Math.hypot(dx, dy) > STICK_RADIUS * 0.86;
  }, []);

  const onStickUp = useCallback((event: React.PointerEvent) => {
    if (stickId.current !== event.pointerId) return;
    stickId.current = null;
    setKnob(null);
    input.moveX = 0;
    input.moveY = 0;
    input.run = false;
  }, []);

  const onLookDown = useCallback((event: React.PointerEvent) => {
    if (lookId.current !== null) return;
    lookId.current = event.pointerId;
    lookLast.current = { x: event.clientX, y: event.clientY };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }, []);

  const onLookMove = useCallback((event: React.PointerEvent) => {
    if (lookId.current !== event.pointerId) return;
    input.lookX += (event.clientX - lookLast.current.x) * 1.6;
    input.lookY += (event.clientY - lookLast.current.y) * 1.6;
    lookLast.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onLookUp = useCallback((event: React.PointerEvent) => {
    if (lookId.current !== event.pointerId) return;
    lookId.current = null;
  }, []);

  return (
    <>
      {/* Look surface: the right half of the screen, under everything else. */}
      <div
        // `data-gesture` (globals.css §user-select): this pane covers two thirds
        // of the screen and its whole job is to be dragged. Without it a look
        // sweep anchors a selection in whatever HUD text sits under the thumb.
        data-gesture=""
        className="absolute top-0 right-0 bottom-0 left-1/3 z-0"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      <div
        data-gesture=""
        className="absolute bottom-[calc(5.5rem+var(--safe-bottom))] left-[calc(1.5rem+var(--safe-left))] z-20 grid place-items-center rounded-full border-[3px] touch-none"
        style={{
          width: STICK_RADIUS * 2.2,
          height: STICK_RADIUS * 2.2,
          background: 'rgba(20,18,16,0.35)',
          borderColor: 'rgba(247,243,232,0.4)',
        }}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
        role="application"
        aria-label={t('touch-stick', { defaultValue: 'Move' })}
      >
        <span
          aria-hidden
          className="pointer-events-none block size-12 rounded-full border-[3px]"
          style={{
            background: BOARD,
            borderColor: INK,
            transform: knob ? `translate(${knob.x}px, ${knob.y}px)` : undefined,
          }}
        />
      </div>

      <div className="absolute right-[calc(1rem+var(--safe-right))] bottom-[calc(5.5rem+var(--safe-bottom))] z-20 flex flex-col gap-2">
        <TouchButton label={t('touch-interact', { defaultValue: 'Take' })} onPress={onInteract}>
          <Hand aria-hidden className="size-5" />
        </TouchButton>
        <TouchButton label={t('touch-use', { defaultValue: 'Use' })} onPress={() => mm.use()}>
          <Sparkles aria-hidden className="size-5" />
        </TouchButton>
        <TouchButton
          label={t('touch-talk', { defaultValue: 'Talk' })}
          onPress={() => setTransmitting(!isTransmitting())}
        >
          <Mic aria-hidden className="size-5" />
        </TouchButton>
        <TouchButton
          label={t('touch-say', { defaultValue: 'Type' })}
          onPress={() => setChatOpen(true)}
        >
          <MessageSquare aria-hidden className="size-5" />
        </TouchButton>
        <TouchButton
          label={t('touch-signal', { defaultValue: 'Signal' })}
          onPress={() => setOverlay('gestures')}
        >
          <span aria-hidden className="text-lg leading-none">
            👋
          </span>
        </TouchButton>
      </div>

      <button
        type="button"
        className="absolute bottom-[calc(1.5rem+var(--safe-bottom))] left-1/2 z-20 -translate-x-1/2 cursor-pointer border-[3px] px-6 py-2 text-xs font-black tracking-widest uppercase"
        style={{ background: BOARD, borderColor: INK, color: INK, borderRadius: 3 }}
        onPointerDown={() => {
          input.jump = true;
        }}
      >
        {t('touch-jump', { defaultValue: 'Jump' })}
      </button>
    </>
  );
}

function TouchButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPress}
      className="grid size-14 cursor-pointer place-items-center border-[3px]"
      style={{ background: BOARD, borderColor: INK, color: INK, borderRadius: 3 }}
    >
      {children}
    </button>
  );
}
