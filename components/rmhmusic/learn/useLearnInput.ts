'use client';

/**
 * Hooks and actions over the learn store's input hub, shared by the input
 * setup dialog, the on-screen keyboard, calibration and the first lesson.
 * Everything here subscribes in an effect and unsubscribes on unmount; none of
 * it starts the microphone or MIDI on its own (`chooseInput` is called from a
 * click, which is what iOS needs to grant them).
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { playNote, MAX_VOICES } from '@/lib/rmhmusic/learn/audio/voice';
import type { InputSource, NoteEvent } from '@/lib/rmhmusic/learn/input/events';
import type { InputPhases } from '@/lib/rmhmusic/learn/input/hub';
import { bindMicRelease, startMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import { switchInput } from '@/lib/rmhmusic/learn/input/switch';
import type { MidiDevice } from '@/lib/rmhmusic/learn/input/midi';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import { subscribeMicLevel, useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';

/** Run `fn` for every note event while mounted (and while the hub exists). */
export function useNoteEvents(fn: (e: NoteEvent) => void): void {
  const hub = useLearnStore((s) => s.hub);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!hub) return;
    return hub.subscribe((e) => ref.current(e));
  }, [hub]);
}

/** MIDI notes currently sounding from any source, for highlighting keys. */
export function useSoundingNotes(): ReadonlySet<number> {
  // `${source}:${midi}` so a note held on two inputs stays lit until both let go.
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  useNoteEvents((e) => {
    const key = `${e.source}:${e.midi}`;
    setHeld((prev) => {
      if ((e.type === 'on') === prev.has(key)) return prev;
      const next = new Set(prev);
      if (e.type === 'on') next.add(key);
      else next.delete(key);
      return next;
    });
  });
  return useMemo(() => new Set([...held].map((k) => Number(k.slice(k.indexOf(':') + 1)))), [held]);
}

/** The latest `on` event, optionally from one source only. */
export function useLastNote(source?: InputSource): NoteEvent | null {
  const [last, setLast] = useState<NoteEvent | null>(null);
  useNoteEvents((e) => {
    if (e.type === 'on' && (!source || e.source === source)) setLast(e);
  });
  return last;
}

/**
 * Sound the notes played on the on-screen and computer keys (a MIDI keyboard
 * has its own sound; the mic is the learner's own instrument). Everything
 * still sounding is released on unmount. `enabled: false` (e.g. while the
 * timing check's pad is in use) starts no new notes.
 */
export function useNoteSound(enabled = true): void {
  const releases = useRef(new Map<string, () => void>());
  useNoteEvents((e) => {
    if (e.source !== 'screen' && e.source !== 'keys') return;
    // While disabled, still let go of notes that started before.
    if (!enabled && e.type === 'on') return;
    const key = `${e.source}:${e.midi}`;
    const map = releases.current;
    map.get(key)?.();
    map.delete(key);
    if (e.type === 'on') {
      map.set(key, playNote(e.midi, e.velocity));
      // The voice drops its oldest note past the cap; forget ours too.
      while (map.size > MAX_VOICES) {
        const oldest = map.keys().next().value as string;
        map.get(oldest)?.();
        map.delete(oldest);
      }
    }
  });
  useEffect(() => {
    const map = releases.current;
    return () => {
      for (const release of map.values()) release();
      map.clear();
    };
  }, []);
}

/** Connected MIDI devices, kept current as they are plugged in and out. */
export function useMidiDevices(): MidiDevice[] {
  const midi = useLearnStore((s) => s.midi);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  useEffect(() => {
    if (!midi) return;
    setDevices(midi.devices());
    return midi.onDevicesChange(() => setDevices(midi.devices()));
  }, [midi]);
  return devices;
}

/** Level updates faster than this are dropped: a meter needs ~15 fps, not 40. */
const LEVEL_MIN_INTERVAL_MS = 66;

