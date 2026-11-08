'use client';

/**
 * Hooks and actions over the learn store's input hub, shared by the input
 * setup dialog, the on-screen keyboard, calibration and the first lesson.
 * Everything here subscribes in an effect and unsubscribes on unmount; none of
 * it starts the microphone or MIDI on its own (`chooseInput` is called from a
 * click, which is what iOS needs to grant them).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { playNote, MAX_VOICES } from '@/lib/rmhmusic/learn/audio/voice';
import type { InputSource, NoteEvent } from '@/lib/rmhmusic/learn/input/events';
import type { MidiDevice } from '@/lib/rmhmusic/learn/input/midi';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import { subscribeMicLevel, useLearnStore } from '@/lib/rmhmusic/learn/store';

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

/** Sources that need a device or a permission, as opposed to keys on screen. */
const DEVICE_INPUTS: ReadonlyArray<LearnInput> = ['mic', 'midi'];

/**
 * Switch to `next`: stop the previous interactive source, start the new one,
 * and save it to the profile. The microphone and MIDI are saved only once they
 * have started, so a blocked permission does not leave the profile pointing at
 * an input that cannot play. Resolves to false when the start failed (the
 * reason is in `hub.lastError(next)`). Call from a click for mic and MIDI.
 */
export async function chooseInput(next: LearnInput): Promise<boolean> {
  const { hub, profile, setInput } = useLearnStore.getState();
  if (!hub) return false;
  const previous = profile?.input;
  // The on-screen keys stay started: they only emit while someone presses them.
  for (const source of ['keys', 'mic', 'midi'] as const) {
    if (source !== next && (source === previous || hub.active().includes(source))) {
      hub.stop(source);
    }
  }
  try {
    await hub.start(next);
  } catch {
    return false;
  }
  if (DEVICE_INPUTS.includes(next) && !hub.active().includes(next)) return false;
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
