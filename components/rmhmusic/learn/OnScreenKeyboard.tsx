'use client';

/**
 * OnScreenKeyboard — a two-octave piano (C4–B5) played by touch, mouse or
 * keyboard focus. Each pointer is tracked on its own, so several fingers can
 * hold a chord, and sliding a finger along the keys plays each one it reaches.
 * Notes go through the store's on-screen-keys input (`screen.press/release`),
 * so the lesson hears them exactly as it hears MIDI or the mic; keys light up
 * for a note from ANY source.
 *
 * The keys are a play-field (`data-jelly-zone="playfield"`): no jelly body or
 * arcs on them, and `touch-action: none` so a press is never taken for a
 * scroll. On a narrow phone the keyboard scrolls sideways inside its own box
 * (each white key stays at least 44px wide); the page never does.
 */

import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { cn } from '@/lib/utils';
import { useSoundingNotes } from './useLearnInput';

const FIRST = 60; // C4
const LAST = 83; // B5
const WHITE_SEMITONES = new Set([0, 2, 4, 5, 7, 9, 11]);
/** Smallest white-key width, so every key is a comfortable tap target. */
const MIN_WHITE_PX = 44;
/** A black key's width as a share of a white key's. */
const BLACK_SHARE = 0.62;

interface PianoKey {
  midi: number;
  name: string;
  black: boolean;
  /** White keys to the left of this key. */
  whiteBefore: number;
}

const KEYS: PianoKey[] = (() => {
  const out: PianoKey[] = [];
  let whites = 0;
  for (let midi = FIRST; midi <= LAST; midi++) {
    const black = !WHITE_SEMITONES.has(midi % 12);
    out.push({ midi, name: midiToName(midi), black, whiteBefore: whites });
    if (!black) whites++;
  }
  return out;
})();
const WHITE_COUNT = KEYS.filter((k) => !k.black).length;
const WHITE_PCT = 100 / WHITE_COUNT;

export function OnScreenKeyboard({ className }: { className?: string }) {
  const { t } = useTranslation('c-rmhmusic');
  const screen = useLearnStore((s) => s.screen);
  const hub = useLearnStore((s) => s.hub);
  const sounding = useSoundingNotes();

  /** pointerId → the note that pointer is holding. */
  const pointers = useRef(new Map<number, number>());
  /** Pointers pressed down on the keyboard and not yet lifted, for sliding across keys. */
  const down = useRef(new Set<number>());
  /** Notes held by keyboard focus (Space / Enter). */
  const focusHeld = useRef(new Set<number>());

  // The hub forwards only started sources; the on-screen keys start with nothing to open.
  useEffect(() => {
    void hub?.start('screen').catch(() => {});
  }, [hub]);

  const holders = (midi: number) =>
    [...pointers.current.values()].filter((m) => m === midi).length +
    (focusHeld.current.has(midi) ? 1 : 0);

  const release = (midi: number) => {
    if (holders(midi) === 0) screen?.release(midi);
  };

  // Let go of everything still down when the keyboard goes away.
  useEffect(() => {
    const ptrs = pointers.current;
    const held = focusHeld.current;
    return () => {
      const notes = new Set([...ptrs.values(), ...held]);
      ptrs.clear();
      held.clear();
      for (const midi of notes) screen?.release(midi);
    };
  }, [screen]);

  const pointerOn = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev === midi) return;
    pointers.current.set(e.pointerId, midi);
    if (prev !== undefined) release(prev);
    screen?.press(midi);
  };

  const pointerOff = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (pointers.current.get(e.pointerId) !== midi) return;
    pointers.current.delete(e.pointerId);
    release(midi);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    // Touch pointers are captured to the first key implicitly; let go so that
    // sliding onto the next key fires its enter (and this key's leave).
    const el = e.currentTarget;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    down.current.add(e.pointerId);
    pointerOn(e, midi);
  };

  const onPointerEnter = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    // A glissando: only a pointer pressed on the keyboard, and still pressed, plays.
    if (down.current.has(e.pointerId) && (e.buttons & 1) === 1) pointerOn(e, midi);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, midi: number) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || focusHeld.current.has(midi)) return;
    focusHeld.current.add(midi);
    screen?.press(midi);
  };

  const keyOff = (midi: number) => {
    if (!focusHeld.current.delete(midi)) return;
    release(midi);
  };

  const keyClass = (key: PianoKey, lit: boolean) =>
    key.black
      ? cn(
          'absolute top-0 z-10 h-[60%] border border-(--app-border) transition-colors',
          lit ? 'bg-(--app-accent) text-(--app-accent-fg)' : 'bg-(--app-bg) text-(--app-text-dim)',
        )
      : cn(
          'relative flex h-full flex-1 items-end justify-center border border-(--app-border) pb-2 text-xs font-medium transition-colors',
          lit
            ? 'bg-(--app-accent) text-(--app-accent-fg)'
            : 'bg-(--app-surface) text-(--app-text-muted)',
        );

  return (
    <div
      className={cn('w-full overflow-x-auto rounded-(--app-radius-sm)', className)}
      data-jelly-zone="playfield"
      role="group"
      aria-label={t('keyboard-label', { defaultValue: 'Piano keyboard, C4 to B5' })}
    >
      <div
        className="relative flex h-40 w-full select-none sm:h-48"
        style={{ minWidth: WHITE_COUNT * MIN_WHITE_PX }}
        onPointerUp={(e) => down.current.delete(e.pointerId)}
        onPointerCancel={(e) => down.current.delete(e.pointerId)}
      >
        {KEYS.map((key) => {
          const lit = sounding.has(key.midi);
          const letter = key.name.replace(/-?\d+$/, '');
          return (
            <button
              key={key.midi}
              type="button"
              aria-label={key.name}
              aria-pressed={lit}
              className={keyClass(key, lit)}
              style={{
                touchAction: 'none',
                ...(key.black
                  ? {
                      left: `${(key.whiteBefore - BLACK_SHARE / 2) * WHITE_PCT}%`,
                      width: `${BLACK_SHARE * WHITE_PCT}%`,
                    }
                  : null),
              }}
              onPointerDown={(e) => onPointerDown(e, key.midi)}
              onPointerEnter={(e) => onPointerEnter(e, key.midi)}
              onPointerUp={(e) => pointerOff(e, key.midi)}
              onPointerCancel={(e) => pointerOff(e, key.midi)}
              onPointerLeave={(e) => pointerOff(e, key.midi)}
              onKeyDown={(e) => onKeyDown(e, key.midi)}
              onKeyUp={() => keyOff(key.midi)}
              onBlur={() => keyOff(key.midi)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {!key.black && (
                <span aria-hidden="true">{key.midi % 12 === 0 ? key.name : letter}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
