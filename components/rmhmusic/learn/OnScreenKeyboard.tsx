'use client';

/**
 * OnScreenKeyboard — a piano played by touch, mouse or keyboard focus. Each pointer is tracked on
 * its own, so several fingers can hold a chord, and sliding a finger along the keys plays each one
 * it reaches. Who holds which key is the pure machine in `machines/key-holds.ts`; this component
 * turns its press/release effects into `screen.press/release`, so the lesson hears the keys
 * exactly as it hears MIDI or the mic; keys light up for a note from ANY source.
 *
 * It fits its width: as many whole white keys of 44px or more as fit (7 on a small phone, two
 * octaves from 616px), counted by CSS container queries so nothing moves after mount
 * (`lib/rmhmusic/learn/keyboard-layout.ts`). On a phone the octave buttons — or a swipe along the
 * thin strip above the keys, never on the keys themselves — move the window an octave at a time;
 * no key is reachable only by scrolling. Keys out of view are taken out of the tab order.
 *
 * The keys are a play-field (`data-jelly-zone="playfield"`) and `touch-action: none`, so a press is
 * never taken for a scroll. The route is native-material (no arcs, no soft body), so the marker is
 * belt and braces: a key press is latency-critical input and must never reach a jelly service,
 * even in the frame before `html.native-material` is stamped on a client navigation.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BLACK_SHARE,
  DEFAULT_OCTAVE,
  MAX_OCTAVE,
  MIN_OCTAVE,
  clampOctave,
  inView,
  swipeShift,
  whiteKeysFor,
  windowKeys,
  type PianoKey,
} from '@/lib/rmhmusic/learn/keyboard-layout';
import { keyHoldsMachine, type Event as HoldEvent } from '@/lib/rmhmusic/learn/machines/key-holds';
import { createRunner } from '@/lib/rmhmusic/learn/machines/runner';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { cn } from '@/lib/utils';
import { SECONDARY_BUTTON } from './buttons';
import { Notehead } from './Notehead';
import { useSoundingNotes } from './useLearnInput';

/**
 * The octave buttons: icon-only, so their edge is what shows them as controls (`border-bright`,
 * 3:1 or more in both modes). At either end of the range they are `aria-disabled` rather than
 * `disabled`, so the button the learner is pressing keeps focus instead of dropping it to <body>
 * (`shift` already does nothing past the range).
 */
const OCTAVE_BUTTON = 'w-11 shrink-0 border-(--app-border-bright) px-0 aria-disabled:opacity-50';

/** How long after the keyboard goes away a stray click is still the lifted finger's. */
const GHOST_CLICK_MS = 700;

/** Cancel the next click anywhere in the document (within {@link GHOST_CLICK_MS}). */
function swallowNextClick() {
  if (typeof document === 'undefined') return;
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const timer = window.setTimeout(() => done(), GHOST_CLICK_MS);
  function done() {
    window.clearTimeout(timer);
    document.removeEventListener('click', swallow, true);
  }
  document.addEventListener('click', swallow, true);
}