/** The microphone's level, 0..1, throttled for a meter (0 while the mic is off). */
export function useMicLevel(): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let last = 0;
    const off = subscribeMicLevel((rms) => {
      const now = performance.now();
      if (now - last < LEVEL_MIN_INTERVAL_MS) return;
      last = now;
      // Speech and a plucked string sit around 0.02–0.2 RMS; scale so they fill the bar.
      setLevel(Math.min(1, rms * 5));
    });
    return () => {
      off();
      setLevel(0);
    };
  }, []);
  return level;
}

const NO_PHASES: InputPhases = { mic: 'idle', midi: 'idle', keys: 'idle', screen: 'idle' };
const noSubscribe = () => () => {};

/**
 * Every input source's lifecycle phase (`idle` / `starting` / `active` /
 * `stopping`), live: the screen re-renders when one changes, and only then.
 */
export function useInputPhases(): InputPhases {
  const hub = useLearnStore((s) => s.hub);
  return useSyncExternalStore(
    hub ? hub.onChange : noSubscribe,
    () => hub?.phases() ?? NO_PHASES,
    () => NO_PHASES,
  );
}

/**
 * Switch to `next` and save it to the profile. The new input starts before
 * the previous one stops (`switchInput`), so a failed switch leaves the old
 * input playing. The microphone and MIDI are saved only once they have
 * started, so a blocked permission does not leave the profile pointing at an
 * input that cannot play. Resolves to false when the start failed (the reason
 * is in `hub.lastError(next)`). Call from a click for mic and MIDI.
 */
export async function chooseInput(next: LearnInput): Promise<boolean> {
  const { hub, profile, setInput } = useLearnStore.getState();
  if (!hub) return false;
  const previous = profile?.input;
  if (!(await switchInput(hub, previous, next))) return false;
  if (previous !== next) await setInput(next);
  return true;
}

/**
 * Whether the browser already granted the mic or MIDI permission, so a lesson
 * can start it without a click. False when it cannot tell (Firefox has no
 * `midi` permission name; some browsers no Permissions API at all).
 */
export async function permissionGranted(source: 'mic' | 'midi'): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false;
    const name = (source === 'mic' ? 'microphone' : 'midi') as PermissionName;
    const status = await navigator.permissions.query({ name });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * For a screen that can start inputs (the home's setup dialog, a lesson): the
 * microphone stops when the page is hidden, on `pagehide` and when the screen
 * unmounts, and on unmount the computer keys stop listening too. Only the
 * devices stop; the saved input preference is untouched, and nothing restarts
 * by itself. Screens see the stop through `useInputPhases`; `onRelease` is
 * for anything else that must react to it.
 */
export function useInputRelease(onRelease?: () => void): void {
  const hub = useLearnStore((s) => s.hub);
  const ref = useRef(onRelease);
  useEffect(() => {
    ref.current = onRelease;
  });
  useEffect(() => {
    if (!hub) return;
    const unbind = bindMicRelease({
      hub,
      doc: document,
      win: window,
      onRelease: () => ref.current?.(),
    });
    return () => {
      unbind();
      hub.stop('keys');
    };
  }, [hub]);
}

/**
 * For a lesson: start the learner's chosen input on entry. The computer keys need no permission;
 * the mic and MIDI start by themselves only when the browser already granted them (and, for the
 * mic, sound is already running, which iOS ties to a tap) — otherwise the lesson shows the input
 * chooser, and its click starts them. Switching inputs mid-lesson goes through `chooseInput`,
 * which stops the old one; leaving the lesson is `useInputRelease`.
 */
export function useLessonInputStart(opts: { mic?: boolean } = {}): void {
  const withMic = opts.mic ?? true;
  const hub = useLearnStore((s) => s.hub);
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  useEffect(() => {
    if (!hub) return;
    let cancelled = false;
    if (input === 'keys') void hub.start('keys').catch(() => {});
    if ((input === 'mic' && withMic) || input === 'midi') {
      void (async () => {
        if (hub.phase(input) !== 'idle' || !(await permissionGranted(input))) return;
        if (input === 'mic' && getAudioContext()?.state !== 'running') return;
        if (cancelled) return;
        await (input === 'mic' ? startMic(hub) : hub.start(input)).catch(() => {});
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [hub, input, withMic]);
}