/** Memoised: it re-renders for its own lit keys, not for every render of the lesson around it. */
export const OnScreenKeyboard = memo(function OnScreenKeyboard({
  className,
  tall = false,
  startOctave = DEFAULT_OCTAVE,
  rightKey = null,
  wrongKey = null,
}: {
  className?: string;
  /** Taller keys, filling the note finder's board box (see `.rmm-find__board`). */
  tall?: boolean;
  /** The C the window opens on (octave number; C4 by default). Read once, on mount. */
  startOctave?: number;
  /**
   * Marks drawn on keys once a question is answered (the note finder): the right key gets a filled
   * notehead, a wrong key pressed an open one. Decoration: the lesson says the same in words.
   * Plain numbers, so the memo holds while nothing is marked.
   */
  rightKey?: number | null;
  wrongKey?: number | null;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const screen = useLearnStore((s) => s.screen);
  const hub = useLearnStore((s) => s.hub);
  const sounding = useSoundingNotes();
  const [octave, setOctave] = useState(() => clampOctave(startOctave));
  // Until measured (server render, first client render) every key counts as in view; measuring
  // changes only the tab order, never the layout.
  const [whites, setWhites] = useState(14);
  const bedRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const keys = windowKeys(octave);

  // Who holds which key (pointers, keyboard focus) is the pure machine in `machines/key-holds.ts`.
  // Nothing renders from it (keys light from the hub's notes), so it is held, not subscribed to.
  const [holds] = useState(() => createRunner(keyHoldsMachine));
  const send = (e: HoldEvent) => {
    for (const fx of holds.send(e)) {
      if (fx.type === 'press') screen?.press(fx.midi);
      else screen?.release(fx.midi);
    }
  };
  const releaseAll = () => {
    for (const fx of holds.send({ type: 'release-all' })) {
      if (fx.type === 'release') screen?.release(fx.midi);
    }
  };

  // The hub forwards only started sources; the on-screen keys start with nothing to open.
  useEffect(() => {
    void hub?.start('screen').catch(() => {});
  }, [hub]);

  // A finger is on a key. If a note makes the screen replace the keyboard (the first lesson
  // completes on its first note), the browser still sends that touch's click when the finger
  // lifts — to whatever now sits under it, such as the result card's link. So a keyboard that
  // goes away under a finger swallows the one click that follows.
  const touching = useRef(false);

  // Let go of everything still down when the keyboard goes away.
  useEffect(
    () => () => {
      releaseAll();
      if (touching.current) swallowNextClick();
    },
    [holds, screen], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const bed = bedRef.current;
    if (!bed || typeof ResizeObserver === 'undefined') return;
    const measure = () => setWhites(whiteKeysFor(bed.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bed);
    return () => observer.disconnect();
  }, []);

  const shift = (by: number) => {
    const next = clampOctave(octave + by);
    if (next === octave) return;
    // The keys under any finger are about to change: let go first so nothing sticks.
    releaseAll();
    setOctave(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    const primary = e.pointerType !== 'mouse' || e.button === 0;
    if (!primary) return;
    e.preventDefault();
    if (e.pointerType === 'touch') touching.current = true;
    // Touch pointers are captured to the first key implicitly; let go so that
    // sliding onto the next key fires its enter (and this key's leave).
    const el = e.currentTarget;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    send({ type: 'pointer-down', pointer: e.pointerId, midi, primary });
  };

  const onPointerEnter = (e: PointerEvent<HTMLButtonElement>, midi: number) =>
    send({ type: 'pointer-enter', pointer: e.pointerId, midi, pressed: (e.buttons & 1) === 1 });

  const pointerOff = (e: PointerEvent<HTMLButtonElement>, midi: number) =>
    send({ type: 'pointer-off', pointer: e.pointerId, midi });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, midi: number) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    send({ type: 'key-down', midi, key: e.key, repeat: e.repeat });
  };

  const keyClass = (key: PianoKey, lit: boolean) =>
    key.black
      ? cn(
          'rmm-keys__black absolute top-0 z-10 h-[60%] border border-(--rmm-key-black) transition-colors',
          lit ? 'bg-(--rmm-key-lit)' : 'bg-(--rmm-key-black)',
        )
      : cn(
          'rmm-keys__white relative flex h-full items-end justify-center border border-(--app-border-bright) pb-2 text-xs font-medium transition-colors',
          lit
            ? 'bg-(--rmm-key-lit) text-(--rmm-key-lit-ink)'
            : 'bg-(--rmm-key-white) text-(--rmm-key-white-ink)',
        );

  const from = midiToName(12 * (octave + 1));

  return (
    // The wrapper takes the document's direction, so the live region below reads in the page's
    // language. Only the octave row and the key bed are `dir="ltr"`: a piano runs low to high,
    // left to right, in every language, and under `dir="rtl"` the white keys would flow from the
    // right while the black keys keep their `left` offsets, so the black keys would sit over the
    // wrong gaps.
    <div className={cn('rmm-keys', className)} data-jelly-zone="playfield">
      <div dir="ltr" className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-disabled={octave <= MIN_OCTAVE || undefined}
          aria-label={t('keyboard-octave-down', { defaultValue: 'Lower octave' })}
          className={cn(SECONDARY_BUTTON, OCTAVE_BUTTON)}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        {/* A pointer-only shortcut for the two buttons beside it, so it is hidden from assistive tech. */}
        <div
          aria-hidden="true"
          className="rmm-keys__strip flex h-11 min-w-0 flex-1 items-center justify-center select-none"
          onPointerDown={(e) => {
            swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipe.current;
            swipe.current = null;
            if (start && start.id === e.pointerId) {
              shift(swipeShift(e.clientX - start.x, e.clientY - start.y));
            }
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
        >
          <span className="rmm-display rounded-(--app-radius-sm) bg-(--app-bg) px-2 text-base text-(--app-text-muted)">
            {from}
          </span>
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-disabled={octave >= MAX_OCTAVE || undefined}
          aria-label={t('keyboard-octave-up', { defaultValue: 'Higher octave' })}
          className={cn(SECONDARY_BUTTON, OCTAVE_BUTTON)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {t('keyboard-from', { note: from, defaultValue: 'Keyboard from {{note}}' })}
      </p>
      <div
        ref={bedRef}
        dir="ltr"
        role="group"
        aria-label={t('keyboard-label-from', {
          note: from,
          defaultValue: 'Piano keyboard from {{note}}',
        })}
        className={cn(
          'rmm-keys__bed relative flex rounded-(--app-radius-sm) select-none',
          tall ? 'rmm-keys__bed--tall' : 'h-40 sm:h-48',
        )}
        onPointerUp={(e) => {
          touching.current = false;
          send({ type: 'pointer-lift', pointer: e.pointerId });
        }}
        onPointerCancel={(e) => {
          touching.current = false;
          send({ type: 'pointer-lift', pointer: e.pointerId });
        }}
        onPointerLeave={(e) => send({ type: 'pointer-exit', pointer: e.pointerId })}
      >
        {keys.map((key) => {
          const lit = sounding.has(key.midi);
          const name = midiToName(key.midi);
          const letter = name.replace(/-?\d+$/, '');
          const shown = inView(key, whites);
          return (
            <button
              key={key.midi}
              type="button"
              aria-label={name}
              aria-pressed={lit}
              aria-hidden={shown ? undefined : true}
              tabIndex={shown ? undefined : -1}
              className={keyClass(key, lit)}
              style={{
                touchAction: 'none',
                ...(key.black
                  ? ({
                      '--rmm-at': key.whiteBefore - BLACK_SHARE / 2,
                      '--rmm-wb': key.whiteBefore,
                      '--rmm-share': BLACK_SHARE,
                    } as CSSProperties)
                  : null),
              }}
              onPointerDown={(e) => onPointerDown(e, key.midi)}
              onPointerEnter={(e) => onPointerEnter(e, key.midi)}
              onPointerUp={(e) => pointerOff(e, key.midi)}
              onPointerCancel={(e) => pointerOff(e, key.midi)}
              onPointerLeave={(e) => pointerOff(e, key.midi)}
              onKeyDown={(e) => onKeyDown(e, key.midi)}
              onKeyUp={(e) => send({ type: 'key-up', midi: key.midi, key: e.key })}
              onBlur={() => send({ type: 'blur', midi: key.midi })}
              onContextMenu={(e) => e.preventDefault()}
            >
              {(rightKey === key.midi || wrongKey === key.midi) && (
                <Notehead
                  kind={rightKey === key.midi ? 'filled' : 'open'}
                  className={cn(
                    'absolute left-1/2 h-4 w-5 -translate-x-1/2',
                    key.black ? 'bottom-3' : 'bottom-8',
                    rightKey === key.midi
                      ? 'text-(--app-accent)'
                      : key.black
                        ? 'text-(--rmm-key-white)'
                        : 'text-(--app-danger)',
                  )}
                />
              )}
              {!key.black && <span aria-hidden="true">{key.midi % 12 === 0 ? name : letter}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
});
